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
import { ECONOMY } from '../data/economy';
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
import { FUNCTIONAL_TESTS, SCANNER } from '../data/diagnostics';
import { EQUIPMENT } from '../data/equipment';
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
    this.content = {
      cases: DIAGNOSTIC_CASES,
      diagnostics: this.diagnosticData,
      customers: CUSTOMERS,
      pricing: PRICING,
      initialStock: INITIAL_STOCK,
      defaultDraft: DEFAULT_QUOTE_SETTINGS,
      suppliers: SUPPLIERS,
      economy: ECONOMY,
    };
    this.session = this.newSession();
    const store = IndexedDbSaveStore.available() ? new IndexedDbSaveStore() : new MemorySaveStore();
    this.saves = new SaveService(store, (s) => validateSessionSnapshot(s, this.catalogs, (id) => GameSession.resolveCase(this.content, id)));
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
    });
    this.interaction = new InteractionSystem(this.workshop.raycastTargets, EQUIPMENT.interactionRange);
    for (const interactable of this.equipment.createInteractables()) this.interaction.register(interactable);

    this.state = new GameStateMachine((from, to) => this.bus.emit('state:changed', { from, to }));
    this.input = new Input(canvas, DEFAULT_BINDINGS, (locked) => this.handlePointerLockChange(locked));

    this.hud = new Hud(uiRoot);
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

    this.listen(window, 'keydown', this.handleKeyDown);
    this.listen(window, 'blur', this.handleWindowBlur);
    this.listen(window, 'resize', this.markDirty);
    this.listen(canvas, 'webglcontextlost', this.handleContextLost);

    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.render(),
      (error) => this.fail('O jogo encontrou um erro e foi interrompido', error),
    );

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
    if (this.state.is('playing')) {
      const mouse = this.input.consumeMouseDelta();
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

    this.hud.update({
      money: formatBRL(this.session.cash),
      day: this.clock.day,
      time: this.clock.formatTime(),
      objective: this.currentObjective(),
      tool: this.heldPartName() ?? 'Nada',
    });

    // Autosave a cada minuto real de jogo, só se algo mudou (não trava: é assíncrono).
    if (this.state.is('playing')) {
      this.autosaveClock += dt;
      if (this.autosaveClock >= AUTOSAVE_SECONDS) {
        this.autosaveClock = 0;
        void this.autosave();
      }
    }
    // Pedidos de peças chegam conforme o relógio do jogo.
    if (this.state.is('playing', 'panel')) this.receiveDeliveries();
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
    this.computer.open(this.computerView());
  }

  private computerView() {
    return buildComputerView(this.session, this.clock.absoluteMinutes, this.session.activeCase?.vehicle.id ?? null);
  }

  private refreshPanels(): void {
    if (this.inspection.isOpen) this.inspection.refresh(this.currentPanelViews());
    if (this.stockPanel.isOpen) this.stockPanel.refresh(buildStockView(this.session));
    if (this.computer.isOpen) this.computer.refresh(this.computerView());
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
  }

  private activePanel(): { notify(text: string, kind: 'ok' | 'warn' | 'blocked'): void } {
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
          })
        : null,
      quote: c ? buildQuoteView(this.session, c.id, this.clock.day) : null,
      service: c ? buildServiceView(this.session, c.id, this.equipmentContext(), this.clock.absoluteMinutes) : null,
      orderStatus: c ? this.session.getOrder(c.id).status : null,
    };
  }

  // --- Diagnóstico (ordens de serviço) -------------------------------------

  private newSession(): GameSession {
    return new GameSession(this.catalogs, [], this.content);
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
    if (fresh && this.state.is('menu')) {
      this.player.respawn();
      this.clock.reset();
      this.equipment.reset();
      this.session = this.newSession();
      this.applyActiveCarLook();
    }
    this.input.reset();
    this.state.transition('playing');
  }

  private pause(): void {
    if (this.state.transition('paused')) {
      this.player.halt();
      this.input.exitPointerLock();
      void this.autosave();
    }
  }

  private quitToTitle(): void {
    if (this.state.transition('menu')) {
      this.input.exitPointerLock();
      void this.autosave().finally(() => void this.refreshContinue());
    }
  }

  private applyStateToUi(state: string): void {
    document.body.dataset.state = state;
    this.hud.setVisible(state === 'playing' || state === 'paused' || state === 'panel');
    if (state !== 'panel') {
      this.inspection.close();
      this.stockPanel.close();
      this.computer.close();
    }
    const showMenu = state === 'menu' || state === 'paused';
    if (state === 'menu') this.menu.setMode('title');
    if (state === 'paused') this.menu.setMode('pause');
    this.menu.setVisible(showMenu);
    this.needsRender = true;
  }

  private handlePointerLockChange(locked: boolean): void {
    // Esc (ou alt-tab) solta o mouse: isso pausa o jogo.
    if (!locked && this.state.is('playing')) this.pause();
  }

  private readonly handleKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    // Sem captura de mouse (modo de teste), o Esc não é tratado pelo navegador.
    if (e.code === 'Escape' && this.state.is('playing') && !this.input.pointerLocked) this.pause();
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
    const unchanged = this.autosaved.session === s && this.autosaved.version === s.version;
    if (this.autosaveBusy || unchanged || s.version === 0) return false;
    this.autosaveBusy = true;
    try {
      const result = await this.saves.save('auto', this.collectSave(), this.saveSummary());
      if (result.ok) {
        this.autosaved = { session: s, version: s.version };
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
    this.session = restored.session;
    this.clock.setAbsolute(game.clockMinutes);
    this.equipment.restore(game.equipment);
    const inside = Math.abs(game.player.x) < WORKSHOP_SIZE.halfX - 0.3 && Math.abs(game.player.z) < WORKSHOP_SIZE.halfZ - 0.3;
    if (inside) this.player.teleport(game.player.x, game.player.z, game.player.yaw, game.player.pitch);
    else this.player.respawn();
    this.applyActiveCarLook();
    this.autosaved = { session: this.session, version: this.session.version };
    this.panelVersion = -1;
    return { ok: true };
  }

  private readonly handleWindowBlur = (): void => {
    if (this.state.is('playing')) this.pause();
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
    window.__GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      state: this.state.current,
      clock: `Dia ${this.clock.day} ${this.clock.formatTime()}`,
      player: {
        x: this.player.position.x,
        z: this.player.position.z,
        yaw: this.player.view.yaw,
        pitch: this.player.view.pitch,
        speed: this.player.speed,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      interaction: { focus: this.interaction.focusedId },
      vehicle: this.vehicleDiagnostics(),
      panelOpen: this.inspection.isOpen,
      stockOpen: this.stockPanel.isOpen,
      held: this.session.heldPartId,
      cash: this.session.cash,
      reputation: this.session.reputation.general.score,
      computerOpen: this.computer.isOpen,
      order: this.orderDiagnostics(),
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
      bypassPointerLock: () => this.input.setLockBypass(true),
      teleport: (x, z, yaw, pitch = 0) => {
        this.player.teleport(x, z, yaw, pitch);
        this.player.applyToCamera(this.camera);
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
