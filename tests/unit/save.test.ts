import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/GameSession';
import { buildEnvelope, checksum, parseSave, SAVE_SCHEMA_VERSION, validateGameShell, type SaveGame } from '../../src/save/saveFile';
import { SaveService } from '../../src/save/SaveService';
import { MemorySaveStore } from '../../src/save/SaveStore';
import { validateSessionSnapshot } from '../../src/save/sessionSnapshot';
import { EQUIPMENT_IDS } from '../../src/data/equipment';
import { DIALOGUES, MISSIONS } from '../../src/data/missions';
import { initialMissionState, missionStateProblems } from '../../src/missions/MissionTracker';
import { buildMissionLibrary } from '../../src/missions/validate';
import { CTX, buyAndReceive, catalogs, content, later, newSession, when } from './fixtures';

const PADS = 'freios.pastilhas-dianteiras';
const lib = buildMissionLibrary(MISSIONS, DIALOGUES, Object.values(EQUIPMENT_IDS));
const validateSession = (g: Record<string, unknown>) => [
  ...validateSessionSnapshot(g.session, catalogs, (id) => GameSession.resolveCase(content, id)),
  ...missionStateProblems(g.missions, lib),
];
const summary = { day: 1, time: '09:00', cashText: 'R$ 1.500,00', orderLabel: 'OS #001', reputation: 50 };
const shell = (session: GameSession): SaveGame => ({
  clockMinutes: 600,
  player: { x: 1, z: 2, yaw: 0.5, pitch: -0.1 },
  equipment: { liftUp: true, hoodOpen: false, drawerOpen: false, hallLightsOn: true, benchLampOn: false },
  session: session.toSnapshot(),
  missions: initialMissionState(),
});
const fixedNow = () => new Date('2026-10-20T12:00:00Z');

/** Sessão com bastante coisa acontecendo: OS entregue com retrabalho (gera retorno em garantia), compras, peça na mão. */
function busySession(): GameSession {
  const s = newSession();
  const c = s.activeCase!;
  s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
  s.concludeActiveCase('freios.discos-dianteiros', when); // diagnóstico errado → retrabalho
  s.updateDraft(c.id, { urgent: true });
  s.sendQuote(when);
  const lot = buyAndReceive(s, 'disco-freio-diant-brasaco-brisa');
  s.removeOldPart('freios.discos-dianteiros', CTX.lifted, when);
  s.takePart(lot.lotId);
  s.installHeldPart('freios.discos-dianteiros', CTX.lifted, when);
  s.runFinalTest(CTX.floor, when);
  s.completeOrder(when);
  s.deliverVehicle(later(60));
  s.advanceCase(); // OS 001-G (retorno em garantia)
  s.buyPart('pastilha-freio-diant-ventura-brisa', 'rio-pecas', 1, later(70)); // a caminho
  s.takePart(s.stock.find((l) => l.partId === 'bateria-60ah-brasaco')!.lotId); // peça na mão
  return s;
}

describe('ida e volta (round-trip)', () => {
  it('foto → JSON → sessão nova → mesma foto, com OS de garantia criada durante o jogo', () => {
    const s = busySession();
    const snap = s.toSnapshot();
    expect(snap.caseIds).toContain('os-001-freio-garantia');
    const restored = GameSession.fromSnapshot(catalogs, content, JSON.parse(JSON.stringify(snap)));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const r = restored.session;
    expect(r.toSnapshot()).toEqual(snap);
    expect(r.cash).toBe(s.cash);
    expect(r.activeCase!.orderNumber).toBe('001-G');
    expect(r.heldPartId).toBe('bateria-60ah-brasaco');
    expect(r.reputation).toEqual(s.reputation);
  });

  it('o jogo continua depois de carregar: pedido chega, ids não se repetem', () => {
    const s = busySession();
    const r = (GameSession.fromSnapshot(catalogs, content, JSON.parse(JSON.stringify(s.toSnapshot()))) as { ok: true; session: GameSession }).session;
    expect(r.deliverDue(later(70).at + 180).map((p) => p.id)).toEqual(['PED-0002']);
    expect(r.buyPart('filtro-ar-brasaco-brisa', 'autopecas-bairro', 1, later(300)).message).toMatch(/PED-0003/);
    expect(r.transactions.at(-1)!.id).toBe(`T${String(s.transactions.length + 1).padStart(4, '0')}`);
    expect(r.getOrder('os-001-freio-garantia').warranty?.covered).toBe(true);
  });

  it('save completo pelo serviço: grava, lista e carrega igual', async () => {
    const service = new SaveService(new MemorySaveStore(), validateSession, fixedNow);
    const s = busySession();
    expect((await service.save('slot1', shell(s), summary)).ok).toBe(true);
    const info = await service.inspect('slot1');
    expect(info).toMatchObject({ state: 'ok', savedAt: '2026-10-20T12:00:00.000Z', summary });
    const loaded = await service.load('slot1');
    expect(loaded.ok && loaded.envelope.game.session).toEqual(s.toSnapshot());
    expect(loaded.ok && loaded.envelope.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });
});

describe('dados inválidos e recuperação', () => {
  const goodText = () => JSON.stringify(buildEnvelope('slot1', shell(newSession()), summary, fixedNow()));

  it('JSON quebrado, formato estranho e versão futura', () => {
    expect(parseSave('{ isso não é json', validateSession)).toMatchObject({ ok: false, reason: 'json' });
    expect(parseSave('{"oi": 1}', validateSession)).toMatchObject({ ok: false, reason: 'formato' });
    const future = { ...JSON.parse(goodText()), schemaVersion: 99 };
    expect(parseSave(JSON.stringify(future), validateSession)).toMatchObject({ ok: false, reason: 'versao' });
  });

  it('save editado à mão é detectado pela soma de verificação', () => {
    const env = JSON.parse(goodText());
    env.game.clockMinutes = 999_999;
    expect(parseSave(JSON.stringify(env), validateSession)).toMatchObject({ ok: false, reason: 'checksum' });
  });

  it('dados impossíveis com soma correta são recusados com o motivo', () => {
    const cases: Array<[string, (g: SaveGame) => void, RegExp]> = [
      ['lote negativo', (g) => (g.session.lots[0]!.qty = -1), /lote de estoque inválido/],
      ['OS desconhecida', (g) => (g.session.caseIds[0] = 'os-inventada'), /OS desconhecida/],
      ['desgaste fora da faixa', (g) => (g.session.vehicles[0]!.parts['eletrica.bateria']!.wear = 150), /desgaste/],
      ['peça inexistente na mão', (g) => (g.session.held = { partId: 'turbo-magico', unitCost: 0, lotSource: 'x' }), /peça em mãos/],
      ['capô aberto no alto', (g) => (g.equipment.hoodOpen = true), /estado impossível/],
      ['status de OS inventado', (g) => ((g.session.orders[0]!.order as { status: string }).status = 'voando'), /status desconhecido/],
    ];
    for (const [name, mutate, expected] of cases) {
      const env = JSON.parse(goodText());
      mutate(env.game);
      env.checksum = checksum(JSON.stringify(env.game));
      const r = parseSave(JSON.stringify(env), validateSession);
      expect(r.ok, name).toBe(false);
      expect(!r.ok && r.problems.join(' | '), name).toMatch(expected);
    }
  });

  it('nunca grava um estado inválido por cima de um save bom', async () => {
    const store = new MemorySaveStore();
    const service = new SaveService(store, validateSession, fixedNow);
    await service.save('auto', shell(newSession()), summary);
    const before = store.data.get('auto');
    const bad = shell(newSession());
    bad.session.lots[0]!.qty = 0;
    const r = await service.save('auto', bad, summary);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/save anterior foi mantido/);
    expect(store.data.get('auto')).toBe(before);
  });

  it('sobrescrever guarda a cópia de segurança; save corrompido é recuperado dela', async () => {
    const store = new MemorySaveStore();
    const service = new SaveService(store, validateSession, fixedNow);
    const first = newSession();
    await service.save('slot2', shell(first), { ...summary, orderLabel: 'primeiro' });
    await service.save('slot2', shell(busySession()), { ...summary, orderLabel: 'segundo' });
    expect(JSON.parse(store.data.get('slot2.bak')!).summary.orderLabel).toBe('primeiro');

    store.data.set('slot2', store.data.get('slot2')!.slice(0, 200)); // arquivo cortado no meio
    expect(await service.inspect('slot2')).toMatchObject({ state: 'recuperavel', summary: { orderLabel: 'primeiro' } });
    const loaded = await service.load('slot2');
    expect(loaded).toMatchObject({ ok: true, recovered: true });
    expect(loaded.ok && loaded.envelope.game.session).toEqual(first.toSnapshot());

    store.data.set('slot2.bak', 'lixo');
    expect((await service.inspect('slot2')).state).toBe('corrompido');
    expect((await service.load('slot2')).ok).toBe(false);
  });

  it('save corrompido não vira cópia de segurança; excluir limpa tudo', async () => {
    const store = new MemorySaveStore();
    const service = new SaveService(store, validateSession, fixedNow);
    store.data.set('slot3', 'corrompido');
    await service.save('slot3', shell(newSession()), summary);
    expect(store.data.has('slot3.bak')).toBe(false);
    expect((await service.remove('slot3')).ok).toBe(true);
    expect((await service.inspect('slot3')).state).toBe('vazio');
  });

  it('"Continuar" aponta o save válido mais recente', async () => {
    let t = 0;
    const service = new SaveService(new MemorySaveStore(), validateSession, () => new Date(Date.UTC(2026, 9, 20, 10, t++)));
    await service.save('slot1', shell(newSession()), summary);
    await service.save('auto', shell(newSession()), summary);
    expect((await service.latest())?.slot).toBe('auto');
  });
});

describe('migração entre versões', () => {
  it('aplica as migrações em sequência e avisa de onde veio', () => {
    const env = JSON.parse(JSON.stringify(buildEnvelope('slot1', shell(newSession()), summary, fixedNow())));
    // Simula um save da "versão 0", que não tinha resumo.
    delete env.summary;
    env.schemaVersion = 0;
    const migrations = { 0: (e: Record<string, unknown>) => ({ ...e, summary: { ...summary, orderLabel: 'migrado' } }) };
    const r = parseSave(JSON.stringify(env), validateSession, migrations, 1);
    expect(r).toMatchObject({ ok: true, migratedFrom: 0 });
    expect(r.ok && r.envelope.summary.orderLabel).toBe('migrado');
    expect(parseSave(JSON.stringify(env), validateSession, {}, 1)).toMatchObject({ ok: false, reason: 'versao' });
  });

  it('save da versão 1 (antes do Prompt 10) ganha dívida e missões ao carregar', () => {
    const game = shell(newSession());
    game.clockMinutes = 4 * 24 * 60 + 600; // dia 5
    const v1 = JSON.parse(JSON.stringify(game)) as Record<string, any>;
    delete v1.missions;
    delete v1.session.debt;
    const env = { schemaVersion: 1, savedAt: fixedNow().toISOString(), slot: 'slot1', summary, checksum: checksum(JSON.stringify(v1)), game: v1 };
    const r = parseSave(JSON.stringify(env), validateSession);
    expect(r).toMatchObject({ ok: true, migratedFrom: 1 });
    if (!r.ok) return;
    expect(r.envelope.schemaVersion).toBe(2);
    // A primeira parcela não nasce atrasada: vence 2 dias depois do dia do save.
    expect(r.envelope.game.session.debt).toMatchObject({ paidCount: 0, nextDueDay: 7 });
    expect(r.envelope.game.missions.flags).toEqual(['andou', 'abriu-painel-carro']);
  });

  it('estado de missões inválido é recusado com mensagem útil', () => {
    const game = shell(newSession());
    game.missions = { ...initialMissionState(), active: { id: 'missao-que-nao-existe', step: 0 } };
    const env = buildEnvelope('slot1', game, summary, fixedNow());
    const r = parseSave(JSON.stringify(env), validateSession);
    expect(r).toMatchObject({ ok: false, reason: 'dados' });
    expect(!r.ok && r.problems.join()).toContain('missão ativa desconhecida');
  });

  it('relógio, jogador e equipamentos também são validados', () => {
    expect(validateGameShell({ clockMinutes: -5, player: {}, equipment: {} }).length).toBeGreaterThanOrEqual(3);
  });
});
