/**
 * Contrato de interação (GDD Prompt 2): todo objeto interativo informa um
 * estado explícito — disponível, em uso ou indisponível — e a ação possível.
 */
export type InteractionStatus = 'available' | 'busy' | 'unavailable';

export interface Availability {
  status: InteractionStatus;
  /** Ação executada pela tecla de interação (quando disponível). */
  action?: string;
  /** Por que não dá agora (em uso / indisponível). */
  reason?: string;
}

export interface InteractionPrompt extends Availability {
  name: string;
  /** Estado conhecido do objeto (ex.: "Abaixado"). */
  detail?: string;
}

export interface InteractionResult {
  ok: boolean;
  message: string;
}

export interface Interactable {
  readonly id: string;
  getPrompt(): InteractionPrompt;
  interact(): InteractionResult;
}

export interface InteractableSpec {
  id: string;
  name: string;
  /** Avalia o estado atual. Chamado ao mirar e de novo ao executar. */
  evaluate(): Availability & { detail?: string };
  /** Executa a ação. Só é chamado se evaluate() disser 'available'. Retorna a mensagem de retorno. */
  perform(): string;
}

/**
 * Cria um interativo que sempre revalida o estado na hora de executar:
 * o que estava disponível ao mirar pode ter mudado até o jogador apertar a tecla.
 */
export function createInteractable(spec: InteractableSpec): Interactable {
  return {
    id: spec.id,
    getPrompt() {
      return { name: spec.name, ...spec.evaluate() };
    },
    interact() {
      const now = spec.evaluate();
      if (now.status !== 'available') {
        return { ok: false, message: now.reason ?? 'Indisponível no momento' };
      }
      return { ok: true, message: spec.perform() };
    },
  };
}
