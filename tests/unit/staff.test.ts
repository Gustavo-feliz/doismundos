import { describe, expect, it } from 'vitest';
import { STAFF_CANDIDATES } from '../../src/data/staff';
import { GameSession } from '../../src/game/GameSession';
import { buildComputerView } from '../../src/orders/views';
import { checksum, parseSave, SAVE_SCHEMA_VERSION, type SaveGame } from '../../src/save/saveFile';
import { validateSessionSnapshot } from '../../src/save/sessionSnapshot';
import { initialMissionState, missionStateProblems } from '../../src/missions/MissionTracker';
import { buildMissionLibrary } from '../../src/missions/validate';
import { DIALOGUES, MISSIONS } from '../../src/data/missions';
import { EQUIPMENT_IDS } from '../../src/data/equipment';
import {
  advanceStaffWork,
  claimTask,
  effectiveTaskMinutes,
  enqueueTask,
  initialStaffState,
  staffStateProblems,
  validateStaffCandidates,
} from '../../src/staff/rules';
import { DataValidationError } from '../../src/vehicles/types';
import { catalogs, content, later, newSession, when } from './fixtures';

const lib = buildMissionLibrary(MISSIONS, DIALOGUES, Object.values(EQUIPMENT_IDS));
const validateSession = (g: Record<string, unknown>) => [
  ...validateSessionSnapshot(g.session, catalogs, (id) => GameSession.resolveCase(content, id, catalogs), content.upgrades),
  ...missionStateProblems(g.missions, lib),
];

describe('Prompt 15 — Funcionários e automação básica (regras puras e domínio)', () => {
  it('valida o catálogo de candidatos com 2 cargos (mecanico e ajudante) e rejeita dados inválidos', () => {
    expect(() => validateStaffCandidates(STAFF_CANDIDATES)).not.toThrow();
    const roles = new Set(STAFF_CANDIDATES.map((c) => c.role));
    expect(roles.has('mecanico')).toBe(true);
    expect(roles.has('ajudante')).toBe(true);

    expect(() =>
      validateStaffCandidates([
        { id: 'Invalido', name: '', role: 'mecanico', skill: 150, speed: 0.1, salary: 0, blurb: '' },
      ]),
    ).toThrow(DataValidationError);
  });

  it('impede que dois funcionários assumam a mesma tarefa (concorrência de fila e claimTask explícito)', () => {
    const s = newSession();
    expect(s.hireEmployee('caio-ajudante', when).ok).toBe(true);
    expect(s.hireEmployee('bianca-ajudante', when).ok).toBe(true);

    // Enfileira 1 tarefa compatível com ambos: só o primeiro disponível assume
    const enq1 = s.enqueueStandardStaffTask('std-organizar-bancada');
    expect(enq1.ok).toBe(true);

    const empCaio = s.staff.employees.find((e) => e.id === 'caio-ajudante')!;
    const empBianca = s.staff.employees.find((e) => e.id === 'bianca-ajudante')!;
    const task1 = s.staff.tasks[0]!;

    expect(task1.status).toBe('em-andamento');
    expect(task1.assignedTo).toBe('caio-ajudante');
    expect(empCaio.state).toBe('ocupado');
    expect(empCaio.currentTaskId).toBe(task1.id);
    expect(empBianca.state).toBe('disponivel');
    expect(empBianca.currentTaskId).toBeNull();

    // Tentativa explícita de fazer o segundo funcionário assumir a mesma tarefa é recusada
    const concurrentClaim = claimTask(s.staff, 'bianca-ajudante', task1.id);
    expect(concurrentClaim.ok).toBe(false);
    if (!concurrentClaim.ok) {
      expect(concurrentClaim.message).toContain('já foi assumida por outro funcionário');
    }

    // Enfileira uma 2ª tarefa: agora Bianca (que estava disponível) assume a 2ª
    const enq2 = s.enqueueStandardStaffTask('std-inspecao-box');
    expect(enq2.ok).toBe(true);
    const task2 = s.staff.tasks[1]!;
    expect(task2.assignedTo).toBe('bianca-ajudante');
    expect(s.staff.employees.find((e) => e.id === 'bianca-ajudante')!.currentTaskId).toBe(task2.id);
  });

  it('respeita compatibilidade de cargo e habilidade mínima ao selecionar tarefas da fila', () => {
    let state = initialStaffState();
    // Enfileira tarefa exclusiva de mecânico com hab >= 70
    const resTask = enqueueTask(state, {
      kind: 'revisao-preventiva',
      title: 'Revisão técnica de freios',
      minSkill: 70,
      baseMinutes: 25,
    });
    expect(resTask.ok).toBe(true);
    if (!resTask.ok) return;
    state = resTask.state;

    // Sessão contrata ajudante (skill 35): tarefa continua pendente
    const s = newSession();
    s.enqueueStandardStaffTask('std-revisao-preventiva');
    s.hireEmployee('caio-ajudante', when);
    expect(s.staff.tasks[0]!.status).toBe('pendente');
    expect(s.staff.tasks[0]!.assignedTo).toBeNull();
    expect(s.staff.employees[0]!.state).toBe('disponivel');

    // Contrata mecânico com hab 70: assume imediatamente a tarefa pendente
    s.hireEmployee('marcos-mecanico', when);
    expect(s.staff.tasks[0]!.status).toBe('em-andamento');
    expect(s.staff.tasks[0]!.assignedTo).toBe('marcos-mecanico');
  });

  it('executa progresso proporcional à velocidade, reporta conclusão e revela peça na inspeção visual', () => {
    const s = newSession();
    // Caio tem speed 1.2 -> tarefa de 15 min leva round(15 / 1.2) = 13 min
    expect(effectiveTaskMinutes(15, 1.2)).toBe(13);
    s.hireEmployee('caio-ajudante', when);
    s.enqueueStandardStaffTask('std-inspecao-box');

    const taskBefore = s.staff.tasks[0]!;
    expect(taskBefore.totalMinutes).toBe(13);
    const inspectedSlot = taskBefore.targetSlot!;
    expect(inspectedSlot).toBeTruthy();
    expect(s.getVehicle(s.activeCase!.vehicle.id).knowledge[inspectedSlot]?.status).toBe('desconhecido');

    // Avança 5 minutos: ainda em andamento (5/13)
    const partial = s.advanceStaff(5, later(5));
    expect(partial).toHaveLength(0);
    expect(s.staff.tasks[0]!.progressMinutes).toBe(5);

    // Avança mais 10 minutos: conclui a tarefa, libera o funcionário e revela a condição visual da peça
    const done = s.advanceStaff(10, later(15));
    expect(done).toHaveLength(1);
    expect(done[0]!.status).toBe('concluida');
    expect(done[0]!.resultText).toContain('concluiu');
    expect(s.staff.employees[0]!.state).toBe('disponivel');
    expect(s.staff.employees[0]!.completedTasks).toBe(1);
    expect(s.getVehicle(s.activeCase!.vehicle.id).knowledge[inspectedSlot]?.status).toBe('avaliado');
  });

  it('pausa e demissão liberam a tarefa em andamento para outro funcionário disponível sem perder o progresso', () => {
    const s = newSession();
    s.hireEmployee('caio-ajudante', when);
    s.hireEmployee('bianca-ajudante', when);

    // Pausa Bianca para que só Caio assuma a tarefa inicial
    expect(s.togglePauseEmployee('bianca-ajudante').ok).toBe(true);
    expect(s.staff.employees.find((e) => e.id === 'bianca-ajudante')!.state).toBe('pausado');

    s.enqueueStandardStaffTask('std-organizar-bancada');
    s.advanceStaff(4, later(4));
    expect(s.staff.tasks[0]!.assignedTo).toBe('caio-ajudante');
    expect(s.staff.tasks[0]!.progressMinutes).toBe(4);

    // Retoma Bianca e pausa Caio: a tarefa passa imediatamente para Bianca mantendo os 4 min de progresso
    s.togglePauseEmployee('bianca-ajudante');
    const pauseCaio = s.togglePauseEmployee('caio-ajudante');
    expect(pauseCaio.ok).toBe(true);
    expect(s.staff.tasks[0]!.assignedTo).toBe('bianca-ajudante');
    expect(s.staff.tasks[0]!.progressMinutes).toBe(4);

    // Demite Bianca: a tarefa volta para 'pendente' mantendo os 4 min de progresso
    const fireBianca = s.fireEmployee('bianca-ajudante');
    expect(fireBianca.ok).toBe(true);
    expect(s.staff.employees.map((e) => e.id)).toEqual(['caio-ajudante']);
    expect(s.staff.tasks[0]!.status).toBe('pendente');
    expect(s.staff.tasks[0]!.assignedTo).toBeNull();
    expect(s.staff.tasks[0]!.progressMinutes).toBe(4);
  });

  it('trata caixa insuficiente na contratação e na folha salarial, e registra folha no livro-caixa', () => {
    const poor = newSession({ economy: { startingCash: 50_00, creditLimit: 0 } });
    const hireFail = poor.hireEmployee('caio-ajudante', when);
    expect(hireFail.ok).toBe(false);
    expect(hireFail.message).toMatch(/Caixa insuficiente/);
    expect(poor.staff.employees).toHaveLength(0);

    // Com caixa para contratar mas sem caixa suficiente para a folha do dia seguinte
    const tight = newSession({ economy: { startingCash: 100_00, creditLimit: 0 } });
    expect(tight.hireEmployee('caio-ajudante', when).ok).toBe(true);
    expect(tight.cash).toBe(10_00);
    expect(tight.transactions.at(-1)?.category).toBe('folha-salarial');

    const payrollFail = tight.payStaffPayroll(when);
    expect(payrollFail.ok).toBe(false);
    expect(payrollFail.message).toMatch(/Caixa insuficiente para a folha salarial/);

    // Em sessão com saldo normal, paga a folha do dia 1 e impede pagar duas vezes no mesmo dia
    const normal = newSession();
    normal.hireEmployee('caio-ajudante', when);
    normal.hireEmployee('marcos-mecanico', when);
    const cashBeforePayroll = normal.cash;
    const payOk = normal.payStaffPayroll(when);
    expect(payOk.ok).toBe(true);
    expect(normal.cash).toBe(cashBeforePayroll - (90_00 + 180_00));
    expect(normal.recomputeCash()).toBe(normal.cash);

    const payDuplicate = normal.payStaffPayroll(when);
    expect(payDuplicate.ok).toBe(false);
    expect(payDuplicate.message).toMatch(/já foi paga/);

    const view = buildComputerView(normal, when.at, normal.activeCase!.vehicle.id);
    expect(view.staff.payroll.paidToday).toBe(true);
    expect(view.staff.employees).toHaveLength(2);
  });

  it('persiste no save v5, migra saves da versão 4 e rejeita concorrência inválida no snapshot', () => {
    const s = newSession();
    s.hireEmployee('marcos-mecanico', when);
    s.enqueueStandardStaffTask('std-revisao-preventiva');
    s.advanceStaff(8, later(8));

    const snap = JSON.parse(JSON.stringify(s.toSnapshot()));
    const restored = GameSession.fromSnapshot(catalogs, content, snap);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.session.staff).toEqual(s.staff);

    // Migração v4 → v5
    const shell: SaveGame = {
      clockMinutes: 600,
      player: { x: 0, z: 0, yaw: 0, pitch: 0 },
      equipment: { liftUp: false, hoodOpen: false, drawerOpen: false, hallLightsOn: true, benchLampOn: false },
      session: newSession().toSnapshot(),
      missions: initialMissionState(),
    };
    const v4Game = JSON.parse(JSON.stringify(shell)) as Record<string, any>;
    delete v4Game.session.staff;
    const envV4 = {
      schemaVersion: 4,
      savedAt: '2026-10-20T12:00:00.000Z',
      slot: 'slot1',
      summary: { day: 1, time: '10:00', cashText: 'R$ 1.500,00', orderLabel: 'OS #001', reputation: 50 },
      checksum: checksum(JSON.stringify(v4Game)),
      game: v4Game,
    };
    const migrated = parseSave(JSON.stringify(envV4), validateSession);
    expect(migrated).toMatchObject({ ok: true, migratedFrom: 4 });
    if (migrated.ok) {
      expect(migrated.envelope.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
      expect(migrated.envelope.game.session.staff).toEqual(initialStaffState());
    }

    // Rejeita snapshot corrompido com dois funcionários na mesma tarefa
    const badStaff = initialStaffState();
    badStaff.employees = [
      { id: 'caio-ajudante', name: 'Caio', role: 'ajudante', skill: 35, speed: 1.2, salary: 90_00, state: 'ocupado', currentTaskId: 'TAR-0001', hiredDay: 1, completedTasks: 0 },
      { id: 'bianca-ajudante', name: 'Bianca', role: 'ajudante', skill: 50, speed: 1.0, salary: 110_00, state: 'ocupado', currentTaskId: 'TAR-0001', hiredDay: 1, completedTasks: 0 },
    ];
    expect(staffStateProblems(badStaff, STAFF_CANDIDATES).join(' | ')).toMatch(/concorrência inválida/);
  });

  it('advanceStaffWork permite que funcionário conclua uma tarefa e assuma a próxima no mesmo salto de tempo', () => {
    const s = newSession();
    s.hireEmployee('renata-mecanica', when); // speed 1.3
    s.enqueueStandardStaffTask('std-organizar-bancada'); // 12 / 1.3 = 9 min
    s.enqueueStandardStaffTask('std-inspecao-box'); // 15 / 1.3 = 12 min

    const res = advanceStaffWork(s.staff, 15, later(15).at);
    expect(res.completed).toHaveLength(1);
    expect(res.completed[0]!.id).toBe('TAR-0001');
    const secondTask = res.state.tasks.find((t) => t.id === 'TAR-0002')!;
    expect(secondTask.status).toBe('em-andamento');
    expect(secondTask.assignedTo).toBe('renata-mecanica');
    expect(secondTask.progressMinutes).toBe(6); // 15 - 9 = 6 min aplicados na segunda tarefa
  });
});
