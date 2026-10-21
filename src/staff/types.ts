import type { Cents } from '../economy/money';

/**
 * Cargos disponíveis no protótipo de funcionários (GDD §17.1 e §24 Prompt 15):
 * - `'mecanico'`: executa tarefas técnicas (desmontagem auxiliar, revisão preventiva) e gerais.
 * - `'ajudante'`: executa tarefas de apoio (inspeção visual inicial, organização de bancada/box).
 */
export type StaffRole = 'mecanico' | 'ajudante';

export const STAFF_ROLE_LABEL: Readonly<Record<StaffRole, string>> = {
  mecanico: 'Mecânico',
  ajudante: 'Ajudante',
};

/** Estado operacional atual do funcionário na oficina. */
export type StaffEmployeeState = 'disponivel' | 'ocupado' | 'pausado';

export const STAFF_STATE_LABEL: Readonly<Record<StaffEmployeeState, string>> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  pausado: 'Pausado',
};

/** Tipos de tarefas que podem entrar na fila de automação básica da oficina. */
export type StaffTaskKind =
  | 'inspecao-visual'
  | 'organizar-bancada'
  | 'desmontagem-auxiliar'
  | 'revisao-preventiva';

export const STAFF_TASK_KIND_LABEL: Readonly<Record<StaffTaskKind, string>> = {
  'inspecao-visual': 'Inspeção visual de peça',
  'organizar-bancada': 'Organizar bancada e ferramentas',
  'desmontagem-auxiliar': 'Desmontagem de peça na OS',
  'revisao-preventiva': 'Revisão técnica de sistema',
};

/** Ficha de candidato disponível para contratação (conteúdo estático em `src/data/staff.ts`). */
export interface StaffCandidateDef {
  id: string;
  name: string;
  role: StaffRole;
  /** Habilidade técnica (1 a 100): define quais tarefas pode assumir. */
  skill: number;
  /** Multiplicador de velocidade (ex.: 1.0 = tempo base, 1.25 = 20% mais rápido). */
  speed: number;
  /** Salário diário na folha salarial (em centavos inteiros). */
  salary: Cents;
  /** Resumo fictício do perfil profissional. */
  blurb: string;
}

/** Funcionário contratado na sessão (serializado no save). */
export interface StaffEmployee {
  id: string;
  name: string;
  role: StaffRole;
  skill: number;
  speed: number;
  salary: Cents;
  state: StaffEmployeeState;
  /** ID da tarefa em execução quando `state === 'ocupado'`, ou `null`. */
  currentTaskId: string | null;
  hiredDay: number;
  /** Último dia com salário pago. Sem o salário do dia, o funcionário não trabalha (QA, Prompt 18). */
  paidDay: number;
  completedTasks: number;
}

export type StaffTaskStatus = 'pendente' | 'em-andamento' | 'concluida';

export const STAFF_TASK_STATUS_LABEL: Readonly<Record<StaffTaskStatus, string>> = {
  pendente: 'Na fila',
  'em-andamento': 'Em execução',
  concluida: 'Concluída',
};

/** Tarefa na fila de trabalho da oficina (serializada no save). */
export interface StaffTask {
  id: string;
  kind: StaffTaskKind;
  title: string;
  allowedRoles: readonly StaffRole[];
  minSkill: number;
  baseMinutes: number;
  /** Tempo total calculado com a velocidade do funcionário que assumiu (ou `baseMinutes` enquanto pendente). */
  totalMinutes: number;
  progressMinutes: number;
  status: StaffTaskStatus;
  /** ID do funcionário que assumiu a tarefa (`null` se pendente ou concluída). */
  assignedTo: string | null;
  /** OS associada (opcional). */
  targetCaseId: string | null;
  /** Posição de peça associada (opcional, ex.: para inspeção visual ou desmontagem). */
  targetSlot: string | null;
  completedAt: number | null;
  completedBy: string | null;
  resultText: string | null;
}

/** Estado completo de equipe e fila de tarefas guardado na `GameSession` / `SessionSnapshot`. */
export interface StaffState {
  employees: StaffEmployee[];
  tasks: StaffTask[];
  /** Último dia em que a folha salarial foi paga (0 = ainda não paga). */
  lastPayrollDay: number;
  /** Sequencial determinístico para IDs de tarefas (`TAR-0001`, `TAR-0002`...). */
  nextTaskSeq: number;
}
