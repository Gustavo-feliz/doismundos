import type * as THREE from 'three';
import type { SfxName } from '../audio/Sfx';
import { initialCityWorldState, nearestCityLocation, stepCityWorld } from '../city/rules';
import type { CityLocationId, CityWorldState } from '../city/types';
import type { Input } from '../core/Input';
import { CITY_NEIGHBORHOOD } from '../data/city';
import { InteractionSystem } from '../interaction/InteractionSystem';
import type { InteractionPrompt } from '../interaction/types';
import { FirstPersonController } from '../player/FirstPersonController';
import type { Settings } from '../save/settings';
import type { CityHud, CityPanelView } from '../ui/CityHud';
import type { CityNeighborhood } from '../world/CityNeighborhood';

export type CityPanelMode = 'ferro-velho' | 'lanchonete' | 'mapa';

/** O que o bairro precisa do jogo (o Game implementa). */
export interface CityHost {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  settings(): Settings;
  /** Raiz e jogador da oficina (a oficina fica escondida na rua). */
  workshopRoot(): THREE.Object3D;
  workshopPlayer(): FirstPersonController;
  /** Pode sair para a rua agora? (estado 'playing', sem test drive.) */
  canEnter(): boolean;
  isPlaying(): boolean;
  /** Entra no estado de painel (cursor livre). */
  enterPanel(): boolean;
  /** Fecha os painéis da oficina e volta ao estado 'playing', se estava em painel. */
  closeWorkshopPanels(): void;
  /** Abre o computador numa aba (loja ou caixa), marcando o tutorial. */
  openComputerAt(tab: 'loja' | 'caixa'): void;
  advanceClock(dt: number): void;
  setPrompt(prompt: InteractionPrompt | null): void;
  notify(text: string, kind: 'ok' | 'blocked'): void;
  playSound(name: SfxName): void;
  assetFailed(what: string, error: unknown): void;
  markDirty(): void;
  /** Dados do painel que vêm da sessão (caixa, sucata, garimpo de hoje). */
  panelData(): Pick<CityPanelView, 'cashText' | 'scrapCount' | 'scrapTotalText' | 'salvageOffers'>;
}

/**
 * Bairro de São Cristóvão (Prompt 14), separado do Game no QA (Prompt 18):
 * carregamento sob demanda, jogador na rua, trânsito e pedestres, visitas aos
 * locais e painéis do ferro-velho, da lanchonete e do mapa.
 */
export class CityController {
  private city: CityNeighborhood | null = null;
  private loading = false;
  private isActive = false;
  private world: CityWorldState = initialCityWorldState(CITY_NEIGHBORHOOD);
  private cityPlayer: FirstPersonController | null = null;
  private cityInteraction: InteractionSystem | null = null;
  private readonly visited = new Set<CityLocationId>(['oficina']);
  private loadMs = 0;
  private panelMode: CityPanelMode = 'ferro-velho';

  constructor(
    private readonly host: CityHost,
    private readonly hud: CityHud,
  ) {}

  get active(): boolean {
    return this.isActive;
  }

  /** Jogador e mira da rua (null fora do bairro). */
  get player(): FirstPersonController | null {
    return this.isActive ? this.cityPlayer : null;
  }

  get interaction(): InteractionSystem | null {
    return this.isActive ? this.cityInteraction : null;
  }

  /** Sai da oficina para a Rua das Oficinas, carregando o bairro sob demanda. */
  async enter(): Promise<boolean> {
    if (!this.host.canEnter() || this.loading || this.isActive) return false;
    if (!this.city) {
      this.loading = true;
      const t0 = performance.now();
      try {
        const { buildCityNeighborhood } = await import('../world/CityNeighborhood');
        this.city = buildCityNeighborhood(CITY_NEIGHBORHOOD);
        this.city.root.visible = false;
        this.host.scene.add(this.city.root);
        this.cityPlayer = new FirstPersonController(this.city.colliders, CITY_NEIGHBORHOOD.spawn);
        this.cityInteraction = new InteractionSystem(this.city.raycastTargets, CITY_NEIGHBORHOOD.interactRadius);
        for (const it of this.city.createInteractables((id) => void this.visit(id))) this.cityInteraction.register(it);
        this.loadMs = Math.max(1, Math.round(performance.now() - t0));
      } catch (error) {
        this.host.assetFailed('o bairro', error);
        return false;
      } finally {
        this.loading = false;
      }
    }
    if (!this.host.isPlaying() || !this.city || !this.cityPlayer) return false;
    try {
      await this.city.ensureLocationLoaded('oficina');
    } catch (error) {
      this.host.assetFailed('a rua da oficina', error);
      return false;
    }
    this.isActive = true;
    this.visited.add('oficina');
    this.world = initialCityWorldState(CITY_NEIGHBORHOOD);
    this.host.workshopRoot().visible = false;
    this.city.root.visible = true;
    this.host.workshopPlayer().halt();
    this.cityPlayer.respawn();
    this.cityPlayer.applyToCamera(this.host.camera);
    this.host.camera.updateMatrixWorld();
    this.city.syncWorldState(this.world, this.host.settings().reduceMotion);
    this.hud.setHudVisible(true);
    this.refreshHud();
    this.host.playSound('ok');
    this.host.notify('Bairro de São Cristóvão: caminhe até os locais ou aperte M para o mapa.', 'ok');
    this.host.markDirty();
    return true;
  }

  /** Volta da rua para dentro da oficina, preservando todo o estado. */
  exit(): boolean {
    if (!this.isActive) return false;
    this.isActive = false;
    if (this.city) this.city.root.visible = false;
    this.host.workshopRoot().visible = true;
    this.hud.setHudVisible(false);
    this.hud.closePanel();
    this.host.closeWorkshopPanels();
    this.host.workshopPlayer().applyToCamera(this.host.camera);
    this.host.camera.updateMatrixWorld();
    this.host.setPrompt(null);
    this.host.playSound('ok');
    this.host.notify('De volta à Oficina do Seu Zé.', 'ok');
    this.host.markDirty();
    return true;
  }

  /** Jogo novo: volta à oficina e esquece os locais visitados. */
  resetForNewGame(): void {
    this.exit();
    this.visited.clear();
    this.visited.add('oficina');
  }

  /** Visita um dos 5 locais do bairro (carregando seus detalhes 3D sob demanda). */
  async visit(id: CityLocationId): Promise<boolean> {
    if (!this.isActive && !(await this.enter())) return false;
    if (id === 'oficina') return this.exit();
    const loc = CITY_NEIGHBORHOOD.locations.find((l) => l.id === id);
    if (!loc || !this.city || !this.cityPlayer) return false;

    // Se já estiver com um painel aberto (ex.: clicou no mapa), fecha antes de abrir o do local.
    this.hud.closePanel();
    this.host.closeWorkshopPanels();

    this.cityPlayer.teleport(loc.entrance.x, loc.entrance.z, loc.entrance.yaw, 0);
    this.cityPlayer.applyToCamera(this.host.camera);
    this.host.camera.updateMatrixWorld();
    // Os detalhes 3D do local são enfeite: se falharem, o local funciona do mesmo jeito.
    await this.city.ensureLocationLoaded(id).catch((error: unknown) => this.host.assetFailed('os detalhes deste local', error));
    this.visited.add(id);
    this.refreshHud(loc);

    switch (loc.actionKind) {
      case 'open-shop':
        this.host.openComputerAt('loja');
        break;
      case 'open-bank':
        this.host.openComputerAt('caixa');
        break;
      case 'open-scrapyard':
        this.openPanel('ferro-velho');
        break;
      case 'open-snack':
        this.openPanel('lanchonete');
        break;
      case 'return-workshop':
        return this.exit();
    }
    this.host.markDirty();
    return true;
  }

  openPanel(mode: CityPanelMode): void {
    this.panelMode = mode;
    if (!this.hud.isPanelOpen && !this.host.enterPanel()) return;
    this.hud.openPanel(this.panelView());
  }

  panelView(): CityPanelView {
    return {
      mode: this.panelMode,
      ...this.host.panelData(),
      snacks: CITY_NEIGHBORHOOD.snacks,
      locations: CITY_NEIGHBORHOOD.locations,
      visited: this.visited,
    };
  }

  /** Um quadro na rua (só com o estado 'playing' e o bairro ativo). */
  update(dt: number, mouse: { x: number; y: number }): void {
    const player = this.cityPlayer;
    const interaction = this.cityInteraction;
    if (!this.isActive || !this.city || !player || !interaction) return;
    const input = this.host.input;
    if (input.wasActionPressed('exitDrive')) {
      this.exit();
      return;
    }
    if (input.wasActionPressed('openMap')) {
      this.openPanel('mapa');
      return;
    }
    const settings = this.host.settings();
    player.update(dt, input.getMoveIntent(), mouse, settings);
    this.world = stepCityWorld(this.world, dt, player.position, CITY_NEIGHBORHOOD);
    this.city.syncWorldState(this.world, settings.reduceMotion);
    this.host.advanceClock(dt);
    player.applyToCamera(this.host.camera);
    this.host.camera.updateMatrixWorld();
    const rayPrompt = interaction.update(this.host.camera);
    const nearby = nearestCityLocation(player.position, CITY_NEIGHBORHOOD);
    this.host.setPrompt(rayPrompt ?? (nearby ? { name: nearby.name, status: 'available', action: nearby.actionLabel, detail: nearby.subtitle } : null));
    if (input.wasActionPressed('interact')) {
      if (rayPrompt) {
        const result = interaction.interact();
        if (result?.message) this.host.notify(result.message, result.ok ? 'ok' : 'blocked');
      } else if (nearby) {
        void this.visit(nearby.id);
      }
    }
    this.refreshHud(nearby);
    this.host.markDirty();
  }

  halt(): void {
    this.cityPlayer?.halt();
  }

  /** Dados para window.__GAME_DIAGNOSTICS__ (testes). */
  diagnostics(fps: number, memoryMb: number | null): GameDiagnostics['city'] {
    if (!this.isActive || !this.city || !this.cityPlayer) return null;
    return {
      active: true,
      nearbyLocation: nearestCityLocation(this.cityPlayer.position, CITY_NEIGHBORHOOD)?.id ?? null,
      visited: [...this.visited],
      loadedLocations: [...this.city.loadedLocations],
      trafficCount: this.world.traffic.length,
      pedestrianCount: this.world.pedestrians.length,
      trafficStopped: this.world.traffic.some((t) => t.stoppedForPlayer),
      loadMs: this.loadMs,
      fps,
      memoryMb,
    };
  }

  dispose(): void {
    this.city?.dispose();
  }

  private refreshHud(nearby = this.cityPlayer ? nearestCityLocation(this.cityPlayer.position, CITY_NEIGHBORHOOD) : null): void {
    if (!this.cityPlayer) return;
    this.hud.updateHud({ playerX: this.cityPlayer.position.x, playerZ: this.cityPlayer.position.z, nearbyLocation: nearby, visited: this.visited });
  }
}
