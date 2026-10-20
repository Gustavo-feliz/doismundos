import type { PartSystem } from '../parts/types';

/**
 * Reputação da oficina (GDD §15.1, Prompt 8): geral e por especialidade,
 * guardadas SEPARADAMENTE. Pontuação 0–100, começa em 50 ("sem fama").
 */
export type Specialty = 'mecanica' | 'eletrica' | 'pintura' | 'tuning';

export const SPECIALTY_LABEL: Readonly<Record<Specialty, string>> = {
  mecanica: 'Mecânica',
  eletrica: 'Elétrica',
  pintura: 'Pintura',
  tuning: 'Tuning',
};

/** Especialidade de cada sistema do carro (pintura e tuning chegam com seus serviços). */
export function specialtyOf(system: PartSystem): Specialty {
  return system === 'eletrica' ? 'eletrica' : 'mecanica';
}

export interface ReputationScore {
  score: number;
  reviews: number;
  starsTotal: number;
}

export interface ReputationEvent {
  text: string;
  delta: number;
  specialty: Specialty;
  day: number;
  time: string;
}

export interface ReputationState {
  general: ReputationScore;
  bySpecialty: Readonly<Record<Specialty, ReputationScore>>;
  events: readonly ReputationEvent[];
}

export const REPUTATION_RULES = { start: 50, perStar: 4, warrantyClaim: -10 } as const;

const fresh = (): ReputationScore => ({ score: REPUTATION_RULES.start, reviews: 0, starsTotal: 0 });

export function initialReputation(): ReputationState {
  return { general: fresh(), bySpecialty: { mecanica: fresh(), eletrica: fresh(), pintura: fresh(), tuning: fresh() }, events: [] };
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

function bump(s: ReputationScore, delta: number, stars: number | null): ReputationScore {
  return {
    score: clamp(s.score + delta),
    reviews: s.reviews + (stars === null ? 0 : 1),
    starsTotal: s.starsTotal + (stars ?? 0),
  };
}

function apply(rep: ReputationState, delta: number, stars: number | null, specialty: Specialty, text: string, when: { day: number; time: string }): ReputationState {
  return {
    general: bump(rep.general, delta, stars),
    bySpecialty: { ...rep.bySpecialty, [specialty]: bump(rep.bySpecialty[specialty], delta, stars) },
    events: [...rep.events, { text, delta, specialty, day: when.day, time: when.time }],
  };
}

/** Avaliação de cliente: (estrelas − 3) × 4 pontos, na geral e na especialidade do serviço. */
export function applyReview(rep: ReputationState, stars: number, specialty: Specialty, text: string, when: { day: number; time: string }): ReputationState {
  return apply(rep, (stars - 3) * REPUTATION_RULES.perStar, stars, specialty, text, when);
}

/** Retorno em garantia por falha do reparo: penalidade fixa. */
export function applyWarrantyPenalty(rep: ReputationState, specialty: Specialty, text: string, when: { day: number; time: string }): ReputationState {
  return apply(rep, REPUTATION_RULES.warrantyClaim, null, specialty, text, when);
}

export function averageStars(s: ReputationScore): number | null {
  return s.reviews ? Math.round((s.starsTotal / s.reviews) * 10) / 10 : null;
}
