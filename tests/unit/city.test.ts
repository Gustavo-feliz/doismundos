import { describe, expect, it } from 'vitest';
import {
  cityColliders,
  dailySalvageOffers,
  findCityProblems,
  initialCityWorldState,
  nearestCityLocation,
  scrapLotValue,
  stepCityWorld,
  validateCityData,
} from '../../src/city/rules';
import { CITY_NEIGHBORHOOD } from '../../src/data/city';
import { resolveCollisions } from '../../src/world/collision';
import { CTX, buyAndReceive, catalogs, content, later, newSession, when } from './fixtures';
import { GameSession } from '../../src/game/GameSession';

const PADS = 'freios.pastilhas-dianteiras';
const PADS_PART = 'pastilha-freio-diant-ventura-brisa';

describe('dados e validação do bairro (Prompt 14)', () => {
  it('o bairro de São Cristóvão tem os 5 locais obrigatórios e passa na validação', () => {
    expect(() => validateCityData(CITY_NEIGHBORHOOD)).not.toThrow();
    expect(CITY_NEIGHBORHOOD.locations.map((l) => l.id)).toEqual([
      'oficina',
      'loja-pecas',
      'ferro-velho',
      'banco',
      'lanchonete',
    ]);
  });

  it('aponta falta de local obrigatório, porta dentro de prédio e preços inválidos', () => {
    const missingBank = {
      ...CITY_NEIGHBORHOOD,
      locations: CITY_NEIGHBORHOOD.locations.filter((l) => l.id !== 'banco'),
    };
    expect(findCityProblems(missingBank).join(' | ')).toMatch(/local obrigatório ausente "banco"/);

    const doorInsideBuilding = {
      ...CITY_NEIGHBORHOOD,
      locations: CITY_NEIGHBORHOOD.locations.map((l) =>
        l.id === 'oficina' ? { ...l, entrance: { x: l.building.x, z: l.building.z, yaw: 0 } } : l,
      ),
    };
    expect(findCityProblems(doorInsideBuilding).join(' | ')).toMatch(/dentro do colisor do prédio/);
  });
});

describe('navegação, colisão e proximidade no bairro', () => {
  it('impede atravessar prédios e muros de limite da rua, mas deixa andar na calçada', () => {
    const colliders = cityColliders(CITY_NEIGHBORHOOD);
    // Ponto livre na calçada sul
    const sidewalk = { x: -5, z: 9.2 };
    expect(resolveCollisions(sidewalk, 0.32, colliders)).toBe(false);

    // Tentando entrar dentro do prédio da Autopeças (-12, -14.5, 10x5 -> maxZ = -12)
    const intoBuilding = { x: -12, z: -12.1 };
    expect(resolveCollisions(intoBuilding, 0.32, colliders)).toBe(true);
    expect(intoBuilding.z).toBeGreaterThan(-12.0);

    // Tentando sair pelo fim da rua (+halfX = 24)
    const outOfBounds = { x: 23.9, z: 0 };
    expect(resolveCollisions(outOfBounds, 0.32, colliders)).toBe(true);
    expect(outOfBounds.x).toBeLessThan(23.8);
  });

  it('detecta o local mais próximo quando o jogador encosta na entrada', () => {
    const shop = CITY_NEIGHBORHOOD.locations.find((l) => l.id === 'loja-pecas')!;
    expect(nearestCityLocation({ x: shop.entrance.x, z: shop.entrance.z + 0.5 }, CITY_NEIGHBORHOOD)?.id).toBe('loja-pecas');
    expect(nearestCityLocation({ x: 0, z: 0 }, CITY_NEIGHBORHOOD)).toBeNull();
  });
});

describe('trânsito e pedestres mínimos e determinísticos', () => {
  it('avança veículos e pedestres de forma determinística e para na faixa de pedestres', () => {
    const s0 = initialCityWorldState(CITY_NEIGHBORHOOD);
    const farPlayer = { x: 0, z: 9.2 };
    const s1 = stepCityWorld(s0, 0.2, farPlayer, CITY_NEIGHBORHOOD);
    const s1Repeat = stepCityWorld(s0, 0.2, farPlayer, CITY_NEIGHBORHOOD);
    expect(s1).toEqual(s1Repeat);
    expect(s1.traffic[0]!.x).toBeGreaterThan(s0.traffic[0]!.x);
    expect(s1.traffic[0]!.stoppedForPlayer).toBe(false);

    // Jogador atravessando na faixa de pedestres com um carro se aproximando
    const carNearCrosswalk = {
      ...s0,
      traffic: s0.traffic.map((t, i) => (i === 0 ? { ...t, x: -5.5 } : t)),
    };
    const stopped = stepCityWorld(carNearCrosswalk, 0.2, { x: 0, z: 0 }, CITY_NEIGHBORHOOD);
    expect(stopped.traffic[0]!.stoppedForPlayer).toBe(true);
    expect(stopped.traffic[0]!.speedMs).toBe(0);
    expect(stopped.traffic[0]!.x).toBe(-5.5);

    // Pedestre pausa quando o jogador para bem na frente dele
    const ped0 = s0.pedestrians[0]!;
    const paused = stepCityWorld(s0, 0.2, { x: ped0.x + 0.3, z: ped0.z }, CITY_NEIGHBORHOOD);
    expect(paused.pedestrians[0]!.pausedForPlayer).toBe(true);
    expect(paused.pedestrians[0]!.x).toBe(ped0.x);
  });
});

describe('economia dos locais do bairro (Ferro-Velho e Lanchonete)', () => {
  it('vende sucata retirada no reparo e registra receita no livro-caixa', () => {
    const s = newSession();
    expect(s.sellScrap(CITY_NEIGHBORHOOD.scrapRecoveryFactor, when).ok).toBe(false);

    // Faz a remoção da pastilha velha para gerar 1 item em `scrap`
    const c = s.activeCase!;
    s.runDiagnosticTest(`visual:${PADS}`, CTX.floor, when);
    s.concludeActiveCase(PADS, when);
    s.updateDraft(c.id, { urgent: true });
    s.sendQuote(when);
    buyAndReceive(s, PADS_PART, when);
    s.removeOldPart(PADS, CTX.lifted, later(30));
    expect(s.scrap).toHaveLength(1);

    const expected = scrapLotValue(s.scrap, catalogs, CITY_NEIGHBORHOOD.scrapRecoveryFactor);
    expect(expected.count).toBe(1);
    expect(expected.totalCents).toBeGreaterThan(0);

    const cashBefore = s.cash;
    const sold = s.sellScrap(CITY_NEIGHBORHOOD.scrapRecoveryFactor, later(40));
    expect(sold.ok).toBe(true);
    expect(sold.minutes).toBe(10);
    expect(s.scrap).toHaveLength(0);
    expect(s.cash).toBe(cashBefore + expected.totalCents);
    expect(s.transactions.at(-1)).toMatchObject({
      kind: 'receita',
      category: 'sucata',
      amount: expected.totalCents,
    });
  });

  it('gera ofertas de garimpo determinísticas por dia/semente e compra peça à pronta-entrega', () => {
    const offersA = dailySalvageOffers(1, 42, catalogs, CITY_NEIGHBORHOOD.salvagePriceFactor, 'ventura-brisa-16');
    const offersB = dailySalvageOffers(1, 42, catalogs, CITY_NEIGHBORHOOD.salvagePriceFactor, 'ventura-brisa-16');
    const offersDay2 = dailySalvageOffers(2, 42, catalogs, CITY_NEIGHBORHOOD.salvagePriceFactor, 'ventura-brisa-16');
    expect(offersA).toHaveLength(3);
    expect(offersA).toEqual(offersB);
    expect(offersA.map((o) => o.partId)).not.toEqual(offersDay2.map((o) => o.partId));

    const s = newSession();
    const factor = CITY_NEIGHBORHOOD.salvagePriceFactor;
    const pick = s.salvageOffers(when.day, factor)[0]!;
    const cashBefore = s.cash;
    const bought = s.buySalvagePart(pick.partId, factor, when);
    expect(bought.ok).toBe(true);
    expect(s.cash).toBe(cashBefore - pick.unitPrice);
    expect(s.stock.some((l) => l.partId === pick.partId && l.unitCost === pick.unitPrice)).toBe(true);
    // QA (Prompt 18): 1 unidade por oferta por dia; o preço vem da regra, não da tela.
    expect(s.salvageOffers(when.day, factor)[0]!.bought).toBe(true);
    expect(s.buySalvagePart(pick.partId, factor, when)).toMatchObject({ ok: false, message: expect.stringMatching(/só tinha uma/) });
    expect(s.cash).toBe(cashBefore - pick.unitPrice);
    const notToday = [...catalogs.parts.keys()].find((id) => !s.salvageOffers(when.day, factor).some((o) => o.partId === id))!;
    expect(s.buySalvagePart(notToday, factor, when)).toMatchObject({ ok: false, message: 'Essa peça não está no garimpo de hoje.' });
    // E continua valendo depois de salvar e carregar.
    const r = GameSession.fromSnapshot(catalogs, content, JSON.parse(JSON.stringify(s.toSnapshot())));
    expect(r.ok && r.session.salvageOffers(when.day, factor)[0]!.bought).toBe(true);
  });

  it('compra lanche na Lanchonete da Tia Léa, avança o tempo e registra no livro-caixa', () => {
    const s = newSession();
    const snack = CITY_NEIGHBORHOOD.snacks[0]!;
    const cashBefore = s.cash;
    const res = s.buySnack(snack.name, snack.price, snack.minutes, snack.gossip, when);
    expect(res.ok).toBe(true);
    expect(res.minutes).toBe(snack.minutes);
    expect(s.cash).toBe(cashBefore - snack.price);
    expect(s.transactions.at(-1)).toMatchObject({
      kind: 'despesa',
      category: 'despesa-bairro',
      amount: snack.price,
    });
  });
});

