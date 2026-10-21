import type * as THREE from 'three';
import type { SfxName } from '../audio/Sfx';
import type { Input } from '../core/Input';
import { DRIVING_PROFILES, TEST_TRACK } from '../data/driving';
import { drivingCondition } from '../driving/condition';
import { FIXED_STEP, forward, initialDriveState, kmh, simulate, trackColliders, type CarGeometry } from '../driving/physics';
import type { DriveState, DrivingCondition, DrivingProfile, WarningLight } from '../driving/types';
import type { DrivingHud } from '../ui/DrivingHud';
import type { Catalogs } from '../vehicles/catalogs';
import { driveKm } from '../vehicles/domain';
import type { VehicleState } from '../vehicles/state';
import type { Box2D } from '../world/collision';
import type { TestTrack } from '../world/TestTrack';
import type { GameSession } from './GameSession';

/** O que o test drive precisa do jogo (o Game implementa). */
export interface TestDriveHost {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly catalogs: Catalogs;
  session(): GameSession;
  activeVehicle(): VehicleState | null;
  /** Raiz da oficina (fica escondida enquanto se dirige). */
  workshopRoot(): THREE.Object3D;
  reduceMotion(): boolean;
  /** Pode começar agora? (estado 'playing', fora do bairro etc.) */
  canStart(): boolean;
  /** Entrou no pátio: parar o jogador e ir para o estado 'driving'. */
  onEnter(): void;
  /** Saiu do pátio: câmera de volta no jogador e estado 'playing' (se estava dirigindo). */
  onExit(): void;
  notify(text: string, kind: 'ok' | 'blocked'): void;
  playSound(name: SfxName): void;
  assetFailed(what: string, error: unknown): void;
}

/** Test drive em andamento. */
interface ActiveDrive {
  vehicleId: string;
  state: DriveState;
  profile: DrivingProfile;
  geometry: CarGeometry;
  condition: DrivingCondition;
  colliders: Box2D[];
  /** Volante (-1 a 1), suavizado. */
  steer: number;
  accumulator: number;
  topKmh: number;
  /** Até quando mostrar o aviso de batida (tempo da simulação). */
  impactUntil: number;
  /** Metros e batidas de antes de apertar R (recomeçar). */
  drivenBefore: number;
  hitsBefore: number;
}

/**
 * Test drive (Prompt 13), separado do Game no QA (Prompt 18): carrega o pátio
 * sob demanda, roda a física em passo fixo, cuida da câmera, do painel e da
 * volta à oficina. A física e o efeito das peças ficam em src/driving/.
 */
export class TestDriveController {
  private drive: ActiveDrive | null = null;
  private track: TestTrack | null = null;
  private loading = false;

  constructor(
    private readonly host: TestDriveHost,
    private readonly hud: DrivingHud,
  ) {}

  get active(): boolean {
    return this.drive !== null;
  }

  /** Por que o test drive não pode começar (o portão já confere elevador e capô). */
  blockedReason(): string | null {
    const v = this.host.activeVehicle();
    if (!v) return 'Nenhum carro no box';
    if (Object.values(v.parts).some((p) => p === null)) return 'Falta peça no carro: termine o reparo antes do test drive';
    return null;
  }

  /** Sai pelo portão: carrega o pátio (só na primeira vez) e esconde a oficina. */
  async start(): Promise<void> {
    if (!this.host.canStart() || this.loading || this.drive || this.blockedReason()) return;
    if (!this.track) {
      this.loading = true;
      try {
        const { buildTestTrack } = await import('../world/TestTrack');
        this.track = buildTestTrack(TEST_TRACK);
        this.track.root.visible = false;
        this.host.scene.add(this.track.root);
      } catch (error) {
        // GDD §25, teste B: asset que falha ao carregar não pode travar a oficina.
        this.host.assetFailed('o pátio de teste', error);
        return;
      } finally {
        this.loading = false;
      }
    }
    if (!this.host.canStart()) return;
    const v = this.host.activeVehicle();
    if (!v) return;
    const model = this.host.catalogs.models.get(v.modelId)!;
    this.drive = {
      vehicleId: v.id,
      state: initialDriveState(TEST_TRACK),
      profile: DRIVING_PROFILES[model.category],
      geometry: { wheelbase: model.dimensions.wheelbase, width: model.dimensions.width, length: model.dimensions.length },
      condition: drivingCondition(v, this.host.catalogs),
      colliders: trackColliders(TEST_TRACK),
      steer: 0,
      accumulator: 0,
      topKmh: 0,
      impactUntil: 0,
      drivenBefore: 0,
      hitsBefore: 0,
    };
    this.track!.setCarLook(v.color, model.dimensions);
    this.host.workshopRoot().visible = false;
    this.track!.root.visible = true;
    this.placeCamera(true);
    this.host.onEnter();
  }

  update(dt: number): void {
    const d = this.drive;
    if (!d) return;
    const i = this.host.input;
    if (i.wasActionPressed('exitDrive')) {
      this.end(true);
      return;
    }
    if (i.wasActionPressed('resetCar')) {
      // Recomeçar não apaga o que já foi rodado nem as batidas.
      d.drivenBefore += d.state.distance;
      d.hitsBefore += d.state.collisions;
      d.state = initialDriveState(TEST_TRACK);
      d.steer = 0;
      d.accumulator = 0;
    }
    // Teclado dá -1/0/1; o volante gira até lá aos poucos.
    const target = (i.isActionDown('right') ? 1 : 0) - (i.isActionDown('left') ? 1 : 0);
    d.steer += Math.max(-dt * 3, Math.min(dt * 3, target - d.steer));
    d.accumulator = Math.min(d.accumulator + dt, FIXED_STEP * 10);
    const steps = Math.floor(d.accumulator / FIXED_STEP);
    if (steps > 0) {
      d.accumulator -= steps * FIXED_STEP;
      const hits = d.state.collisions;
      const input = { throttle: i.isActionDown('forward') ? 1 : 0, brake: i.isActionDown('backward') ? 1 : 0, steer: d.steer, handbrake: i.isActionDown('handbrake') };
      d.state = simulate(d.state, input, steps * FIXED_STEP, d.profile, d.geometry, d.condition, TEST_TRACK, d.colliders);
      if (d.state.collisions > hits) {
        d.impactUntil = d.state.time + 2;
        this.host.playSound('erro');
      }
    }
    d.topKmh = Math.max(d.topKmh, Math.abs(kmh(d.state.speed)));
    this.placeCamera(false, dt);
    const s = d.state;
    this.hud.update({
      speedKmh: Math.abs(kmh(s.speed)),
      limitKmh: TEST_TRACK.speedLimitKmh,
      rpm: s.rpm,
      maxRpm: d.profile.maxRpm,
      gear: s.speed < -0.1 ? 'R' : String(s.gear),
      temperature: s.temperature,
      lights: this.lights(),
      message: d.condition.cannotStart ?? (s.time < d.impactUntil ? 'Batida! Aperte R para recomeçar ou F para voltar à oficina.' : null),
    });
  }

  /**
   * Volta à oficina. Com `applyKm`, os km rodados entram no carro pela regra
   * de domínio. Sem isso (sair ao menu, carregar save), nada muda na oficina.
   */
  end(applyKm: boolean): void {
    const d = this.drive;
    if (!d) return;
    this.drive = null;
    this.host.workshopRoot().visible = true;
    if (this.track) this.track.root.visible = false;
    this.hud.setVisible(false);
    this.host.onExit();
    if (!applyKm) return;
    const km = Math.round((d.drivenBefore + d.state.distance) / 10) / 100;
    if (km > 0) this.host.session().apply(d.vehicleId, (v) => driveKm(v, km, this.host.catalogs));
    const collisions = d.hitsBefore + d.state.collisions;
    const hits = collisions ? `, ${collisions} batida(s)` : '';
    this.host.notify(`Test drive: ${km.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km, máxima de ${Math.round(d.topKmh)} km/h${hits}.`, 'ok');
  }

  /** Dados para window.__GAME_DIAGNOSTICS__ (testes). */
  diagnostics(): GameDiagnostics['driving'] {
    const d = this.drive;
    if (!d) return null;
    return {
      speedKmh: Math.round(kmh(d.state.speed) * 10) / 10,
      rpm: d.state.rpm,
      gear: d.state.gear,
      x: d.state.x,
      z: d.state.z,
      collisions: d.state.collisions,
      distance: d.state.distance,
      lights: this.lights(),
      cannotStart: d.condition.cannotStart,
    };
  }

  dispose(): void {
    this.track?.dispose();
  }

  private lights(): WarningLight[] {
    const d = this.drive;
    if (!d) return [];
    return d.state.temperature >= 0.8 ? [...d.condition.lights, 'temperatura'] : [...d.condition.lights];
  }

  /** Câmera atrás do carro, com suavização; carro e balanço da carroceria. */
  private placeCamera(snap: boolean, dt = 0): void {
    const d = this.drive;
    if (!d || !this.track) return;
    const camera = this.host.camera;
    const s = d.state;
    const f = forward(s.heading);
    this.track.car.position.set(s.x, 0, s.z);
    this.track.car.rotation.y = s.heading;
    const calm = this.host.reduceMotion();
    this.track.body.rotation.z = calm ? 0 : -d.steer * Math.min(1, Math.abs(s.speed) / 15) * (0.03 + 0.08 * d.condition.sway);
    const tx = s.x - f.x * 6.5;
    const tz = s.z - f.z * 6.5;
    const k = snap || calm ? 1 : 1 - Math.exp(-dt * 6);
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.z += (tz - camera.position.z) * k;
    camera.position.y = 2.6;
    // Disco empenado: o carro treme ao frear (sem tremida com "reduzir movimento").
    const braking = this.host.input.isActionDown('backward') && s.speed > 2;
    if (!calm && braking && d.condition.brakeShake > 0) camera.position.y += Math.sin(s.time * 60) * 0.04 * d.condition.brakeShake;
    camera.lookAt(s.x + f.x * 4, 1, s.z + f.z * 4);
    camera.updateMatrixWorld();
  }
}
