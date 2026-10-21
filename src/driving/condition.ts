import type { Catalogs } from '../vehicles/catalogs';
import { wearBand, type VehicleState } from '../vehicles/state';
import type { DrivingCondition, WarningLight } from './types';

const W = (v: VehicleState, slot: string): number | null => v.parts[slot]?.wear ?? null;
const ramp = (w: number | null, from: number, to: number) => (w === null ? 0 : Math.min(1, Math.max(0, (w - from) / (to - from))));
const bad = (w: number | null) => w !== null && (wearBand(w) === 'critica' || wearBand(w) === 'falhou');
const dead = (w: number | null) => w !== null && w >= 100;

/**
 * Traduz o estado REAL das peças em comportamento (GDD Prompt 13: peso,
 * aderência, pneus e condições básicas). Determinístico e sem sorteio.
 */
export function drivingCondition(v: VehicleState, catalogs: Catalogs): DrivingCondition {
  const missing = Object.entries(v.parts).find(([, p]) => p === null)?.[0];
  const pads = W(v, 'freios.pastilhas-dianteiras');
  const discs = W(v, 'freios.discos-dianteiros');
  const plugs = W(v, 'motor.velas');
  const pump = W(v, 'combustivel.bomba');
  const battery = W(v, 'eletrica.bateria');
  const alternator = W(v, 'eletrica.alternador');
  const clutch = W(v, 'transmissao.kit-embreagem');

  let cannotStart: string | null = null;
  if (missing) cannotStart = `Falta peça: ${catalogs.slots.get(missing)?.name ?? missing}. O carro não anda assim.`;
  else if (dead(battery)) cannotStart = 'A bateria está morta: o motor nem gira.';
  else if (dead(pump)) cannotStart = 'O motor gira mas não pega: não chega combustível.';
  else if (dead(clutch)) cannotStart = 'A embreagem patina: o carro não sai do lugar.';

  const lights: WarningLight[] = [];
  if (bad(battery) || bad(alternator)) lights.push('bateria');
  if (bad(W(v, 'fluidos.oleo-motor'))) lights.push('oleo');
  if (bad(pads) || bad(discs)) lights.push('freio');
  if (bad(plugs) || bad(pump)) lights.push('injecao');

  return {
    grip: 1 - 0.5 * ramp(W(v, 'rodas.pneus'), 40, 100),
    brake: 1 - 0.55 * Math.max(ramp(pads, 40, 100), ramp(discs, 40, 100)),
    brakeShake: ramp(discs, 75, 100),
    sway: ramp(W(v, 'suspensao.amortecedores-dianteiros'), 40, 100),
    misfire: ramp(plugs, 60, 100),
    overheats: bad(W(v, 'arrefecimento.valvula-termostatica')) || bad(W(v, 'arrefecimento.radiador')),
    cannotStart,
    lights,
  };
}
