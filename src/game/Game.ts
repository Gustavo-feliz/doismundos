import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { GameClock } from '../core/GameClock';
import { GameStateMachine } from '../core/GameState';
import { Input } from '../core/Input';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { DEFAULT_BINDINGS } from '../data/controls';
import { CUSTOMERS } from '../data/customers';
import { DIAGNOSTIC_CASES } from '../data/diagnosticCases';
import { DEFAULT_QUOTE_SETTINGS, PRICING } from '../data/pricing';
import { INITIAL_STOCK } from '../data/stock';
import { BANK_DEBT, ECONOMY } from '../data/economy';
import { DIALOGUES, MISSIONS } from '../data/missions';
import { TAKE_PART_MINUTES, UPGRADES } from '../data/upgrades';
import { CAR_COLORS, CUSTOMER_NAMES, SERVICE_TEMPLATES } from '../data/services';
import { findCoverageGaps } from '../parts/validate';
import { DataValidationError } from '../vehicles/types';
import { DialogueRunner } from '../missions/DialogueRunner';
import { MissionTracker, missionStateProblems, type CurrentObjective, type MissionEvent } from '../missions/MissionTracker';
import type { MissionWorld } from '../missions/conditions';
import { fillText, SPEAKER_NAME, type DialogueLine, type MissionFlag } from '../missions/types';
import { buildMissionLibrary, type MissionLibrary } from '../missions/validate';
import { SUPPLIERS } from '../data/suppliers';
import { ComputerPanel } from '../ui/ComputerPanel';
import { Sfx, type SfxName } from '../audio/Sfx';
import type { QuoteDraft } from '../orders/types';
import { buildComputerView, buildQuoteView, buildServiceView, buildStockView } from '../orders/views';
import { StockPanel } from '../ui/StockPanel';
import { SaveSlotsPanel, type SavesMode } from '../ui/SaveSlotsPanel';
import { SaveService } from '../save/SaveService';
import { IndexedDbSaveStore, MemorySaveStore } from '../save/SaveStore';
import type { SaveGame, SaveSummary, SlotId } from '../save/saveFile';
import { validateSessionSnapshot } from '../save/sessionSnapshot';
import { ORDER_STATUS_LABEL } from '../orders/types';
import { WORKSHOP_SIZE } from '../world/Workshop';
import { DrivingHud } from '../ui/DrivingHud';
import { resolveBindings } from '../core/bindings';
import { setUiBindings } from '../ui/keys';
import { TestDriveController } from './TestDriveController';
import { CityController } from './CityController';
import { CITY_NEIGHBORHOOD } from '../data/city';
import { scrapLotValue, validateCityData } from '../city/rules';
import type { CityLocationId } from '../city/types';
import { CityHud } from '../ui/CityHud';
import { FUNCTIONAL_TESTS, SCANNER } from '../data/diagnostics';
import { EQUIPMENT, EQUIPMENT_IDS } from '../data/equipment';
import { NEW_GAME } from '../data/newGame';
import { PART_SLOTS } from '../data/partSlots';
import { PARTS } from '../data/parts';
import { VEHICLES } from '../data/vehicles';
import { formatBRL } from '../economy/money';
import { WorkshopEquipment } from '../equipment/WorkshopEquipment';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { FirstPersonController } from '../player/FirstPersonController';
import { getBrowserStorage, qualityProfile, SettingsStore, type Settings } from '../save/settings';
import { showFatalError, showToast } from '../ui/ErrorOverlay';
import { formatKm } from '../ui/format';
import { Hud } from '../ui/Hud';
import { InspectionPanel, type PanelCloseReason, type PanelViews } from '../ui/InspectionPanel';
import { MenuScreen } from '../ui/MenuScreen';
import { disposeObject3D } from '../utils/dispose';
import { mergeStaticMeshes } from '../utils/mergeStatic';
import type { PartCondition } from '../parts/types';
import { buildCatalogs, type Catalogs } from '../vehicles/catalogs';
import { driveKm, installPart, removePart, revealPartCondition, setPartWear, type DomainResult } from '../vehicles/domain';
import { buildInspectionView } from '../vehicles/inspectionView';
import type { VehicleState } from '../vehicles/state';
import type { DiagnosticData } from '../diagnostics/rules';
import type { EquipmentContext } from '../diagnostics/types';
import { buildDiagnosisView } from '../diagnostics/view';
import { GameSession, type ActionOutcome, type GameMoment, type SessionContent } from './GameSession';
import { buildWorkshop, type Workshop } from '../world/Workshop';

/** Intervalo do autosave enquanto se joga (segundos reais). */
const AUTOSAVE_SECONDS = 60;
/** Distância (m) a partir do ponto inicial que conta como "andou" no tutorial. */
const WALKED_DISTANCE = 1.5;
const DEBUG = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
/** Força dos reflexos de ambiente com as luzes acesas. */
const ENVIRONMENT_INTENSITY = 0.35;
/** Para onde a câmera do menu olha (o carro no box 1). */
const MENU_CAMERA_TARGET = new THREE.Vector3(-1.6, 0.8, -1.2);

/**
 * Raiz de composição: cria os módulos, liga uns aos outros e define a ordem
 * de atualização. Regras de negócio não moram aqui.
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envMap: THREE.Texture;
  private readonly state: GameStateMachine;
  private readonly clock = new GameClock(NEW_GAME);
  private readonly input: Input;
  private readonly workshop: Workshop;
  private readonly player: FirstPersonController;
  private readonly equipment: WorkshopEquipment;
  private readonly interaction: InteractionSystem;
  private readonly hud: Hud;
  private readonly drivingHud: DrivingHud;
  /** Test drive (Prompt 13): pátio, física, câmera e painel. A oficina fica intacta enquanto isso. */
  private readonly testDrive: TestDriveController;
  /** Bairro de São Cristóvão (Prompt 14): rua, locais e painéis. */
  private readonly cityHud: CityHud;
  private readonly city: CityController;
  private smoothedFps = 60;
  private lastStaffClockMinute = NEW_GAME.startMinuteOfDay;
  private lastEventCheckDay = 1;
  private readonly inspection: InspectionPanel;
  private readonly stockPanel: StockPanel;
  private readonly computer: ComputerPanel;
  private readonly content: SessionContent;
  private readonly saves: SaveService;
  private readonly savesPanel: SaveSlotsPanel;
  private savesMode: SavesMode = 'load';
  /** Autosave: o que já foi salvo (sessão + versão) e o tempo desde o último. */
  private autosaved: { session: GameSession | null; version: number } = { session: null, version: -1 };
  private autosaveClock = 0;
  private autosaveBusy = false;
  private readonly sfx = new Sfx();
  private readonly catalogs: Catalogs;
  private session: GameSession;
  private readonly missionLib: MissionLibrary;
  private tracker: MissionTracker;
  private readonly dialogue: DialogueRunner;
  /** Cache do objetivo: só recalcula quando a sessão, as missões ou o dia mudam. */
  private missionKey = '';
  private objectiveCache: CurrentObjective | null = null;
  /** Último destaque enviado à cena (undefined = nenhum enviado ainda). */
  private highlightSent: string | null | undefined = undefined;
  private readonly diagnosticData: DiagnosticData = { scanner: SCANNER, functional: new Map(FUNCTIONAL_TESTS.map((t) => [t.id, t])) };
  private panelVersion = -1;
  private readonly menu: MenuScreen;
  private readonly settingsStore = new SettingsStore(getBrowserStorage());
  private settings: Settings;
  private readonly loop: Loop;
  private readonly cleanups: Array<() => void> = [];
  private frame = 0;
  private menuTime = 0;
  private needsRender = true;
  private maxDpr = 2;
  private debugDispose: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    // Dados primeiro: se estiverem inválidos, falha cedo com mensagem útil (GDD §21.3).
    this.catalogs = buildCatalogs(VEHICLES, PARTS, PART_SLOTS);
    const gaps = findCoverageGaps(VEHICLES, PARTS);
    if (gaps.length) throw new DataValidationError('cobertura do catálogo de peças', gaps);
    validateCityData(CITY_NEIGHBORHOOD);
    this.content = {
      cases: DIAGNOSTIC_CASES,
      diagnostics: this.diagnosticData,
      customers: CUSTOMERS,
      pricing: PRICING,
      initialStock: INITIAL_STOCK,
      defaultDraft: DEFAULT_QUOTE_SETTINGS,
      suppliers: SUPPLIERS,
      economy: ECONOMY,
      debt: BANK_DEBT,
      upgrades: UPGRADES,
      takePartMinutes: TAKE_PART_MINUTES,
      generator: { templates: SERVICE_TEMPLATES, names: CUSTOMER_NAMES, colors: CAR_COLORS },
    };
    this.missionLib = buildMissionLibrary(MISSIONS, DIALOGUES, Object.values(EQUIPMENT_IDS));
    this.tracker = new MissionTracker(this.missionLib);
    this.dialogue = new DialogueRunner(this.missionLib.dialogues);
    this.session = this.newSession();
    const store = IndexedDbSaveStore.available() ? new IndexedDbSaveStore() : new MemorySaveStore();
    this.saves = new SaveService(store, (game) => [
      ...validateSessionSnapshot(game.session, this.catalogs, (id) => GameSession.resolveCase(this.content, id, this.catalogs), this.content.upgrades),
      ...missionStateProblems(game.missions, this.missionLib),
    ]);
    this.savesPanel = new SaveSlotsPanel({
      onSave: (slot) => void this.saveTo(slot),
      onLoad: (slot) => void this.loadFrom(slot),
      onDelete: (slot) => void this.deleteSlot(slot),
      onBack: () => this.menu.showMain(),
    });
    const car = this.session.getVehicle(this.activeVehicleId);
    const vehicle = this.catalogs.models.get(car.modelId)!;

    this.settings = this.settingsStore.load();

    this.renderer = createRenderer(canvas);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 16 / 9, 0.05, 200);
    this.scene.background = new THREE.Color(0xb5d3ea);

    // Reflexos genéricos de ambiente (barato, gerado uma vez).
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envMap = this.pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = ENVIRONMENT_INTENSITY;

    this.workshop = buildWorkshop(vehicle, { color: car.color, plate: car.plate });
    this.scene.add(this.workshop.root);
    // Desempenho (QA, GDD §22): a rua vista pelo portão é cenário parado; juntar por material corta ~90 chamadas de desenho.
    const street = this.workshop.root.getObjectByName('PLACEHOLDER_rua');
    if (street) mergeStaticMeshes(street);
    this.player = new FirstPersonController(this.workshop.colliders, this.workshop.spawn);
    this.equipment = new WorkshopEquipment(this.workshop.parts, {
      onInspectVehicle: () => this.openInspection(),
      describeVehicle: () => this.describeActiveVehicle(),
      onOpenStock: () => this.openStock(),
      onOpenComputer: () => this.openComputer(),
      describeStock: () => this.describeStock(),
      onAmbientScale: (scale) => {
        this.scene.environmentIntensity = ENVIRONMENT_INTENSITY * scale;
      },
      testDriveBlocked: () => this.testDrive.blockedReason(),
      onTestDrive: () => void this.testDrive.start(),
      onExitToCity: () => void this.city.enter(),
    });
    this.interaction = new InteractionSystem(this.workshop.raycastTargets, EQUIPMENT.interactionRange);
    for (const interactable of this.equipment.createInteractables()) this.interaction.register(interactable);

    this.state = new GameStateMachine((from, to) => this.bus.emit('state:changed', { from, to }));
    this.input = new Input(canvas, DEFAULT_BINDINGS, (locked) => this.handlePointerLockChange(locked));

    this.hud = new Hud(uiRoot);
    this.drivingHud = new DrivingHud(uiRoot);
    this.testDrive = new TestDriveController(
      {
        scene: this.scene,
        camera: this.camera,
        input: this.input,
        catalogs: this.catalogs,
        session: () => this.session,
        activeVehicle: () => (this.session.activeCase ? this.session.getVehicle(this.activeVehicleId) : null),
        workshopRoot: () => this.workshop.root,
        reduceMotion: () => this.settings.reduceMotion,
        canStart: () => this.state.is('playing') && !this.city.active,
        onEnter: () => {
          this.player.halt();
          this.state.transition('driving');
        },
        onExit: () => {
          this.player.applyToCamera(this.camera);
          this.camera.updateMatrixWorld();
          if (this.state.is('driving')) this.state.transition('playing');
        },
        notify: (text, kind) => this.hud.notify(text, kind),
        playSound: (name) => this.sfx.play(name),
        assetFailed: (what, error) => this.assetFailed(what, error),
      },
      this.drivingHud,
    );
    this.cityHud = new CityHud(uiRoot, CITY_NEIGHBORHOOD, {
      onSelectMarker: (id) => void this.city.visit(id),
      onSellScrap: () => this.act(this.session.sellScrap(CITY_NEIGHBORHOOD.scrapRecoveryFactor, this.moment()), 'concluido'),
      onBuySalvage: (partId) => this.act(this.session.buySalvagePart(partId, CITY_NEIGHBORHOOD.salvagePriceFactor, this.moment()), 'pegar'),
      onBuySnack: (snack) => this.act(this.session.buySnack(snack.id, CITY_NEIGHBORHOOD.snacks, this.moment()), 'ok'),
      onClosePanel: (reason) => this.closePanel(reason),
    });
    this.city = new CityController(
      {
        scene: this.scene,
        camera: this.camera,
        input: this.input,
        settings: () => this.settings,
        workshopRoot: () => this.workshop.root,
        workshopPlayer: () => this.player,
        canEnter: () => this.state.is('playing') && !this.testDrive.active,
        isPlaying: () => this.state.is('playing'),
        enterPanel: () => this.enterPanel(),
        closeWorkshopPanels: () => {
          if (!this.state.is('panel')) return;
          this.inspection.close();
          this.stockPanel.close();
          this.computer.close();
          this.state.transition('playing');
        },
        openComputerAt: (tab) => {
          if (!this.enterPanel()) return;
          this.markFlag('abriu-computador');
          if (tab === 'caixa') this.markFlag('viu-caixa');
          this.computer.openAtTab(this.computerView(), tab);
        },
        advanceClock: (dt) => this.clock.advance(dt),
        setPrompt: (prompt) => this.hud.setPrompt(prompt),
        notify: (text, kind) => this.hud.notify(text, kind),
        playSound: (name) => this.sfx.play(name),
        assetFailed: (what, error) => this.assetFailed(what, error),
        markDirty: () => {
          this.needsRender = true;
        },
        panelData: () => {
          const scrap = scrapLotValue(this.session.scrap, this.catalogs, CITY_NEIGHBORHOOD.scrapRecoveryFactor);
          return {
            cashText: formatBRL(this.session.cash),
            scrapCount: scrap.count,
            scrapTotalText: formatBRL(scrap.totalCents),
            salvageOffers: this.session.salvageOffers(this.clock.day, CITY_NEIGHBORHOOD.salvagePriceFactor),
          };
        },
      },
      this.cityHud,
    );
    this.inspection = new InspectionPanel(uiRoot, (reason) => this.closePanel(reason), {
      diagnosis: {
        onRunTest: (id) => this.runDiagnosticTest(id),
        onHint: () => this.requestHint(),
        onConclude: (slot) => this.concludeDiagnosis(slot),
      },
      quote: {
        onDraftChange: (patch) => this.changeDraft(patch),
        onSend: () => this.act(this.session.sendQuote(this.moment()), 'ok'),
        onAcceptCounter: () => this.act(this.session.acceptCounter(this.moment()), 'ok'),
        onDismiss: () => this.act(this.session.dismissCustomer(this.moment()), 'ok'),
        onNextCase: () => this.nextCase(),
      },
      service: {
        onRemove: (slot) => this.act(this.session.removeOldPart(slot, this.equipmentContext(), this.moment()), 'ferramenta'),
        onInstall: (slot) => this.act(this.session.installHeldPart(slot, this.equipmentContext(), this.moment()), 'ferramenta'),
        onFinalTest: () => this.act(this.session.runFinalTest(this.equipmentContext(), this.moment()), 'ok'),
        onComplete: () => this.act(this.session.completeOrder(this.moment()), 'concluido'),
        onDeliver: () => this.act(this.session.deliverVehicle(this.moment()), 'concluido'),
        onNextCase: () => this.nextCase(),
      },
    });
    this.stockPanel = new StockPanel(uiRoot, {
      onTake: (lotId) => this.act(this.session.takePart(lotId), 'pegar'),
      onReturn: () => this.act(this.session.returnHeldPart(), 'pegar'),
      onClose: (reason) => this.closePanel(reason),
    });
    this.computer = new ComputerPanel(uiRoot, {
      onBuy: (partId, supplierId) => this.act(this.session.buyPart(partId, supplierId, 1, this.moment()), 'pegar'),
      onCancel: (id) => this.act(this.session.cancelPurchase(id, this.moment()), 'ok'),
      onWait: () => this.waitForDelivery(),
      onPayDebt: () => this.act(this.session.payDebtInstallment(this.moment()), 'concluido'),
      onBuyUpgrade: (id) => this.buyUpgrade(id),
      onHire: (id) => this.act(this.session.hireEmployee(id, this.moment()), 'concluido'),
      onTogglePause: (id) => this.act(this.session.togglePauseEmployee(id), 'ok'),
      onFire: (id) => this.act(this.session.fireEmployee(id), 'ok'),
      onPayPayroll: () => this.act(this.session.payStaffPayroll(this.moment()), 'concluido'),
      onEnqueueTask: (stdId) => this.act(this.session.enqueueStandardStaffTask(stdId), 'ok'),
      onAdvanceStaff: () => this.advanceStaffTurn(15),
      onTriggerEvent: (eventId) => this.act(this.session.triggerEvent(eventId, this.clock.day), 'ok'),
      onResolveEvent: (optionId) => this.act(this.session.resolveActiveEvent(optionId, this.moment()), 'concluido'),
      onTab: (tab) => {
        if (tab === 'caixa') this.markFlag('viu-caixa');
      },
      onClose: (reason) => this.closePanel(reason),
    });
    this.menu = new MenuScreen(uiRoot, this.settings, {
      onStart: () => void this.requestPlay(true),
      onResume: () => void this.requestPlay(false),
      onQuitToTitle: () => this.quitToTitle(),
      onOpenSaves: (mode) => void this.openSaves(mode),
      onContinueSaved: () => void this.continueLatest(),
      onSettingsChange: (s) => this.bus.emit('settings:changed', { settings: s }),
    });

    this.bus.on('state:changed', ({ to }) => this.applyStateToUi(to));
    this.bus.on('settings:changed', ({ settings }) => this.applySettings(settings, true));
    this.applySettings(this.settings, false);
    // Cena e som escutam o barramento (destaque do tutorial, falas, missões, upgrades). Feito pelo Gemini.
    this.workshop.setReduceMotion(this.settings.reduceMotion);
    this.cleanups.push(this.workshop.bindEvents(this.bus));
    this.cleanups.push(this.sfx.bindEvents(this.bus));

    this.listen(window, 'keydown', this.handleKeyDown);
    this.listen(window, 'blur', this.handleWindowBlur);
    this.listen(window, 'resize', this.markDirty);
    this.listen(canvas, 'webglcontextlost', this.handleContextLost);

    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
      (error) => this.fail('O jogo encontrou um erro e foi interrompido', error),
    );
    this.loop.setFpsLimit(this.settings.fpsLimit);

    this.state.transition('menu');
    if (DEBUG) this.installDebugHooks();
    this.listen(document, 'visibilitychange', this.handleVisibility);
    void this.refreshContinue();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.debugDispose?.();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.input.dispose();
    this.bus.clear();
    this.hud.dispose();
    this.drivingHud.dispose();
    this.cityHud.dispose();
    this.testDrive.dispose();
    this.city.dispose();
    this.inspection.dispose();
    this.stockPanel.dispose();
    this.computer.dispose();
    this.sfx.dispose();
    this.menu.dispose();
    disposeObject3D(this.scene);
    this.envMap.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    delete window.__GAME_DIAGNOSTICS__;
    delete window.__GAME_TEST_HOOKS__;
  }

  // --- Ciclo de jogo -------------------------------------------------------

  /** Ordem explícita: entrada → equipamentos → jogador → relógio → câmera → mira/interação → HUD. */
  private update(dt: number): void {
    this.frame++;
    if (dt > 0.001 && dt < 0.5) {
      this.smoothedFps = Math.round(this.smoothedFps * 0.85 + (1 / dt) * 0.15);
    }
    if (this.state.is('playing')) {
      const mouse = this.input.consumeMouseDelta();
      if (this.city.active) {
        this.city.update(dt, mouse);
      } else {
        // Equipamentos antes do jogador: os colisores (carro no alto, gaveta) já valem neste quadro.
        this.equipment.update(dt, this.player.position);
        this.player.update(dt, this.input.getMoveIntent(), mouse, this.settings);
        this.clock.advance(dt);
        this.player.applyToCamera(this.camera);
        this.camera.updateMatrixWorld();
        this.hud.setPrompt(this.interaction.update(this.camera));
        if (this.input.wasActionPressed('interact')) {
          const result = this.interaction.interact();
          if (result) this.hud.notify(result.message, result.ok ? 'ok' : 'blocked');
        }
        if (this.input.wasActionPressed('openMap')) {
          void this.city.enter();
        }
        this.updatePlayerMissionInput(dt);
        this.needsRender = true;
      }
    } else if (this.state.is('driving')) {
      this.interaction.clearFocus();
      this.input.consumeMouseDelta(); // no test drive o mouse não gira a câmera
      this.testDrive.update(dt);
      this.clock.advance(dt);
      this.needsRender = true;
    } else {
      this.interaction.clearFocus();
      this.hud.setPrompt(null);
      this.input.consumeMouseDelta(); // descarta movimento fora do jogo
      if (this.state.is('menu')) {
        this.updateMenuCamera(dt);
        this.needsRender = true;
      }
    }

    if (this.state.is('playing', 'panel')) this.updateMissions();
    const mission = this.objectiveCache;
    this.hud.update({
      money: formatBRL(this.session.cash),
      day: this.clock.day,
      time: this.clock.formatTime(),
      objective: mission ? this.fill(mission.objective) : this.currentObjective(),
      objectiveLabel: mission ? `${mission.missionTitle} · passo ${mission.stepNumber} de ${mission.stepCount}` : 'Objetivo',
      objectiveDetail: mission && this.session.activeCase ? this.currentObjective() : null,
      tool: this.heldPartName() ?? 'Nada',
    });
    const playing = this.state.is('playing');
    this.hud.setTip(playing && mission && this.tracker.tipsEnabled ? this.fill(mission.tip) : null);
    this.hud.setDialogue(playing ? this.dialogueHud() : null);

    // Autosave a cada minuto real de jogo, só se algo mudou (não trava: é assíncrono).
    if (this.state.is('playing')) {
      this.autosaveClock += dt;
      if (this.autosaveClock >= AUTOSAVE_SECONDS) {
        this.autosaveClock = 0;
        void this.autosave();
      }
    }
    // Pedidos de peças e trabalho da equipe avançam conforme o relógio do jogo.
    if (this.state.is('playing', 'panel')) {
      this.receiveDeliveries();
      this.syncStaffProgress();
    }
    if (this.state.is('panel') && this.session.version !== this.panelVersion) this.refreshPanels();

    if (DEBUG) this.updateDiagnostics();
    this.input.endFrame();
  }

  private render(): void {
    if (resizeRenderer(this.renderer, this.camera, this.maxDpr)) this.needsRender = true;
    // Pausado: a imagem não muda, então não gasta GPU redesenhando.
    if (!this.needsRender) return;
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
  }

  /** Câmera lenta orbitando o carro atrás do menu inicial. */
  private updateMenuCamera(dt: number): void {
    if (!this.settings.reduceMotion) this.menuTime += dt;
    const angle = 0.9 + this.menuTime * 0.06;
    const t = MENU_CAMERA_TARGET;
    this.camera.position.set(t.x + Math.cos(angle) * 5.6, 2.3, t.z + Math.sin(angle) * 5.6);
    this.camera.lookAt(t);
  }

  // --- Estados -------------------------------------------------------------

  private async requestPlay(fresh: boolean): Promise<void> {
    if (!this.state.is('menu', 'paused', 'panel')) return;
    if (this.input.lockBypassEnabled) {
      this.enterPlaying(fresh);
      return;
    }
    this.menu.setBusy(true);
    this.menu.showMessage('');
    const result = await this.input.requestPointerLock();
    this.menu.setBusy(false);
    if (!result.ok) {
      // Vindo do painel, cai na pausa para o jogador poder clicar em "Continuar".
      if (this.state.is('panel')) this.state.transition('paused');
      this.menu.showMessage(result.reason);
      return;
    }
    this.enterPlaying(fresh);
  }

  // --- Inspeção do veículo -------------------------------------------------

  private openInspection(): void {
    if (!this.enterPanel()) return;
    this.markFlag('abriu-painel-carro');
    this.inspection.open(this.currentPanelViews());
  }

  private openStock(): void {
    if (!this.enterPanel()) return;
    this.stockPanel.open(buildStockView(this.session));
  }

  /** Entra no estado de painel: cursor livre, jogador parado, relógio parado. */
  private enterPanel(): boolean {
    if (!this.state.transition('panel')) return false;
    this.player.halt();
    this.input.exitPointerLock();
    this.panelVersion = this.session.version;
    return true;
  }

  private openComputer(): void {
    if (!this.enterPanel()) return;
    this.markFlag('abriu-computador');
    this.computer.open(this.computerView());
  }

  private computerView() {
    return buildComputerView(this.session, this.clock.absoluteMinutes, this.session.activeCase?.vehicle.id ?? null);
  }

  private refreshPanels(): void {
    if (this.inspection.isOpen) this.inspection.refresh(this.currentPanelViews());
    if (this.stockPanel.isOpen) this.stockPanel.refresh(buildStockView(this.session));
    if (this.computer.isOpen) this.computer.refresh(this.computerView());
    if (this.cityHud.isPanelOpen) this.cityHud.refreshPanel(this.city.panelView());
    this.panelVersion = this.session.version;
  }

  private receiveDeliveries(): void {
    const arrived = this.session.deliverDue(this.clock.absoluteMinutes);
    if (arrived.length === 0) return;
    const names = arrived.map((p) => `${p.qty}× ${this.catalogs.parts.get(p.partId)?.name ?? p.partId}`).join(', ');
    const text = `Chegou do fornecedor: ${names}. Já está nas estantes.`;
    if (this.state.is('panel')) this.activePanel().notify(text, 'ok');
    else this.hud.notify(text, 'ok');
    this.sfx.play('pegar');
  }

  /** "Esperar a entrega": o relógio pula até o próximo pedido chegar. */
  private waitForDelivery(): void {
    const next = this.session.nextDeliveryAt();
    if (next === null) return;
    const waited = Math.max(0, next - this.clock.absoluteMinutes);
    this.clock.advanceTo(next);
    this.computer.notify(`Você esperou ${waited} min.`, 'ok');
    this.receiveDeliveries();
    this.syncStaffProgress();
  }

  /** Avança as tarefas da equipe sempre que o relógio de jogo avançar. */
  private syncStaffProgress(): void {
    const now = this.clock.absoluteMinutes;
    if (now <= this.lastStaffClockMinute) {
      this.lastStaffClockMinute = now;
      return;
    }
    const delta = now - this.lastStaffClockMinute;
    this.lastStaffClockMinute = now;
    const completed = this.session.advanceStaff(delta, this.moment());
    if (completed.length > 0) {
      const text = completed.map((t) => t.resultText).filter(Boolean).join(' · ');
      if (text) this.notifyAnywhere(text);
      this.sfx.play('concluido');
    }
    if (this.clock.day > this.lastEventCheckDay) {
      this.lastEventCheckDay = this.clock.day;
      const triggered = this.session.checkEventTriggers(this.clock.day);
      if (triggered) {
        this.notifyAnywhere(`Ocorrência na oficina: ${triggered.title} (abra o computador → aba Oficina)`);
      }
    }
  }

  /** Acompanha o turno da equipe pelo computador (+15 min). */
  private advanceStaffTurn(minutes: number): void {
    this.clock.addMinutes(minutes);
    this.syncStaffProgress();
    this.receiveDeliveries();
  }

  private activePanel(): { notify(text: string, kind: 'ok' | 'warn' | 'blocked'): void } {
    if (this.cityHud.isPanelOpen) return this.cityHud;
    if (this.computer.isOpen) return this.computer;
    if (this.stockPanel.isOpen) return this.stockPanel;
    return this.inspection;
  }

  private closePanel(reason: PanelCloseReason): void {
    if (!this.state.is('panel')) return;
    if (reason === 'pause') this.state.transition('paused');
    else void this.requestPlay(false);
  }

  /** Resultado de uma ação: gasta o tempo no relógio, avisa no painel aberto e toca um som. */
  private act(outcome: ActionOutcome, sound: SfxName): void {
    if (outcome.minutes > 0) this.clock.addMinutes(outcome.minutes);
    const tone = outcome.tone ?? (outcome.ok ? 'ok' : 'blocked');
    if (outcome.message) this.activePanel().notify(outcome.message, tone);
    this.sfx.play(tone === 'blocked' ? 'erro' : sound);
  }

  private changeDraft(patch: Partial<QuoteDraft>): void {
    const c = this.session.activeCase;
    if (!c) return;
    const result = this.session.updateDraft(c.id, patch);
    if (!result.ok) this.act(result, 'erro');
  }

  private heldPartName(): string | null {
    const id = this.session.heldPartId;
    return id ? (this.catalogs.parts.get(id)?.name ?? id) : null;
  }

  private describeStock(): string {
    const total = this.session.stock.reduce((sum, e) => sum + e.qty, 0);
    const held = this.heldPartName();
    return held ? `Em mãos: ${held}` : `${total} peça(s) nas estantes`;
  }

  private currentPanelViews(): PanelViews {
    const c = this.session.activeCase;
    return {
      inspection: buildInspectionView(this.session.getVehicle(this.activeVehicleId), this.catalogs),
      diagnosis: c
        ? buildDiagnosisView(c, this.session.getProgress(c.id), this.catalogs, this.diagnosticData, this.equipmentContext(), {
            assist: this.settings.diagnosisAssist,
            hintAvailable: this.session.hasHint(),
            caseNumber: this.session.caseNumber,
            totalCases: this.session.caseCount,
            examSpeed: this.session.examSpeed,
          })
        : null,
      quote: c ? buildQuoteView(this.session, c.id, this.clock.day) : null,
      service: c ? buildServiceView(this.session, c.id, this.equipmentContext(), this.clock.absoluteMinutes) : null,
      orderStatus: c ? this.session.getOrder(c.id).status : null,
    };
  }

  // --- Diagnóstico (ordens de serviço) -------------------------------------

  private newSession(): GameSession {
    // Semente nova a cada jogo: as OS geradas mudam de um jogo para outro, mas se repetem ao carregar.
    return new GameSession(this.catalogs, [], this.content, Math.floor(Math.random() * 0x7fffffff));
  }

  /** O carro do box 1 é o da OS ativa. */
  private get activeVehicleId(): string {
    return (this.session.activeCase ?? DIAGNOSTIC_CASES[0]!).vehicle.id;
  }

  private equipmentContext(): EquipmentContext {
    const e = this.equipment.snapshot();
    return { hoodOpen: e.hood === 'extended', liftUp: e.lift === 'extended', liftDown: e.lift === 'retracted' };
  }

  private moment(): GameMoment {
    return { day: this.clock.day, time: this.clock.formatTime(), at: this.clock.absoluteMinutes };
  }

  /** Exame: registra no horário de início e gasta o tempo dele no relógio do jogo. */
  private runDiagnosticTest(testId: string): void {
    const result = this.session.runDiagnosticTest(testId, this.equipmentContext(), this.moment());
    if (!result.ok) {
      this.act({ ok: false, message: result.error.message, minutes: 0 }, 'erro');
      return;
    }
    this.act({ ok: true, message: `${result.value.testName}: concluído (+${result.value.minutes} min)`, minutes: result.value.minutes }, 'ferramenta');
  }

  private requestHint(): void {
    if (!this.settings.diagnosisAssist) return;
    if (!this.session.requestHint()) this.inspection.notify('O Seu Zé não tem mais dicas para este caso.', 'blocked');
  }

  private concludeDiagnosis(slot: string): void {
    const result = this.session.concludeActiveCase(slot, this.moment());
    this.act({ ok: result.ok, message: result.ok ? 'Diagnóstico registrado. Agora monte o orçamento.' : result.error.message, minutes: 0 }, 'ok');
  }

  /** Próxima OS: outro carro chega ao box 1 (elevador e capô voltam ao normal). */
  private nextCase(): void {
    if (!this.session.advanceCase()) return;
    this.equipment.reset();
    this.applyActiveCarLook();
    const c = this.session.activeCase!;
    this.act({ ok: true, message: `Nova ordem de serviço: OS #${c.orderNumber} — ${c.customerName}`, minutes: 0 }, 'ok');
    this.inspection.setTab('diagnostico');
  }

  private applyActiveCarLook(): void {
    const car = this.session.getVehicle(this.activeVehicleId);
    this.workshop.parts.setCarLook({ color: car.color, plate: car.plate });
    const model = this.catalogs.models.get(car.modelId);
    this.bus.emit('vehicle:changed', { modelId: car.modelId, category: model?.category ?? 'sedan', color: car.color, plate: car.plate });
  }

  // --- Test drive (Prompt 13) ----------------------------------------------

  /** Conteúdo carregado sob demanda falhou (rede, arquivo ausente): avisa e continua na oficina. */
  private assetFailed(what: string, error: unknown): void {
    console.warn(`[jogo] falha ao carregar ${what}`, error);
    this.hud.notify(`Não foi possível carregar ${what}. Verifique a conexão e recarregue a página.`, 'blocked');
    this.sfx.play('erro');
  }

  // --- Bairro e novos locais (Prompt 14) -----------------------------------

  // --- Ferramentas e upgrades (Prompt 11) ------------------------------------

  private buyUpgrade(id: string): void {
    const outcome = this.session.buyUpgrade(id, this.moment());
    this.act(outcome, 'concluido');
    if (outcome.ok) this.bus.emit('upgrade:changed', { upgradeId: id, level: this.session.upgradeLevel(id) });
  }

  /** Conta à cena o nível de cada item (jogo novo ou save carregado). */
  private announceUpgrades(): void {
    for (const d of this.session.upgradeDefs) this.bus.emit('upgrade:changed', { upgradeId: d.id, level: this.session.upgradeLevel(d.id) });
  }

  // --- Missões, tutorial e diálogos (Prompt 10) -----------------------------

  private resetMissions(tracker: MissionTracker): void {
    this.tracker = tracker;
    this.missionKey = '';
    this.objectiveCache = null;
    this.dialogue.update(0, null);
  }

  private markFlag(flag: MissionFlag): void {
    this.tracker.setFlag(flag);
  }

  private missionWorld(): MissionWorld {
    const c = this.session.activeCase;
    return {
      orderStatuses: this.session.allOrders().map((o) => o.status),
      activeOrderStatus: c ? this.session.getOrder(c.id).status : null,
      purchases: this.session.purchases.filter((p) => p.status !== 'cancelado').length,
      installmentsPaid: this.session.debt.paidCount,
      installmentOverdue: this.session.debtOverdue(this.clock.day),
    };
  }

  /** Reavalia a campanha só quando algo mudou (sessão, missões ou dia). */
  private updateMissions(): void {
    const key = `${this.session.version}|${this.tracker.revision}|${this.clock.day}`;
    if (key === this.missionKey) return;
    const world = this.missionWorld();
    this.applyMissionEvents(this.tracker.evaluate(world));
    this.objectiveCache = this.tracker.current(world);
    this.missionKey = `${this.session.version}|${this.tracker.revision}|${this.clock.day}`;
    const highlight = this.tracker.tipsEnabled ? (this.objectiveCache?.highlight ?? null) : null;
    if (highlight !== this.highlightSent) {
      this.highlightSent = highlight;
      this.bus.emit('tutorial:highlight', { targetId: highlight });
    }
  }

  private applyMissionEvents(events: readonly MissionEvent[]): void {
    for (const e of events) {
      if (e.type === 'step-started' || e.type === 'step-completed') {
        this.bus.emit('mission:step', { missionId: e.missionId, stepId: e.stepId, status: e.type === 'step-started' ? 'iniciado' : 'concluido' });
      } else if (e.type === 'mission-completed') {
        const m = e.mission;
        this.session.grantReward(m.reward.cash, `${m.title}: ${m.reward.text}`, this.moment());
        const reward = m.reward.cash > 0 ? ` +${formatBRL(m.reward.cash)}` : '';
        this.notifyAnywhere(`Missão concluída: ${m.title}.${reward}`);
        this.sfx.play('concluido');
        this.bus.emit('mission:completed', { missionId: m.id });
      }
    }
  }

  /** Teclas do tutorial (só com o jogo rodando): andar, escolher, pular fala, dicas. */
  private updatePlayerMissionInput(dt: number): void {
    const s = this.workshop.spawn;
    if (Math.hypot(this.player.position.x - s.x, this.player.position.z - s.z) > WALKED_DISTANCE) this.markFlag('andou');
    this.handleDialogueStep(this.dialogue.update(dt, this.tracker.dialogueQueue[0] ?? null));
    if (this.input.wasActionPressed('skipLine')) this.handleDialogueStep(this.dialogue.skip());
    const choice = (['choice1', 'choice2', 'choice3'] as const).findIndex((a) => this.input.wasActionPressed(a));
    if (choice >= 0) this.chooseDialogueOption(choice + 1);
    if (this.input.wasActionPressed('toggleTips')) {
      this.tracker.setTips(!this.tracker.tipsEnabled);
      this.hud.notify(this.tracker.tipsEnabled ? 'Dicas do Seu Zé ligadas.' : 'Dicas do Seu Zé desligadas (H liga de novo).', 'ok');
    }
  }

  private handleDialogueStep(step: { started: DialogueLine | null; finished: string | null }): void {
    if (step.started) this.bus.emit('dialogue:line', { speaker: step.started.speaker, text: this.fill(step.started.text) });
    if (step.finished) this.tracker.finishDialogue(step.finished);
  }

  /** Escolha num diálogo: a consequência fica registrada e é aplicada uma única vez. */
  private chooseDialogueOption(n: number): boolean {
    const id = this.dialogue.view()?.dialogueId;
    const result = this.dialogue.choose(n);
    if (!id || !result) return false;
    const option = this.tracker.choose(id, result.option.id);
    for (const effect of option?.effects ?? []) {
      if (effect.kind === 'postpone-installment') this.session.postponeDebt(effect.days, effect.fee);
    }
    this.handleDialogueStep(result);
    return true;
  }

  private dialogueHud() {
    const v = this.dialogue.view();
    if (!v) return null;
    return {
      speaker: SPEAKER_NAME[v.line.speaker],
      speakerId: v.line.speaker,
      text: this.fill(v.line.text),
      options: v.options?.map((o) => this.fill(o.label)) ?? null,
    };
  }

  /** Troca {cliente}, {vencimento} e {parcela} pelos valores atuais. */
  private fill(text: string): string {
    if (!text.includes('{')) return text;
    return fillText(text, {
      cliente: this.session.activeCase?.customerName ?? 'o cliente',
      vencimento: String(this.session.debt.nextDueDay),
      parcela: formatBRL(this.session.debtDue(this.clock.day).total),
    });
  }

  private notifyAnywhere(text: string): void {
    if (this.state.is('panel')) this.activePanel().notify(text, 'ok');
    else this.hud.notify(text, 'ok');
  }

  private currentObjective(): string {
    const c = this.session.activeCase;
    if (!c) return NEW_GAME.firstObjective;
    const os = `OS #${c.orderNumber}`;
    switch (this.session.getOrder(c.id).status) {
      case 'diagnostico':
        return `${os}: descubra a causa — ${c.summary.toLowerCase()}`;
      case 'orcamento':
      case 'contraproposta':
        return `${os}: monte o orçamento e negocie com ${c.customerName}`;
      case 'aprovada':
      case 'em-reparo':
        return `${os}: compre as peças no computador e faça o reparo`;
      case 'concluida':
        return `${os}: entregue o carro a ${c.customerName} (aba Serviço)`;
      default:
        return this.session.caseNumber < this.session.caseCount
          ? `${os} encerrada: abra o painel do carro para a próxima`
          : 'Todas as ordens de serviço de demonstração foram encerradas';
    }
  }

  private describeActiveVehicle(): { name: string; detail: string } {
    const car = this.session.getVehicle(this.activeVehicleId);
    const model = this.catalogs.models.get(car.modelId);
    return { name: model ? `${model.manufacturer} ${model.model}` : car.modelId, detail: `${car.year} · ${formatKm(car.mileageKm)}` };
  }

  private enterPlaying(fresh: boolean): void {
    // Voltando da pausa no meio de um test drive: continua dirigindo.
    if (!fresh && this.testDrive.active && this.state.is('paused')) {
      this.input.reset();
      this.state.transition('driving');
      return;
    }
    if (fresh && this.state.is('menu')) {
      this.city.resetForNewGame();
      this.player.respawn();
      this.clock.reset();
      this.lastStaffClockMinute = this.clock.absoluteMinutes;
      this.lastEventCheckDay = this.clock.day;
      this.equipment.reset();
      this.session = this.newSession();
      this.resetMissions(new MissionTracker(this.missionLib));
      this.applyActiveCarLook();
      this.announceUpgrades();
    }
    this.input.reset();
    this.state.transition('playing');
  }

  private pause(): void {
    if (this.state.transition('paused')) {
      this.player.halt();
      this.city.halt();
      this.input.exitPointerLock();
      void this.autosave();
    }
  }

  private quitToTitle(): void {
    this.testDrive.end(false);
    this.city.exit();
    if (this.state.transition('menu')) {
      this.input.exitPointerLock();
      void this.autosave().finally(() => void this.refreshContinue());
    }
  }

  private applyStateToUi(state: string): void {
    document.body.dataset.state = state;
    this.hud.setVisible(state === 'playing' || state === 'panel' || (state === 'paused' && !this.testDrive.active));
    this.drivingHud.setVisible(state === 'driving' || (state === 'paused' && this.testDrive.active));
    this.cityHud.setHudVisible(this.city.active && (state === 'playing' || state === 'paused'));
    if (state !== 'panel') {
      this.inspection.close();
      this.stockPanel.close();
      this.computer.close();
      this.cityHud.closePanel();
    }
    const showMenu = state === 'menu' || state === 'paused';
    if (state === 'menu') this.menu.setMode('title');
    if (state === 'paused') this.menu.setMode('pause');
    this.menu.setVisible(showMenu);
    this.needsRender = true;
  }

  private handlePointerLockChange(locked: boolean): void {
    // Esc (ou alt-tab) solta o mouse: isso pausa o jogo.
    if (!locked && this.state.is('playing', 'driving')) this.pause();
  }

  private readonly handleKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    // Sem captura de mouse (modo de teste), o Esc não é tratado pelo navegador.
    if (e.code === 'Escape' && this.state.is('playing', 'driving') && !this.input.pointerLocked) this.pause();
  };

  private readonly handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') void this.autosave();
  };

  // --- Save e carregamento ----------------------------------------------------

  private collectSave(): SaveGame {
    return {
      clockMinutes: this.clock.absoluteMinutes,
      player: { x: this.player.position.x, z: this.player.position.z, yaw: this.player.view.yaw, pitch: this.player.view.pitch },
      equipment: this.equipment.exportState(),
      session: this.session.toSnapshot(),
      missions: this.tracker.toSnapshot(),
    };
  }

  private saveSummary(): SaveSummary {
    const c = this.session.activeCase;
    return {
      day: this.clock.day,
      time: this.clock.formatTime(),
      cashText: formatBRL(this.session.cash),
      orderLabel: c ? `OS #${c.orderNumber} · ${ORDER_STATUS_LABEL[this.session.getOrder(c.id).status]}` : '—',
      reputation: this.session.reputation.general.score,
    };
  }

  /** Autosave: só quando o jogo mudou desde o último, e nunca com um jogo novo intocado. */
  private async autosave(): Promise<boolean> {
    const s = this.session;
    const version = s.version + this.tracker.revision;
    const unchanged = this.autosaved.session === s && this.autosaved.version === version;
    if (this.autosaveBusy || unchanged || s.version === 0) return false;
    this.autosaveBusy = true;
    try {
      const result = await this.saves.save('auto', this.collectSave(), this.saveSummary());
      if (result.ok) {
        this.autosaved = { session: s, version };
        this.hud.flashSaved('Salvo automaticamente');
      } else {
        console.warn('[save]', result.message);
        this.hud.notify(result.message, 'blocked');
      }
      return result.ok;
    } finally {
      this.autosaveBusy = false;
    }
  }

  /** Abre (ou atualiza) a lista de saves. Só limpa o aviso quando o jogador abre a lista. */
  private async openSaves(mode: SavesMode, clearMessage = true): Promise<void> {
    this.savesMode = mode;
    if (clearMessage) this.menu.showMessage('');
    this.savesPanel.render(mode, await this.saves.list(), this.saves.persistent);
    this.menu.showSaves(this.savesPanel.element);
  }

  private async saveTo(slot: SlotId): Promise<void> {
    const result = await this.saves.save(slot, this.collectSave(), this.saveSummary());
    this.menu.showMessage(result.message, result.ok ? 'ok' : 'erro');
    if (result.ok) this.sfx.play('ok');
    await this.openSaves(this.savesMode, false);
  }

  private async deleteSlot(slot: SlotId): Promise<void> {
    const result = await this.saves.remove(slot);
    this.menu.showMessage(result.message, result.ok ? 'ok' : 'erro');
    await this.openSaves(this.savesMode, false);
    void this.refreshContinue();
  }

  private async loadFrom(slot: SlotId): Promise<void> {
    const result = await this.saves.load(slot);
    if (!result.ok) {
      this.menu.showMessage(result.message);
      await this.openSaves(this.savesMode, false);
      return;
    }
    const applied = this.applySave(result.envelope.game);
    if (!applied.ok) {
      this.menu.showMessage(`Não foi possível carregar: ${applied.message}`);
      await this.openSaves(this.savesMode, false);
      return;
    }
    this.menu.showMessage(result.message, result.recovered ? 'erro' : 'ok');
    this.hud.flashSaved(result.recovered ? 'Carregado da cópia de segurança' : 'Jogo carregado');
    this.menu.showMain();
    // Volta ao jogo direto (o clique em "Confirmar" vale como gesto para capturar o mouse).
    void this.requestPlay(false);
  }

  private async continueLatest(): Promise<void> {
    const latest = await this.saves.latest();
    if (!latest) {
      this.menu.showMessage('Nenhum save encontrado.');
      return;
    }
    await this.loadFrom(latest.slot);
  }

  private async refreshContinue(): Promise<void> {
    try {
      const latest = await this.saves.latest();
      this.menu.setContinueAvailable(latest?.summary ? `Dia ${latest.summary.day} · ${latest.summary.orderLabel}` : null);
    } catch (error) {
      console.warn('[save] não foi possível ler os saves', error);
      this.menu.setContinueAvailable(null);
    }
  }

  /** Troca o jogo atual pelo do save (a sessão é validada de novo antes de entrar). */
  private applySave(game: SaveGame): { ok: true } | { ok: false; message: string } {
    const restored = GameSession.fromSnapshot(this.catalogs, this.content, game.session);
    if (!restored.ok) return { ok: false, message: restored.problems.slice(0, 3).join('; ') };
    this.testDrive.end(false);
    this.city.exit();
    this.session = restored.session;
    this.resetMissions(new MissionTracker(this.missionLib, game.missions));
    this.clock.setAbsolute(game.clockMinutes);
    this.lastStaffClockMinute = this.clock.absoluteMinutes;
    this.lastEventCheckDay = this.clock.day;
    this.equipment.restore(game.equipment);
    const inside = Math.abs(game.player.x) < WORKSHOP_SIZE.halfX - 0.3 && Math.abs(game.player.z) < WORKSHOP_SIZE.halfZ - 0.3;
    if (inside) this.player.teleport(game.player.x, game.player.z, game.player.yaw, game.player.pitch);
    else this.player.respawn();
    this.applyActiveCarLook();
    this.announceUpgrades();
    this.autosaved = { session: this.session, version: this.session.version + this.tracker.revision };
    this.panelVersion = -1;
    return { ok: true };
  }

  private readonly handleWindowBlur = (): void => {
    if (this.state.is('playing', 'driving')) this.pause();
  };

  private readonly markDirty = (): void => {
    this.needsRender = true;
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.fail('O contexto gráfico (WebGL) foi perdido', new Error('Isso pode acontecer após troca de placa de vídeo ou falta de memória. Recarregue a página.'));
  };

  private fail(title: string, error: unknown): void {
    this.loop.stop();
    this.input.exitPointerLock();
    this.state.transition('error');
    showFatalError(title, error);
  }

  // --- Configurações -------------------------------------------------------

  private applySettings(settings: Settings, persist: boolean): void {
    this.settings = settings;
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    const profile = qualityProfile(settings.quality);
    this.maxDpr = profile.maxDpr;
    this.sfx.setVolume(settings.sfxVolume);
    this.workshop.setShadowQuality(profile.shadows, profile.shadowMapSize);
    // Prompt 24: teclas, tempo, FPS, texto e cores valem na hora.
    const bindings = resolveBindings(settings.keyBindings);
    this.input.setBindings(bindings);
    setUiBindings(bindings);
    this.clock.setSpeed(settings.timeSpeed);
    (this.loop as Loop | undefined)?.setFpsLimit(settings.fpsLimit);
    const root = document.documentElement;
    root.style.setProperty('--text-scale', String(settings.textScale));
    root.dataset.colorVision = settings.colorVision;
    root.dataset.reduceMotion = String(settings.reduceMotion);
    this.needsRender = true;
    if (persist && !this.settingsStore.save(settings)) {
      showToast('Não foi possível salvar as configurações neste navegador.');
    }
  }

  // --- Utilidades ----------------------------------------------------------

  private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  private updateDiagnostics(): void {
    const info = this.renderer.info;
    const canvas = this.renderer.domElement;
    const activePlayer = this.city.player ?? this.player;
    const activeInteraction = this.city.interaction ?? this.interaction;
    const perfMem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    const memoryMb = perfMem?.usedJSHeapSize ? Math.round((perfMem.usedJSHeapSize / (1024 * 1024)) * 10) / 10 : null;
    window.__GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      state: this.state.current,
      clock: `Dia ${this.clock.day} ${this.clock.formatTime()}`,
      player: {
        x: activePlayer.position.x,
        z: activePlayer.position.z,
        yaw: activePlayer.view.yaw,
        pitch: activePlayer.view.pitch,
        speed: activePlayer.speed,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      interaction: { focus: activeInteraction.focusedId },
      vehicle: this.vehicleDiagnostics(),
      panelOpen: this.inspection.isOpen || this.cityHud.isPanelOpen,
      stockOpen: this.stockPanel.isOpen,
      held: this.session.heldPartId,
      cash: this.session.cash,
      reputation: this.session.reputation.general.score,
      computerOpen: this.computer.isOpen,
      order: this.orderDiagnostics(),
      mission: {
        id: this.objectiveCache?.missionId ?? null,
        step: this.objectiveCache?.stepId ?? null,
        recovering: this.objectiveCache?.recovering ?? false,
        completed: [...this.tracker.completed],
        tips: this.tracker.tipsEnabled,
        dialogue: this.dialogue.view()?.dialogueId ?? null,
        awaitingChoice: this.dialogue.awaitingChoice,
        highlight: this.highlightSent ?? null,
      },
      debt: { balance: this.session.debt.balance, paidCount: this.session.debt.paidCount, nextDueDay: this.session.debt.nextDueDay },
      upgrades: { ...this.session.upgrades },
      staff: {
        employees: this.session.staff.employees.map((e) => ({
          id: e.id,
          role: e.role,
          state: e.state,
          currentTaskId: e.currentTaskId,
          completedTasks: e.completedTasks,
        })),
        tasks: this.session.staff.tasks.map((t) => ({
          id: t.id,
          status: t.status,
          assignedTo: t.assignedTo,
          progressMinutes: t.progressMinutes,
          totalMinutes: t.totalMinutes,
        })),
        lastPayrollDay: this.session.staff.lastPayrollDay,
      },
      events: {
        activeEventId: this.session.events.activeEventId,
        lastTriggeredDay: this.session.events.lastTriggeredDay,
        historyCount: this.session.events.history.length,
        historyIds: this.session.events.history.map((h) => h.eventId),
      },
      driving: this.testDrive.diagnostics(),
      city: this.city.diagnostics(this.smoothedFps, memoryMb),
      diagnosis: this.diagnosisDiagnostics(),
      equipment: this.equipment.snapshot(),
      canvas: { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight },
    };
  }

  private diagnosisDiagnostics(): GameDiagnostics['diagnosis'] {
    const c = this.session.activeCase;
    const p = c ? this.session.getProgress(c.id) : null;
    return {
      caseId: c?.id ?? null,
      caseNumber: this.session.caseNumber,
      evidence: p?.evidence.length ?? 0,
      concluded: Boolean(p?.conclusion),
      // Só para testes automatizados: a interface nunca mostra se acertou.
      records: this.session.diagnoses.map((r) => ({ caseId: r.caseId, chosenSlot: r.chosenSlot, correct: r.correct })),
    };
  }

  private orderDiagnostics(): GameDiagnostics['order'] {
    const c = this.session.activeCase;
    const o = c ? this.session.getOrder(c.id) : null;
    return {
      status: o?.status ?? null,
      approvedTotal: o?.approved?.total ?? null,
      quality: o?.completion?.qualityLabel ?? null,
      invalidAttempts: o?.repair?.invalidAttempts ?? 0,
    };
  }

  private vehicleDiagnostics(): GameDiagnostics['vehicle'] {
    const v = this.session.getVehicle(this.activeVehicleId);
    return { plate: v.plate, mileageKm: v.mileageKm, historyEntries: v.history.length, sessionVersion: this.session.version };
  }

  /** Operações de domínio expostas só para testes/depuração (dev ou ?debug). */
  private runVehicleOp(op: VehicleOp): { ok: boolean; code?: string; message?: string } {
    const c = this.catalogs;
    const result: DomainResult<VehicleState | { vehicle: VehicleState }> = this.session.apply<VehicleState | { vehicle: VehicleState }>(this.activeVehicleId, (v): DomainResult<VehicleState | { vehicle: VehicleState }> => {
      switch (op.kind) {
        case 'install':
          return installPart(v, op.slot, op.partId, { condition: op.condition ?? 'nova', wear: op.wear, day: this.clock.day }, c);
        case 'remove':
          return removePart(v, op.slot, c, { day: this.clock.day });
        case 'setWear':
          return setPartWear(v, op.slot, op.wear, 'ajuste de teste', c);
        case 'reveal':
          return revealPartCondition(v, op.slot, 'inspecao', c);
        case 'drive':
          return driveKm(v, op.km, c);
      }
    });
    return result.ok ? { ok: true } : { ok: false, code: result.error.code, message: result.error.message };
  }

  private installDebugHooks(): void {
    window.__GAME_TEST_HOOKS__ = {
      startWithoutPointerLock: (fresh = true) => {
        this.input.setLockBypass(true);
        if (this.state.is('menu', 'paused')) this.enterPlaying(fresh);
        return this.state.current;
      },
      pause: () => {
        this.pause();
        return this.state.current;
      },
      getState: () => this.state.current,
      vehicleState: () => structuredClone(this.session.getVehicle(this.activeVehicleId)),
      vehicleOp: (op) => this.runVehicleOp(op as VehicleOp),
      autosaveNow: () => this.autosave(),
      dialogueChoose: (n) => this.chooseDialogueOption(n),
      forceEvent: (eventId) => {
        const r = this.session.triggerEvent(eventId, this.clock.day, { force: true });
        return r.ok;
      },
      startTestDrive: async () => {
        await this.testDrive.start();
        return this.state.current;
      },
      testDriveBlocked: () => this.testDrive.blockedReason(),
      sceneStats: () => {
        // Malhas visíveis por grupo da oficina (para achar o que mais custa chamadas de desenho).
        const groups: Record<string, number> = {};
        let total = 0;
        this.workshop.root.traverseVisible((o) => {
          if (!(o as THREE.Mesh).isMesh) return;
          total++;
          let top: THREE.Object3D = o;
          while (top.parent && top.parent !== this.workshop.root) top = top.parent;
          const key = top.name || top.type;
          groups[key] = (groups[key] ?? 0) + 1;
        });
        return { total, groups };
      },
      enterNeighborhood: () => this.city.enter(),
      visitCityLocation: (id) => this.city.visit(id as CityLocationId),
      exitNeighborhood: () => this.city.exit(),
      skipDialogueLine: () => this.handleDialogueStep(this.dialogue.skip()),
      bypassPointerLock: () => this.input.setLockBypass(true),
      teleport: (x, z, yaw, pitch = 0) => {
        const target = this.city.player ?? this.player;
        target.teleport(x, z, yaw, pitch);
        target.applyToCamera(this.camera);
        return this.state.current;
      },
    };

    if (new URLSearchParams(window.location.search).has('debug')) {
      void import('./debugPanel').then(({ createDebugPanel }) => {
        this.debugDispose = createDebugPanel(this.player.tuning, this.renderer, this.scene, this.markDirty);
      });
    }
  }
}

type VehicleOp =
  | { kind: 'install'; slot: string; partId: string; condition?: PartCondition; wear?: number }
  | { kind: 'remove'; slot: string }
  | { kind: 'setWear'; slot: string; wear: number }
  | { kind: 'reveal'; slot: string }
  | { kind: 'drive'; km: number };

