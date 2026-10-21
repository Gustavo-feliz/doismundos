import type { Cents } from '../economy/money';
import { createSeededRandom } from '../utils/random';
import type { Catalogs } from '../vehicles/catalogs';
import { DataValidationError } from '../vehicles/types';
import { boxFromCenter, pointInBox, type Box2D, type Point2D } from '../world/collision';
import type {
  CityLocationDef,
  CityLocationId,
  CityNeighborhoodDef,
  CityPedestrianState,
  CityTrafficCarState,
  CityWorldState,
  SalvageOffer,
} from './types';

const REQUIRED_LOCATIONS: readonly CityLocationId[] = ['oficina', 'loja-pecas', 'ferro-velho', 'banco', 'lanchonete'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Valida os dados do bairro (GDD §21.3, Prompt 14). Lista vazia = tudo certo. */
export function findCityProblems(def: CityNeighborhoodDef): string[] {
  const problems: string[] = [];
  if (!def.id || !def.name) problems.push('bairro: id ou nome vazio');
  if (def.halfX < 12 || def.halfZ < 10) problems.push('bairro: dimensões externas muito pequenas');
  if (def.interactRadius <= 0.5 || def.interactRadius > 6) problems.push('bairro: interactRadius fora da faixa (0.5–6 m)');
  if (def.scrapRecoveryFactor <= 0 || def.scrapRecoveryFactor >= 1) problems.push('bairro: scrapRecoveryFactor deve ficar entre 0 e 1');
  if (def.salvagePriceFactor <= 0 || def.salvagePriceFactor >= 1) problems.push('bairro: salvagePriceFactor deve ficar entre 0 e 1');

  const ids = new Set<string>();
  for (const loc of def.locations) {
    if (ids.has(loc.id)) problems.push(`local "${loc.id}": id repetido`);
    ids.add(loc.id);
    if (!loc.name.trim() || !loc.actionLabel.trim()) problems.push(`local "${loc.id}": nome ou actionLabel vazio`);
    if (!HEX_COLOR.test(loc.accentColor) || !HEX_COLOR.test(loc.wallColor)) {
      problems.push(`local "${loc.id}": cor inválida (use #RRGGBB)`);
    }
    const b = loc.building;
    if (b.width <= 1 || b.depth <= 1 || b.height <= 1) problems.push(`local "${loc.id}": prédio com dimensões inválidas`);
    const box = boxFromCenter(b.x, b.z, b.width, b.depth);
    if (pointInBox(loc.entrance, box)) {
      problems.push(`local "${loc.id}": ponto de entrada fica dentro do colisor do prédio`);
    }
    if (Math.abs(loc.entrance.x) >= def.halfX || Math.abs(loc.entrance.z) >= def.halfZ) {
      problems.push(`local "${loc.id}": ponto de entrada fora dos limites do bairro`);
    }
  }

  for (const req of REQUIRED_LOCATIONS) {
    if (!ids.has(req)) problems.push(`bairro: local obrigatório ausente "${req}"`);
  }

  if (def.trafficLanes.length === 0 || def.trafficLanes.length > 4) {
    problems.push('bairro: trânsito deve ser mínimo e controlado (1 a 4 faixas)');
  }
  for (const lane of def.trafficLanes) {
    if (lane.speedMs <= 0 || lane.speedMs > 15) problems.push(`trânsito "${lane.id}": velocidade inválida`);
    if (!HEX_COLOR.test(lane.color)) problems.push(`trânsito "${lane.id}": cor inválida`);
  }

  if (def.pedestrians.length === 0 || def.pedestrians.length > 6) {
    problems.push('bairro: pedestres devem ser mínimos e controlados (1 a 6 NPCs)');
  }
  for (const ped of def.pedestrians) {
    if (ped.minX >= ped.maxX) problems.push(`pedestre "${ped.id}": minX deve ser menor que maxX`);
    if (ped.speedMs <= 0 || ped.speedMs > 4) problems.push(`pedestre "${ped.id}": velocidade inválida`);
  }

  const snackIds = new Set<string>();
  if (def.snacks.length === 0) problems.push('lanchonete: cardápio vazio');
  for (const s of def.snacks) {
    if (snackIds.has(s.id)) problems.push(`lanche "${s.id}": id repetido`);
    snackIds.add(s.id);
    if (!Number.isSafeInteger(s.price) || s.price <= 0) problems.push(`lanche "${s.id}": preço em centavos inválido`);
    if (!Number.isSafeInteger(s.minutes) || s.minutes <= 0) problems.push(`lanche "${s.id}": minutos inválidos`);
  }

  return problems;
}

export function validateCityData(def: CityNeighborhoodDef): void {
  const problems = findCityProblems(def);
  if (problems.length > 0) throw new DataValidationError('bairro e locais (city)', problems);
}

/** Colisores 2D do bairro: muros de limite da rua + prédios dos 5 estabelecimentos. */
export function cityColliders(def: CityNeighborhoodDef): Box2D[] {
  const { halfX, halfZ } = def;
  const wall = 0.8;
  return [
    boxFromCenter(0, -halfZ - wall / 2, halfX * 2 + wall * 2, wall),
    boxFromCenter(0, halfZ + wall / 2, halfX * 2 + wall * 2, wall),
    boxFromCenter(-halfX - wall / 2, 0, wall, halfZ * 2),
    boxFromCenter(halfX + wall / 2, 0, wall, halfZ * 2),
    ...def.locations.map((loc) => boxFromCenter(loc.building.x, loc.building.z, loc.building.width, loc.building.depth)),
  ];
}

/** Estado inicial determinístico do trânsito e dos pedestres do bairro. */
export function initialCityWorldState(def: CityNeighborhoodDef): CityWorldState {
  return {
    time: 0,
    traffic: def.trafficLanes.map((l) => ({
      id: l.id,
      x: l.startX,
      z: l.z,
      direction: l.direction,
      speedMs: l.speedMs,
      stoppedForPlayer: false,
    })),
    pedestrians: def.pedestrians.map((p) => ({
      id: p.id,
      x: p.startX,
      z: p.z,
      direction: p.direction,
      pausedForPlayer: false,
    })),
  };
}

/**
 * Avança o trânsito e os pedestres do bairro de forma 100% determinística.
 * Carros param antes da faixa de pedestres quando o jogador está atravessando
 * ou na frente do veículo; pedestres pausam se o jogador estiver muito perto.
 */
export function stepCityWorld(
  state: CityWorldState,
  dt: number,
  playerPos: Point2D,
  def: CityNeighborhoodDef,
): CityWorldState {
  if (!(dt > 0) || !Number.isFinite(dt)) return state;
  const stepDt = Math.min(dt, 0.25);
  const playerInCrosswalk = pointInBox(playerPos, def.crosswalk);
  const limitX = def.halfX - 1.5;

  const traffic: CityTrafficCarState[] = state.traffic.map((car, idx) => {
    const lane = def.trafficLanes[idx]!;
    const distAhead = (playerPos.x - car.x) * car.direction;
    const sameLaneZ = Math.abs(playerPos.z - car.z) < 1.9;
    const approachingCrosswalk =
      playerInCrosswalk &&
      ((car.direction === 1 && car.x < def.crosswalk.minX && def.crosswalk.minX - car.x < 6.0) ||
        (car.direction === -1 && car.x > def.crosswalk.maxX && car.x - def.crosswalk.maxX < 6.0));
    const playerDirectlyAhead = sameLaneZ && distAhead > -1.2 && distAhead < 5.2;

    if (approachingCrosswalk || playerDirectlyAhead) {
      return { ...car, speedMs: 0, stoppedForPlayer: true };
    }

    let nextX = car.x + car.direction * lane.speedMs * stepDt;
    if (car.direction === 1 && nextX > limitX) nextX = -limitX;
    if (car.direction === -1 && nextX < -limitX) nextX = limitX;
    return {
      ...car,
      x: nextX,
      speedMs: lane.speedMs,
      stoppedForPlayer: false,
    };
  });

  const pedestrians: CityPedestrianState[] = state.pedestrians.map((ped, idx) => {
    const defPed = def.pedestrians[idx]!;
    const distToPlayer = Math.hypot(playerPos.x - ped.x, playerPos.z - ped.z);
    if (distToPlayer < 1.25) {
      return { ...ped, pausedForPlayer: true };
    }
    let dir = ped.direction;
    let nextX = ped.x + dir * defPed.speedMs * stepDt;
    if (nextX >= defPed.maxX) {
      nextX = defPed.maxX;
      dir = -1;
    } else if (nextX <= defPed.minX) {
      nextX = defPed.minX;
      dir = 1;
    }
    return {
      ...ped,
      x: nextX,
      direction: dir,
      pausedForPlayer: false,
    };
  });

  return {
    time: state.time + stepDt,
    traffic,
    pedestrians,
  };
}

/** Retorna o estabelecimento cuja porta está ao alcance do jogador (ou null). */
export function nearestCityLocation(playerPos: Point2D, def: CityNeighborhoodDef): CityLocationDef | null {
  let best: CityLocationDef | null = null;
  let bestDist = def.interactRadius;
  for (const loc of def.locations) {
    const d = Math.hypot(playerPos.x - loc.entrance.x, playerPos.z - loc.entrance.z);
    if (d <= bestDist) {
      bestDist = d;
      best = loc;
    }
  }
  return best;
}

/** Calcula quanto o Ferro-Velho do Tião paga pelo lote de sucatas acumuladas na oficina. */
export function scrapLotValue(
  scrapPartIds: readonly string[],
  catalogs: Catalogs,
  factor: number,
): { totalCents: Cents; count: number } {
  let totalCents = 0;
  let count = 0;
  for (const id of scrapPartIds) {
    const part = catalogs.parts.get(id);
    if (!part) continue;
    totalCents += part.scrapValue > 0 ? part.scrapValue : Math.max(50, Math.round(part.baseCost * factor));
    count++;
  }
  return { totalCents, count };
}

/**
 * Gera as 3 ofertas diárias de peças garimpadas no Ferro-Velho do Tião.
 * Determinístico por `seed` e `day`: o mesmo dia na mesma campanha sempre
 * oferece as mesmas peças, priorizando 1 peça compatível com o carro ativo.
 */
export function dailySalvageOffers(
  day: number,
  seed: number,
  catalogs: Catalogs,
  factor: number,
  preferredModelId?: string | null,
): SalvageOffer[] {
  const allParts = [...catalogs.parts.values()];
  if (allParts.length === 0) return [];
  const combinedSeed = ((seed >>> 0) ^ Math.imul(Math.max(1, day), 0x9e3779b1)) >>> 0;
  const rng = createSeededRandom(combinedSeed || 1);

  const chosen: SalvageOffer[] = [];
  const usedIds = new Set<string>();

  const toOffer = (p: (typeof allParts)[number]): SalvageOffer => ({
    partId: p.id,
    partName: p.name,
    slotId: p.slot,
    unitPrice: Math.max(100, Math.round(p.baseCost * factor)),
    originalCost: p.baseCost,
  });

  if (preferredModelId) {
    const compatible = allParts.filter((p) => p.compatibility.some((c) => c.modelId === preferredModelId));
    if (compatible.length > 0) {
      const pick = compatible[Math.floor(rng() * compatible.length)]!;
      usedIds.add(pick.id);
      chosen.push(toOffer(pick));
    }
  }

  let guard = 0;
  while (chosen.length < Math.min(3, allParts.length) && guard++ < 50) {
    const pick = allParts[Math.floor(rng() * allParts.length)]!;
    if (usedIds.has(pick.id)) continue;
    usedIds.add(pick.id);
    chosen.push(toOffer(pick));
  }

  return chosen;
}
