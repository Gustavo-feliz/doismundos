import type * as THREE from 'three';
import type { MoveIntent } from '../core/Input';
import { moveWithCollisions, type Box2D } from '../world/collision';
import { createCameraFeel, resetCameraFeel, stepCameraFeel, type CameraFeelState } from './cameraFeel';
import { applyLook, DEFAULT_MOVEMENT, MAX_PITCH, stepVelocity, wishDirection, type MovementTuning } from './movement';

export interface SpawnPoint {
  x: number;
  z: number;
  /** Direção inicial do olhar (radianos). */
  yaw: number;
}

export interface LookSettings {
  mouseSensitivity: number;
  invertY: boolean;
  reduceMotion: boolean;
  /** Balanço ao andar e inclinação ao virar (Prompt 25). */
  cameraSway: boolean;
}

const EYE_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.3;

/**
 * Jogador em primeira pessoa: posição, olhar e movimento com colisão.
 * Não sabe nada de DOM nem de estado do jogo — recebe intenções prontas.
 */
export class FirstPersonController {
  readonly tuning: MovementTuning = { ...DEFAULT_MOVEMENT };
  readonly position = { x: 0, z: 0 };
  readonly view = { yaw: 0, pitch: 0 };
  readonly velocity = { x: 0, z: 0 };
  private readonly wish = { x: 0, z: 0 };
  private readonly feel: CameraFeelState = createCameraFeel();

  constructor(
    private readonly colliders: readonly Box2D[],
    private readonly spawn: SpawnPoint,
  ) {
    this.respawn();
  }

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  respawn(): void {
    this.position.x = this.spawn.x;
    this.position.z = this.spawn.z;
    this.view.yaw = this.spawn.yaw;
    this.view.pitch = -0.08;
    this.velocity.x = 0;
    this.velocity.z = 0;
    resetCameraFeel(this.feel);
  }

  /** Coloca o jogador num ponto exato (testes e futuros pontos de entrada). Não checa colisão. */
  teleport(x: number, z: number, yaw: number, pitch = 0): void {
    this.position.x = x;
    this.position.z = z;
    this.view.yaw = yaw;
    this.view.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
    this.halt();
    resetCameraFeel(this.feel);
  }

  /** Zera o embalo (ex.: ao pausar, para não "escorregar" ao continuar). */
  halt(): void {
    this.velocity.x = 0;
    this.velocity.z = 0;
  }

  /** Balanço e inclinação atuais (testes e diagnóstico). */
  get cameraFeel(): Readonly<CameraFeelState> {
    return this.feel;
  }

  update(dt: number, intent: MoveIntent, mouse: { x: number; y: number }, look: LookSettings): void {
    const yawBefore = this.view.yaw;
    applyLook(this.view, mouse.x, mouse.y, look.mouseSensitivity, look.invertY);

    wishDirection(this.view.yaw, intent.forward, intent.right, this.wish);
    stepVelocity(this.velocity, this.wish, intent.run, this.tuning, dt);
    moveWithCollisions(this.position, this.velocity.x * dt, this.velocity.z * dt, PLAYER_RADIUS, this.colliders);

    // Balanço e inclinação; desligados em "reduzir movimento" (GDD §20.4) ou na opção própria.
    const right = { x: Math.cos(this.view.yaw), z: -Math.sin(this.view.yaw) };
    stepCameraFeel(this.feel, {
      dt,
      speed: this.speed,
      strafe: this.velocity.x * right.x + this.velocity.z * right.z,
      yawDelta: this.view.yaw - yawBefore,
      walkSpeed: this.tuning.walkSpeed,
      enabled: look.cameraSway && !look.reduceMotion,
    });
  }

  applyToCamera(camera: THREE.PerspectiveCamera): void {
    camera.position.set(this.position.x, EYE_HEIGHT + this.feel.bob, this.position.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.view.pitch, this.view.yaw, this.feel.roll);
  }
}
