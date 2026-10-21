import { canSpend } from '../economy/ledger';
import { formatBRL, type Cents } from '../economy/money';
import { DataValidationError } from '../vehicles/types';
import {
  STAFF_ROLE_LABEL,
  STAFF_STATE_LABEL,
  STAFF_TASK_KIND_LABEL,
  STAFF_TASK_STATUS_LABEL,
  type StaffCandidateDef,
  type StaffEmployee,
  type StaffRole,
  type StaffState,
  type StaffTask,
  type StaffTaskKind,
} from './types';

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ROLES = new Set<string>(Object.keys(STAFF_ROLE_LABEL));
const STATES = new Set<string>(Object.keys(STAFF_STATE_LABEL));
const TASK_KINDS = new Set<string>(Object.keys(STAFF_TASK_KIND_LABEL));
const TASK_STATUSES = new Set<string>(Object.keys(STAFF_TASK_STATUS_LABEL));

/** Cargos compatíveis por tipo de tarefa (GDD §17.1 e §24 Prompt 15). */
export const TASK_ALLOWED_ROLES: Readonly<Record<StaffTaskKind, readonly StaffRole[]>> = {
  'inspecao-visual': ['mecanico', 'ajudante'],
  'organizar-bancada': ['mecanico', 'ajudante'],
  'desmontagem-auxiliar': ['mecanico'],
  'revisao-preventiva': ['mecanico'],
};

/** Valida o catálogo de candidatos a funcionário ao iniciar o jogo. */
export function validateStaffCandidates(candidates: readonly StaffCandidateDef[]): void {
  const problems: string[] = [];
  if (candidates.length < 2) problems.push('catálogo de funcionários deve ter ao menos 2 candidatos');
  const ids = new Set<string>();
  const rolesSeen = new Set<StaffRole>();

  for (const c of candidates) {
    if (!ID_PATTERN.test(c.id)) problems.push(`candidato "${c.id}": ID inválido`);
    if (ids.has(c.id)) problems.push(`candidato duplicado "${c.id}"`);
    ids.add(c.id);
    if (!c.name.trim()) problems.push(`candidato "${c.id}": nome vazio`);
    if (!ROLES.has(c.role)) problems.push(`candidato "${c.id}": cargo desconhecido "${String(c.role)}"`);
    rolesSeen.add(c.role);
    if (!Number.isInteger(c.skill) || c.skill < 1 || c.skill > 100) {
      problems.push(`candidato "${c.id}": habilidade deve ser inteiro de 1 a 100`);
    }
    if (!Number.isFinite(c.speed) || c.speed < 0.5 || c.speed > 2.5) {
      problems.push(`candidato "${c.id}": velocidade fora da faixa (0.5 a 2.5)`);
    }
    if (!Number.isSafeInteger(c.salary) || c.salary <= 0) {
      problems.push(`candidato "${c.id}": salário deve ser inteiro positivo em centavos`);
    }
    if (!c.blurb.trim()) problems.push(`candidato "${c.id}": descrição vazia`);
  }

  if (!rolesSeen.has('mecanico') || !rolesSeen.has('ajudante')) {
    problems.push('catálogo de funcionários deve incluir os 2 cargos: mecanico e ajudante');
  }

  if (problems.length > 0) throw new DataValidationError('funcionários', problems);
}

/** Estado inicial sem funcionários contratados e com fila de tarefas vazia. */
export function initialStaffState(): StaffState {
  return {
    employees: [],
    tasks: [],
    lastPayrollDay: 0,
    nextTaskSeq: 0,
  };
}

/** Calcula o tempo efetivo (em minutos inteiros >= 1) conforme a velocidade do funcionário. */
export function effectiveTaskMinutes(baseMinutes: number, speed: number): number {
  if (baseMinutes <= 0) return 1;
  const safeSpeed = speed > 0 ? speed : 1;
  return Math.max(1, Math.round(baseMinutes / safeSpeed));
}

/** Verifica se o funcionário tem cargo e habilidade compatíveis com a tarefa. */
export function canEmployeeTakeTask(emp: StaffEmployee, task: StaffTask): boolean {
  return task.allowedRoles.includes(emp.role) && emp.skill >= task.minSkill;
}

/**
 * Atribui tarefas pendentes (`status === 'pendente'` e `assignedTo === null`)
 * aos funcionários disponíveis (`state === 'disponivel'` e `currentTaskId === null`).
 *
 * Regra de concorrência (GDD §24 Prompt 15):
 * Dois funcionários NUNCA assumem a mesma tarefa. Assim que o primeiro funcionário
 * compatível assume uma tarefa, ela passa a `'em-andamento'` com `assignedTo = emp.id`,
 * ficando indisponível para os demais.
 */
export function assignAvailableTasks(state: StaffState): StaffState {
  const employees = state.employees.map((e) => ({ ...e }));
  const tasks = state.tasks.map((t) => ({ ...t, allowedRoles: [...t.allowedRoles] }));

  for (const emp of employees) {
    if (emp.state !== 'disponivel' || emp.currentTaskId !== null) continue;
    const task = tasks.find(
      (t) => t.status === 'pendente' && t.assignedTo === null && canEmployeeTakeTask(emp, t),
    );
    if (!task) continue;
    const totalMinutes = effectiveTaskMinutes(task.baseMinutes, emp.speed);
    task.status = 'em-andamento';
    task.assignedTo = emp.id;
    task.totalMinutes = Math.max(task.progressMinutes + 1, totalMinutes);
    emp.state = 'ocupado';
    emp.currentTaskId = task.id;
  }

  return {
    ...state,
    employees,
    tasks,
  };
}

/**
 * Permite que um funcionário específico tente assumir uma tarefa específica.
 * Recusa se a tarefa já estiver assumida por outro funcionário, se o funcionário
 * não estiver disponível ou se não tiver cargo/habilidade compatível.
 */
export function claimTask(
  state: StaffState,
  employeeId: string,
  taskId: string,
): { ok: true; state: StaffState } | { ok: false; message: string } {
  const empIndex = state.employees.findIndex((e) => e.id === employeeId);
  if (empIndex < 0) return { ok: false, message: 'Funcionário não encontrado.' };
  const emp = state.employees[empIndex]!;
  if (emp.state === 'pausado') return { ok: false, message: `${emp.name} está pausado.` };
  if (emp.state === 'ocupado' || emp.currentTaskId !== null) {
    return { ok: false, message: `${emp.name} já está ocupado em outra tarefa.` };
  }

  const taskIndex = state.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex < 0) return { ok: false, message: 'Tarefa não encontrada na fila.' };
  const task = state.tasks[taskIndex]!;
  if (task.status === 'concluida') {
    return { ok: false, message: 'Esta tarefa já foi concluída.' };
  }
  if (task.status !== 'pendente' || task.assignedTo !== null) {
    return { ok: false, message: 'Esta tarefa já foi assumida por outro funcionário.' };
  }
  if (!canEmployeeTakeTask(emp, task)) {
    return {
      ok: false,
      message: `${emp.name} (${STAFF_ROLE_LABEL[emp.role]}, hab. ${emp.skill}) não atende aos requisitos da tarefa (hab. mín. ${task.minSkill}).`,
    };
  }

  const totalMinutes = Math.max(task.progressMinutes + 1, effectiveTaskMinutes(task.baseMinutes, emp.speed));
  const employees = state.employees.map((e, i) =>
    i === empIndex ? { ...e, state: 'ocupado' as const, currentTaskId: task.id } : e,
  );
  const tasks = state.tasks.map((t, i) =>
    i === taskIndex ? { ...t, status: 'em-andamento' as const, assignedTo: emp.id, totalMinutes } : t,
  );

  return {
    ok: true,
    state: { ...state, employees, tasks },
  };
}

export interface EnqueueTaskInput {
  kind: StaffTaskKind;
  title: string;
  minSkill: number;
  baseMinutes: number;
  allowedRoles?: readonly StaffRole[];
  targetCaseId?: string | null;
  targetSlot?: string | null;
}

/**
 * Adiciona uma nova tarefa à fila e já atribui a um funcionário disponível compatível, se houver.
 * Impede duplicar a mesma tarefa ativa (`pendente` ou `em-andamento`) para o mesmo `kind`, `targetCaseId` e `targetSlot`.
 */
export function enqueueTask(
  state: StaffState,
  input: EnqueueTaskInput,
): { ok: true; state: StaffState; task: StaffTask } | { ok: false; message: string } {
  if (!TASK_KINDS.has(input.kind)) return { ok: false, message: 'Tipo de tarefa inválido.' };
  if (!input.title.trim()) return { ok: false, message: 'Título da tarefa vazio.' };
  if (!Number.isInteger(input.minSkill) || input.minSkill < 1 || input.minSkill > 100) {
    return { ok: false, message: 'Habilidade mínima inválida.' };
  }
  if (!Number.isInteger(input.baseMinutes) || input.baseMinutes < 1) {
    return { ok: false, message: 'Tempo base da tarefa inválido.' };
  }

  const targetCaseId = input.targetCaseId ?? null;
  const targetSlot = input.targetSlot ?? null;
  if (targetSlot !== null) {
    const duplicate = state.tasks.some(
      (t) =>
        t.status !== 'concluida' &&
        t.kind === input.kind &&
        t.targetCaseId === targetCaseId &&
        t.targetSlot === targetSlot,
    );
    if (duplicate) {
      return { ok: false, message: 'Essa tarefa já está na fila ou em andamento.' };
    }
  }

  const seq = state.nextTaskSeq + 1;
  const id = `TAR-${String(seq).padStart(4, '0')}`;
  const allowedRoles = input.allowedRoles ? [...input.allowedRoles] : [...TASK_ALLOWED_ROLES[input.kind]];
  const task: StaffTask = {
    id,
    kind: input.kind,
    title: input.title.trim(),
    allowedRoles,
    minSkill: input.minSkill,
    baseMinutes: input.baseMinutes,
    totalMinutes: input.baseMinutes,
    progressMinutes: 0,
    status: 'pendente',
    assignedTo: null,
    targetCaseId,
    targetSlot,
    completedAt: null,
    completedBy: null,
    resultText: null,
  };

  const nextState = assignAvailableTasks({
    ...state,
    nextTaskSeq: seq,
    tasks: [...state.tasks, task],
  });
  const updatedTask = nextState.tasks.find((t) => t.id === id)!;
  return { ok: true, state: nextState, task: updatedTask };
}

/**
 * Contrata um candidato disponível, cobrando o primeiro dia de salário no ato da contratação.
 */
export function hireCandidate(
  state: StaffState,
  candidate: StaffCandidateDef,
  cash: Cents,
  creditLimit: Cents,
  day: number,
): { ok: true; state: StaffState; employee: StaffEmployee; cost: Cents } | { ok: false; message: string } {
  if (state.employees.some((e) => e.id === candidate.id)) {
    return { ok: false, message: `${candidate.name} já faz parte da equipe.` };
  }
  if (!canSpend(cash, candidate.salary, creditLimit)) {
    return {
      ok: false,
      message: `Caixa insuficiente para contratar ${candidate.name}: o adiantamento salarial custa ${formatBRL(candidate.salary)} e há ${formatBRL(cash)} no caixa.`,
    };
  }
  const employee: StaffEmployee = {
    id: candidate.id,
    name: candidate.name,
    role: candidate.role,
    skill: candidate.skill,
    speed: candidate.speed,
    salary: candidate.salary,
    state: 'disponivel',
    currentTaskId: null,
    hiredDay: day,
    paidDay: day, // o adiantamento cobre o dia da contratação
    completedTasks: 0,
  };
  const nextState = assignAvailableTasks({
    ...state,
    employees: [...state.employees, employee],
  });
  return {
    ok: true,
    state: nextState,
    employee: nextState.employees.find((e) => e.id === candidate.id)!,
    cost: candidate.salary,
  };
}

/**
 * Pausa ou retoma o trabalho de um funcionário.
 * Se estava ocupado, devolve a tarefa para a fila (`pendente`, `assignedTo: null`),
 * preservando o progresso já feito, para que outro funcionário compatível possa assumir.
 */
export function toggleEmployeePause(
  state: StaffState,
  employeeId: string,
): { ok: true; state: StaffState; paused: boolean; employee: StaffEmployee } | { ok: false; message: string } {
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) return { ok: false, message: 'Funcionário não encontrado.' };

  if (emp.state === 'pausado') {
    const resumed = assignAvailableTasks({
      ...state,
      employees: state.employees.map((e) =>
        e.id === employeeId ? { ...e, state: 'disponivel' as const, currentTaskId: null } : e,
      ),
    });
    return {
      ok: true,
      state: resumed,
      paused: false,
      employee: resumed.employees.find((e) => e.id === employeeId)!,
    };
  }

  const releasedTaskId = emp.currentTaskId;
  const tasks = state.tasks.map((t) =>
    t.id === releasedTaskId && t.status === 'em-andamento'
      ? { ...t, status: 'pendente' as const, assignedTo: null }
      : t,
  );
  const employees = state.employees.map((e) =>
    e.id === employeeId ? { ...e, state: 'pausado' as const, currentTaskId: null } : e,
  );
  const reassigned = assignAvailableTasks({ ...state, employees, tasks });
  return {
    ok: true,
    state: reassigned,
    paused: true,
    employee: reassigned.employees.find((e) => e.id === employeeId)!,
  };
}

/**
 * Demite um funcionário da oficina.
 * Se ele estava executando uma tarefa, ela volta para `'pendente'` com `assignedTo: null`
 * (mantendo o progresso parcial) e pode ser assumida por outro funcionário disponível.
 */
export function fireEmployee(
  state: StaffState,
  employeeId: string,
): { ok: true; state: StaffState; fired: StaffEmployee } | { ok: false; message: string } {
  const emp = state.employees.find((e) => e.id === employeeId);
  if (!emp) return { ok: false, message: 'Funcionário não encontrado.' };

  const releasedTaskId = emp.currentTaskId;
  const tasks = state.tasks.map((t) =>
    t.id === releasedTaskId && t.status === 'em-andamento'
      ? { ...t, status: 'pendente' as const, assignedTo: null }
      : t,
  );
  const employees = state.employees.filter((e) => e.id !== employeeId);
  const reassigned = assignAvailableTasks({ ...state, employees, tasks });
  return {
    ok: true,
    state: reassigned,
    fired: emp,
  };
}

/** Soma salarial diária de todos os funcionários contratados. */
export function payrollTotal(state: StaffState): Cents {
  return state.employees.reduce((sum, e) => sum + e.salary, 0);
}

/** Quanto falta pagar hoje: só quem ainda não recebeu o dia (quem foi contratado hoje já recebeu). */
export function payrollDue(state: StaffState, day: number): Cents {
  return state.employees.filter((e) => e.paidDay < day).reduce((sum, e) => sum + e.salary, 0);
}

/** Dia do jogo de um minuto absoluto (1 = primeiro dia). */
const dayOfMinute = (minute: number) => Math.floor(minute / (24 * 60)) + 1;

/**
 * Processa o pagamento da folha salarial do dia atual.
 */
export function payPayroll(
  state: StaffState,
  cash: Cents,
  creditLimit: Cents,
  day: number,
): { ok: true; state: StaffState; total: Cents; count: number } | { ok: false; message: string } {
  if (state.employees.length === 0) {
    return { ok: false, message: 'Nenhum funcionário contratado na equipe.' };
  }
  const owed = state.employees.filter((e) => e.paidDay < day);
  if (owed.length === 0) {
    return { ok: false, message: `A folha salarial do dia ${day} já foi paga.` };
  }
  const total = owed.reduce((sum, e) => sum + e.salary, 0);
  if (!canSpend(cash, total, creditLimit)) {
    return {
      ok: false,
      message: `Caixa insuficiente para a folha salarial: custa ${formatBRL(total)} e há ${formatBRL(cash)} no caixa.`,
    };
  }
  return {
    ok: true,
    state: { ...state, lastPayrollDay: day, employees: state.employees.map((e) => (e.paidDay < day ? { ...e, paidDay: day } : e)) },
    total,
    count: owed.length,
  };
}

/**
 * Avança o trabalho dos funcionários ocupados por `minutes` minutos de jogo.
 * Quando uma tarefa atinge `totalMinutes`, ela é concluída, reporta o resultado
 * e o funcionário fica disponível imediatamente para pegar a próxima tarefa da fila
 * com os minutos restantes.
 */
export function advanceStaffWork(
  state: StaffState,
  minutes: number,
  nowMinute: number,
): { state: StaffState; completed: StaffTask[] } {
  if (minutes <= 0) {
    return { state: assignAvailableTasks(state), completed: [] };
  }

  let current = assignAvailableTasks(state);
  const completed: StaffTask[] = [];
  let remaining = Math.floor(minutes);

  while (remaining > 0) {
    const busyTasks = current.tasks.filter(
      (t) => t.status === 'em-andamento' && t.assignedTo !== null,
    );
    if (busyTasks.length === 0) break;

    const minNeeded = Math.min(
      ...busyTasks.map((t) => Math.max(1, t.totalMinutes - t.progressMinutes)),
    );
    const step = Math.min(remaining, minNeeded);
    remaining -= step;
    const stepEndMinute = nowMinute - remaining;

    const employees = current.employees.map((e) => ({ ...e }));
    const tasks = current.tasks.map((t) => ({ ...t, allowedRoles: [...t.allowedRoles] }));

    for (const task of tasks) {
      if (task.status !== 'em-andamento' || task.assignedTo === null) continue;
      const emp = employees.find((e) => e.id === task.assignedTo);
      if (!emp || emp.state !== 'ocupado') continue;

      // Sem o salário do dia, o funcionário fica parado (a tarefa espera, sem perder o progresso).
      if (emp.paidDay < dayOfMinute(stepEndMinute)) continue;
      task.progressMinutes = Math.min(task.totalMinutes, task.progressMinutes + step);
      if (task.progressMinutes >= task.totalMinutes) {
        task.status = 'concluida';
        const workerId = emp.id;
        const workerName = emp.name;
        task.assignedTo = null;
        task.completedAt = stepEndMinute;
        task.completedBy = workerId;
        task.resultText = `${workerName} concluiu: ${task.title}`;
        emp.state = 'disponivel';
        emp.currentTaskId = null;
        emp.completedTasks += 1;
        completed.push({ ...task });
      }
    }

    current = assignAvailableTasks({
      ...current,
      employees,
      tasks,
    });
  }

  return { state: current, completed };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);

/** Valida `StaffState` vindo de um arquivo de save (GDD §21.4). */
export function staffStateProblems(
  raw: unknown,
  candidates: readonly StaffCandidateDef[],
): string[] {
  if (!isObj(raw)) return ['estado de funcionários ausente'];
  const p: string[] = [];
  const s = raw as Partial<StaffState>;
  if (!Array.isArray(s.employees) || !Array.isArray(s.tasks)) {
    return ['listas de funcionários ou tarefas ausentes'];
  }
  if (!isInt(s.lastPayrollDay) || s.lastPayrollDay < 0) p.push('dia da folha salarial inválido');
  if (!isInt(s.nextTaskSeq) || s.nextTaskSeq < 0) p.push('sequencial de tarefas inválido');

  const candidateIds = new Set(candidates.map((c) => c.id));
  const empIds = new Set<string>();
  const claimedTaskIds = new Set<string>();

  for (const e of s.employees) {
    if (!isObj(e) || typeof e.id !== 'string' || !candidateIds.has(e.id)) {
      p.push(`funcionário desconhecido: "${isObj(e) ? String(e.id) : '?'}"`);
      continue;
    }
    if (empIds.has(e.id)) p.push(`funcionário duplicado: "${e.id}"`);
    empIds.add(e.id);
    if (!ROLES.has(String(e.role)) || !STATES.has(String(e.state))) {
      p.push(`funcionário "${e.id}": cargo ou estado inválido`);
    }
    if (!isInt(e.skill) || e.skill < 1 || e.skill > 100 || !isInt(e.salary) || e.salary <= 0) {
      p.push(`funcionário "${e.id}": atributos inválidos`);
    }
    if (!isInt(e.paidDay) || e.paidDay < 0) p.push(`funcionário "${e.id}": dia de salário pago inválido`);
    if (e.state === 'ocupado') {
      if (typeof e.currentTaskId !== 'string' || !e.currentTaskId) {
        p.push(`funcionário "${e.id}": ocupado sem tarefa atribuída`);
      } else if (claimedTaskIds.has(e.currentTaskId)) {
        p.push(`concorrência inválida: dois funcionários na tarefa "${e.currentTaskId}"`);
      } else {
        claimedTaskIds.add(e.currentTaskId);
      }
    } else if (e.currentTaskId !== null) {
      p.push(`funcionário "${e.id}": não ocupado mas com currentTaskId`);
    }
  }

  const taskIds = new Set<string>();
  for (const t of s.tasks) {
    if (!isObj(t) || typeof t.id !== 'string' || !t.id) {
      p.push('tarefa sem id');
      continue;
    }
    if (taskIds.has(t.id)) p.push(`tarefa duplicada: "${t.id}"`);
    taskIds.add(t.id);
    if (!TASK_KINDS.has(String(t.kind)) || !TASK_STATUSES.has(String(t.status))) {
      p.push(`tarefa "${t.id}": tipo ou status inválido`);
    }
    if (
      !isInt(t.baseMinutes) ||
      t.baseMinutes < 1 ||
      !isInt(t.totalMinutes) ||
      t.totalMinutes < 1 ||
      !isInt(t.progressMinutes) ||
      t.progressMinutes < 0 ||
      t.progressMinutes > t.totalMinutes
    ) {
      p.push(`tarefa "${t.id}": tempos inválidos`);
    }
    if (t.status === 'em-andamento') {
      if (typeof t.assignedTo !== 'string' || !empIds.has(t.assignedTo)) {
        p.push(`tarefa "${t.id}": em andamento sem funcionário válido`);
      }
    } else if (t.assignedTo !== null) {
      p.push(`tarefa "${t.id}": status "${String(t.status)}" não pode ter assignedTo`);
    }
  }

  return p;
}
