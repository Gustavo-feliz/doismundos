import { EQUIPMENT } from '../data/equipment';
import type { Availability } from '../interaction/types';
import type { ActuatorPhase } from './Actuator';

/**
 * Regras do box de serviço (elevador + capô do carro), em funções puras.
 * Aqui mora o "não permitir duas ações incompatíveis ao mesmo tempo":
 * - elevador não sobe com o capô aberto ou se movendo;
 * - elevador não desce com o jogador embaixo do carro;
 * - capô só é alcançável com o elevador parado embaixo.
 */
export interface BaySnapshot {
  lift: ActuatorPhase;
  hood: ActuatorPhase;
  playerUnderCar: boolean;
}

const L = EQUIPMENT.lift;
const H = EQUIPMENT.hood;

export function liftAvailability(s: BaySnapshot): Availability {
  if (s.lift === 'extending' || s.lift === 'retracting') return { status: 'busy', reason: L.busy };
  // Vale para qualquer posição do elevador: dois movimentos no mesmo carro, nunca.
  if (s.hood === 'extending' || s.hood === 'retracting') return { status: 'unavailable', reason: L.blockedHoodMoving };

  if (s.lift === 'retracted') {
    if (s.hood === 'extended') return { status: 'unavailable', reason: L.blockedHoodOpen };
    return { status: 'available', action: L.actionRaise };
  }

  // No alto.
  if (s.playerUnderCar) return { status: 'unavailable', reason: L.blockedPlayerUnder };
  return { status: 'available', action: L.actionLower };
}

export function hoodAvailability(s: BaySnapshot): Availability {
  if (s.lift === 'extending' || s.lift === 'retracting') return { status: 'unavailable', reason: H.blockedLiftMoving };
  if (s.lift === 'extended') return { status: 'unavailable', reason: H.blockedLiftUp };
  if (s.hood === 'extending' || s.hood === 'retracting') return { status: 'busy', reason: H.busy };
  return { status: 'available', action: s.hood === 'extended' ? H.actionClose : H.actionOpen };
}

/** O carro só deixa de bloquear a passagem quando está no alto e parado. */
export function carBlocksWalking(lift: ActuatorPhase): boolean {
  return lift !== 'extended';
}
