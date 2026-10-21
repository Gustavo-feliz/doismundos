import { EQUIPMENT, EQUIPMENT_IDS } from '../data/equipment';
import { createInteractable, type Interactable } from '../interaction/types';
import { pointInBox, type Box2D, type Point2D } from '../world/collision';
import type { WorkshopParts } from '../world/Workshop';
import { Actuator, easeInOut, type ActuatorPhase } from './Actuator';
import { carBlocksWalking, hoodAvailability, liftAvailability, type BaySnapshot } from './bayRules';
import type { EquipmentSave } from '../save/saveFile';

/** Raio do jogador, para contar como "embaixo do carro" mesmo encostado na borda. */
const PLAYER_RADIUS = 0.3;

export interface EquipmentSnapshot {
  lift: ActuatorPhase;
  liftHeight: number;
  hood: ActuatorPhase;
  drawer: ActuatorPhase;
  hallLightsOn: boolean;
  benchLampOn: boolean;
  playerUnderCar: boolean;
}

export interface EquipmentCallbacks {
  /** O jogador pediu para inspecionar o carro do box. */
  onInspectVehicle(): void;
  /** O jogador abriu o estoque (estantes). */
  onOpenStock(): void;
  /** O jogador abriu o computador de gestão. */
  onOpenComputer(): void;
  /** Resumo do que há no estoque, para o aviso da mira. */
  describeStock(): string;
  /** Nome e linha de detalhe do carro do box (vêm do estado do veículo). */
  describeVehicle(): { name: string; detail: string };
  /** Escala da luz ambiente da cena (1 = luzes acesas). */
  onAmbientScale(scale: number): void;
  /** Motivo de o test drive não poder começar agora (null = pode). Prompt 13. */
  testDriveBlocked(): string | null;
  /** O jogador saiu pelo portão para o test drive. */
  onTestDrive(): void;
  /** O jogador saiu para o bairro de São Cristóvão (Prompt 14). */
  onExitToCity?(): void;
}

/**
 * Estado dos equipamentos da oficina e sua ligação com a cena 3D.
 * As REGRAS ficam em bayRules.ts (puras e testadas); aqui só se aplica o
 * estado e se cria os interativos.
 */
export class WorkshopEquipment {
  readonly lift = new Actuator(EQUIPMENT.lift.travelSeconds);
  readonly hood = new Actuator(EQUIPMENT.hood.travelSeconds);
  readonly drawer = new Actuator(EQUIPMENT.drawer.travelSeconds);
  private hallLightsOn = true;
  private benchLampOn = false;
  private playerUnderCar = false;
  private lightsDirty = true;
  private readonly underCarArea: Box2D;

  constructor(
    private readonly parts: WorkshopParts,
    private readonly callbacks: EquipmentCallbacks,
  ) {
    const f = parts.carFootprint;
    const r = PLAYER_RADIUS;
    this.underCarArea = { minX: f.minX - r, maxX: f.maxX + r, minZ: f.minZ - r, maxZ: f.maxZ + r };
    this.applyVisuals();
  }

  /** Volta tudo ao estado inicial (novo jogo). */
  reset(): void {
    this.lift.reset(0);
    this.hood.reset(0);
    this.drawer.reset(0);
    this.hallLightsOn = true;
    this.benchLampOn = false;
    this.lightsDirty = true;
    this.applyVisuals();
  }

  /** Estado para o save (posição final de cada peça móvel). */
  exportState(): EquipmentSave {
    const up = (p: ActuatorPhase) => p === 'extended' || p === 'extending';
    return {
      liftUp: up(this.lift.phase),
      hoodOpen: up(this.hood.phase),
      drawerOpen: up(this.drawer.phase),
      hallLightsOn: this.hallLightsOn,
      benchLampOn: this.benchLampOn,
    };
  }

  /** Restaura do save, sem animação. Capô aberto com o carro no alto é impossível: fica fechado. */
  restore(e: EquipmentSave): void {
    this.lift.reset(e.liftUp ? 1 : 0);
    this.hood.reset(e.hoodOpen && !e.liftUp ? 1 : 0);
    this.drawer.reset(e.drawerOpen ? 1 : 0);
    this.hallLightsOn = e.hallLightsOn;
    this.benchLampOn = e.benchLampOn;
    this.lightsDirty = true;
    this.applyVisuals();
  }

  /** Avança as animações. Chamar só com o jogo rodando (pausa congela tudo). */
  update(dt: number, player: Point2D): void {
    this.lift.update(dt);
    this.hood.update(dt);
    this.drawer.update(dt);
    this.playerUnderCar = pointInBox(player, this.underCarArea);
    this.applyVisuals();
  }

  snapshot(): EquipmentSnapshot {
    return {
      lift: this.lift.phase,
      liftHeight: this.liftHeight(),
      hood: this.hood.phase,
      drawer: this.drawer.phase,
      hallLightsOn: this.hallLightsOn,
      benchLampOn: this.benchLampOn,
      playerUnderCar: this.playerUnderCar,
    };
  }

  createInteractables(): Interactable[] {
    const E = EQUIPMENT;
    const bay = (): BaySnapshot => ({ lift: this.lift.phase, hood: this.hood.phase, playerUnderCar: this.playerUnderCar });

    return [
      createInteractable({
        id: EQUIPMENT_IDS.lift,
        name: E.lift.name,
        evaluate: () => ({ ...liftAvailability(bay()), detail: E.lift.states[this.lift.phase] }),
        perform: () => {
          this.lift.toggle();
          return this.lift.phase === 'extending' ? E.lift.started.extending : E.lift.started.retracting;
        },
      }),
      createInteractable({
        id: EQUIPMENT_IDS.hood,
        name: `${E.hood.name} · ${this.callbacks.describeVehicle().name}`,
        evaluate: () => ({ ...hoodAvailability(bay()), detail: E.hood.states[this.hood.phase] }),
        perform: () => {
          this.hood.toggle();
          return this.hood.phase === 'extending' ? E.hood.started.extending : E.hood.started.retracting;
        },
      }),
      {
        // Nome e detalhe dinâmicos: vêm do estado do carro.
        id: EQUIPMENT_IDS.car,
        getPrompt: () => {
          const car = this.callbacks.describeVehicle();
          const where = this.lift.phase === 'extended' ? E.vehicle.onLift : E.vehicle.onFloor;
          return { name: car.name, status: 'available', action: E.vehicle.actionInspect, detail: `${car.detail} · ${where}` };
        },
        interact: () => {
          this.callbacks.onInspectVehicle();
          return { ok: true, message: '' };
        },
      },
      createInteractable({
        id: EQUIPMENT_IDS.drawer,
        name: E.drawer.name,
        evaluate: () =>
          this.drawer.moving
            ? { status: 'busy', reason: E.drawer.busy, detail: E.drawer.states[this.drawer.phase] }
            : {
                status: 'available',
                action: this.drawer.phase === 'extended' ? E.drawer.actionClose : E.drawer.actionOpen,
                detail: E.drawer.states[this.drawer.phase],
              },
        perform: () => {
          this.drawer.toggle();
          return this.drawer.phase === 'extending' ? E.drawer.started.extending : E.drawer.started.retracting;
        },
      }),
      createInteractable({
        id: EQUIPMENT_IDS.benchLamp,
        name: E.benchLamp.name,
        evaluate: () => ({
          status: 'available',
          action: this.benchLampOn ? E.benchLamp.actionOff : E.benchLamp.actionOn,
          detail: this.benchLampOn ? E.benchLamp.stateOn : E.benchLamp.stateOff,
        }),
        perform: () => {
          this.benchLampOn = !this.benchLampOn;
          this.lightsDirty = true;
          return this.benchLampOn ? E.benchLamp.stateOn : E.benchLamp.stateOff;
        },
      }),
      createInteractable({
        id: EQUIPMENT_IDS.lightSwitch,
        name: E.lightSwitch.name,
        evaluate: () => ({
          status: 'available',
          action: this.hallLightsOn ? E.lightSwitch.actionOff : E.lightSwitch.actionOn,
          detail: this.hallLightsOn ? E.lightSwitch.stateOn : E.lightSwitch.stateOff,
        }),
        perform: () => {
          this.hallLightsOn = !this.hallLightsOn;
          this.lightsDirty = true;
          return this.hallLightsOn ? E.lightSwitch.doneOn : E.lightSwitch.doneOff;
        },
      }),
      {
        id: EQUIPMENT_IDS.stock,
        getPrompt: () => ({ name: E.stock.name, status: 'available', action: E.stock.action, detail: this.callbacks.describeStock() }),
        interact: () => {
          this.callbacks.onOpenStock();
          return { ok: true, message: '' };
        },
      },
      createInteractable({
        id: EQUIPMENT_IDS.gate,
        name: E.gate.name,
        evaluate: () => {
          if (this.lift.phase !== 'retracted') return { status: 'unavailable', reason: E.gate.needsFloor };
          if (this.hood.phase !== 'retracted') return { status: 'unavailable', reason: E.gate.needsHoodClosed };
          const blocked = this.callbacks.testDriveBlocked();
          return blocked ? { status: 'unavailable', reason: blocked } : { status: 'available', action: E.gate.action, detail: E.gate.detail };
        },
        perform: () => {
          this.callbacks.onTestDrive();
          return '';
        },
      }),
      createInteractable({
        id: EQUIPMENT_IDS.computer,
        name: E.computer.name,
        evaluate: () => ({ status: 'available', action: E.computer.action, detail: E.computer.detail }),
        perform: () => {
          this.callbacks.onOpenComputer();
          return '';
        },
      }),
      createInteractable({
        id: EQUIPMENT_IDS.neighborhood,
        name: E.neighborhood.name,
        evaluate: () => ({ status: 'available', action: E.neighborhood.action, detail: E.neighborhood.detail }),
        perform: () => {
          this.callbacks.onExitToCity?.();
          return '';
        },
      }),
    ];
  }

  private liftHeight(): number {
    return easeInOut(this.lift.position) * EQUIPMENT.lift.maxHeight;
  }

  private applyVisuals(): void {
    const p = this.parts;
    const h = this.liftHeight();
    p.liftCarriage.position.y = h;
    p.car.position.y = h;
    p.carCollider.disabled = !carBlocksWalking(this.lift.phase);

    p.hoodPivot.rotation.z = p.hoodClosedAngle + easeInOut(this.hood.position) * EQUIPMENT.hood.openAngle;

    p.drawer.position.z = easeInOut(this.drawer.position) * EQUIPMENT.drawer.travel;
    p.drawerCollider.disabled = this.drawer.phase === 'retracted';

    if (this.lightsDirty) {
      this.lightsDirty = false;
      const hall = p.hallLights;
      for (const entry of hall.entries) entry.light.intensity = this.hallLightsOn ? entry.on : entry.off;
      hall.tube.emissiveIntensity = this.hallLightsOn ? hall.tubeOnIntensity : 0.03;
      this.callbacks.onAmbientScale(this.hallLightsOn ? 1 : hall.ambientOffFactor);
      const lamp = p.benchLamp;
      lamp.light.intensity = this.benchLampOn ? lamp.onIntensity : 0;
      lamp.tube.emissiveIntensity = this.benchLampOn ? lamp.tubeOnIntensity : 0;
    }
  }
}
