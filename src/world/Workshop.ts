import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { SpawnPoint } from '../player/FirstPersonController';
import { buildPlaceholderCar, type CarAppearance } from '../vehicles/PlaceholderCar';
import type { VehicleDefinition } from '../vehicles/types';
import {
  concreteFloorTexture,
  pegboardTexture,
  rollingDoorTexture,
  signTexture,
  wallTexture,
} from '../utils/canvasTextures';
import { createSeededRandom, range } from '../utils/random';
import { EQUIPMENT_IDS } from '../data/equipment';
import { tagInteractable } from '../interaction/resolveTarget';
import { boxFromCenter, type Box2D } from './collision';

export type WorkshopUpgradeId = 'iluminacao' | 'armario-ferramentas' | 'organizacao-estoque';
export type WorkshopUpgradeLevel = 0 | 1 | 2 | 3;
type UpgradeBusEvents = GameEvents & {
  'upgrade:changed': { upgradeId: WorkshopUpgradeId; level: WorkshopUpgradeLevel };
};

/**
 * OFICINA TEMPORÁRIA (GDD §2.2: "uma oficina compacta e um carro").
 * Tudo aqui é feito de formas simples e marcado com o prefixo PLACEHOLDER_
 * e userData.placeholder = true até chegarem os modelos definitivos.
 *
 * Coordenadas: interior de x -7..7, z -9..9, pé-direito 5 m.
 * Portão para a rua em z = +9; fundos em z = -9.
 */
export const WORKSHOP_SIZE = { halfX: 7, halfZ: 9, height: 5 } as const;
const DOOR = { halfWidth: 2.5, height: 4.0, curtainBottom: 3.15 } as const;
const WALL_T = 0.3;

export interface HallLights {
  /** Intensidade de cada luz com o interruptor ligado e desligado. */
  entries: Array<{ light: THREE.Light; on: number; off: number }>;
  tube: THREE.MeshStandardMaterial;
  tubeOnIntensity: number;
  /** Fração da luz ambiente (reflexos do ambiente) que sobra com as luzes apagadas. */
  ambientOffFactor: number;
}

export interface BenchLamp {
  light: THREE.PointLight;
  tube: THREE.MeshStandardMaterial;
  onIntensity: number;
  tubeOnIntensity: number;
}

/** Partes móveis ou controláveis que os equipamentos manipulam. */
export interface WorkshopParts {
  /** Carro de deslizamento + braços do elevador (sobem junto com o carro). */
  liftCarriage: THREE.Group;
  car: THREE.Group;
  hoodPivot: THREE.Group;
  hoodClosedAngle: number;
  /** Colisor do carro (desligado quando ele está no alto). */
  carCollider: Box2D;
  /** Área sob o carro, para saber se o jogador está embaixo. */
  carFootprint: Box2D;
  drawer: THREE.Group;
  /** Colisor da gaveta aberta (desligado quando fechada). */
  drawerCollider: Box2D;
  benchLamp: BenchLamp;
  hallLights: HallLights;
  /** Troca cor e placa do carro do box 1. */
  setCarLook(look: CarAppearance): void;
  /** Destaca um equipamento no tutorial (id de EQUIPMENT_IDS) ou apaga com null. */
  setHighlight(targetId: string | null, reduceMotion?: boolean): void;
  /** Atualiza a preferência de reduzir movimento para o destaque do tutorial. */
  setReduceMotion(reduceMotion: boolean): void;
  /** Atualiza o visual de um upgrade da oficina (nível 0 a 3). */
  setUpgradeLevel(upgradeId: WorkshopUpgradeId, level: WorkshopUpgradeLevel): void;
}

export interface Workshop {
  root: THREE.Group;
  colliders: Box2D[];
  spawn: SpawnPoint;
  parts: WorkshopParts;
  /** O que a mira enxerga: o interior (a rua e as luminárias do teto ficam de fora). */
  raycastTargets: THREE.Object3D[];
  /** Liga/desliga sombras e define a resolução do mapa de sombra. */
  setShadowQuality(enabled: boolean, mapSize: number): void;
  /** Destaca um equipamento no tutorial (id de EQUIPMENT_IDS) ou apaga com null. */
  setHighlight(targetId: string | null, reduceMotion?: boolean): void;
  /** Atualiza a preferência de reduzir movimento para o destaque do tutorial. */
  setReduceMotion(reduceMotion: boolean): void;
  /** Atualiza o visual de um upgrade da oficina (nível 0 a 3). */
  setUpgradeLevel(upgradeId: WorkshopUpgradeId, level: WorkshopUpgradeLevel): void;
  /** Conecta o barramento de eventos (`tutorial:highlight`, `settings:changed`, `upgrade:changed`) à oficina. */
  bindEvents(bus: EventBus<GameEvents>): () => void;
}

interface Mats {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  darkSteel: THREE.MeshStandardMaterial;
  liftPaint: THREE.MeshStandardMaterial;
  yellowPaint: THREE.MeshStandardMaterial;
  blackPaint: THREE.MeshStandardMaterial;
  redCabinet: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  cardboard: THREE.MeshStandardMaterial;
  drumBlue: THREE.MeshStandardMaterial;
  beige: THREE.MeshStandardMaterial;
  fixture: THREE.MeshStandardMaterial;
  tube: THREE.MeshStandardMaterial;
  windowGlow: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
  pegboard: THREE.MeshStandardMaterial;
  sign: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  sidewalk: THREE.MeshStandardMaterial;
}

function createMaterials(): Mats {
  const S = WORKSHOP_SIZE;
  return {
    floor: new THREE.MeshStandardMaterial({ map: concreteFloorTexture(S.halfX * 2, S.halfZ * 2), roughness: 0.82, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ map: wallTexture(S.height, 1.3), roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x4b4f52, roughness: 0.7, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.45, metalness: 0.75 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.55, metalness: 0.6 }),
    liftPaint: new THREE.MeshStandardMaterial({ color: 0x24518a, roughness: 0.45, metalness: 0.3 }),
    yellowPaint: new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: 0.6 }),
    blackPaint: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 }),
    redCabinet: new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.35, metalness: 0.45 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.18, metalness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a6239, roughness: 0.75 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.93 }),
    cardboard: new THREE.MeshStandardMaterial({ color: 0xa47c4e, roughness: 0.95 }),
    drumBlue: new THREE.MeshStandardMaterial({ color: 0x1f4e8c, roughness: 0.5, metalness: 0.4 }),
    beige: new THREE.MeshStandardMaterial({ color: 0xcfc6ad, roughness: 0.7 }),
    fixture: new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.5, metalness: 0.3 }),
    tube: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 2.2 }),
    windowGlow: new THREE.MeshStandardMaterial({ color: 0xdfe9f2, emissive: 0xcfe0f0, emissiveIntensity: 1.3, roughness: 0.3 }),
    door: new THREE.MeshStandardMaterial({ map: rollingDoorTexture(), roughness: 0.5, metalness: 0.6 }),
    pegboard: new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.85 }),
    sign: new THREE.MeshStandardMaterial({ map: signTexture('AUTO MECÂNICA', 'SERVIÇOS GERAIS  ·  DESDE 1987'), roughness: 0.7 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x3b3b3d, roughness: 0.95 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0xa9a49a, roughness: 0.9 }),
  };
}

/** Caixa com a base apoiada em `y`. */
function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  shadows: { cast?: boolean; receive?: boolean } = { cast: true, receive: true },
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = shadows.cast ?? false;
  mesh.receiveShadow = shadows.receive ?? false;
  parent.add(mesh);
  return mesh;
}

function placeholderGroup(name: string, label: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `PLACEHOLDER_${name}`;
  group.userData = { placeholder: true, label };
  return group;
}

export function buildWorkshop(vehicle: VehicleDefinition, look: CarAppearance): Workshop {
  const S = WORKSHOP_SIZE;
  const root = new THREE.Group();
  root.name = 'oficina';
  const m = createMaterials();
  const colliders: Box2D[] = [];
  const rng = createSeededRandom(2024);

  buildShell(root, m, colliders);
  buildOutside(root, m);
  buildBayMarkings(root, m);

  // --- Box 1: elevador + carro ---
  const bay1 = { x: -1.6, z: -1.2 };
  const lift = buildLift(m, bay1.x, bay1.z, colliders);
  tagInteractable(lift.group, EQUIPMENT_IDS.lift);
  root.add(lift.group);

  const car = buildPlaceholderCar(vehicle, look);
  car.group.rotation.y = -Math.PI / 2; // frente (+X local) apontando para o portão (+Z)
  car.group.position.set(bay1.x, 0, bay1.z);
  tagInteractable(car.group, EQUIPMENT_IDS.car);
  tagInteractable(car.hoodPivot, EQUIPMENT_IDS.hood);
  // Olhar para o motor com o capô aberto também mira o capô (para fechá-lo).
  tagInteractable(car.engineBay, EQUIPMENT_IDS.hood);
  root.add(car.group);
  const dims = vehicle.dimensions;
  const carCollider = boxFromCenter(bay1.x, bay1.z, dims.width + 0.1, dims.length + 0.1);
  colliders.push(carCollider);
  const carFootprint = boxFromCenter(bay1.x, bay1.z, dims.width, dims.length);

  // --- Box 2 (vazio, para expansão futura): macaco jacaré ---
  root.add(buildJack(m, 3.6, 0.6, colliders));

  // --- Fundos: bancada, painel, armário, letreiro ---
  const bench = buildWorkbench(m, -4.1, -S.halfZ + 0.45, colliders);
  tagInteractable(bench.group, EQUIPMENT_IDS.benchLamp);
  root.add(bench.group);
  const cabinet = buildToolCabinet(m, 0.6, -S.halfZ + 0.33, colliders);
  tagInteractable(cabinet.group, EQUIPMENT_IDS.drawer);
  root.add(cabinet.group);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), m.sign);
  sign.name = 'PLACEHOLDER_letreiro';
  sign.userData = { placeholder: true };
  sign.position.set(3.6, 3.55, -S.halfZ + 0.01); // sobre o box 2, longe da travessa do elevador
  root.add(sign);

  // --- Lateral direita: estantes, pneus ---
  // As estantes são o estoque de peças (as peças das OS aprovadas chegam aqui).
  const shelves: THREE.Group[] = [];
  for (const z of [-4.6, -2.2]) {
    const shelf = buildShelf(m, S.halfX - 0.35, z, rng, colliders);
    tagInteractable(shelf, EQUIPMENT_IDS.stock);
    root.add(shelf);
    shelves.push(shelf);
  }
  root.add(buildTireStack(m, 5.7, -7.9, 4, colliders));
  root.add(buildTireStack(m, 6.35, -7.0, 3, colliders));

  // --- Lateral esquerda: tambores de óleo ---
  root.add(buildDrum(m, -S.halfX + 0.45, -2.6, colliders));
  root.add(buildDrum(m, -S.halfX + 0.45, -3.3, colliders));
  root.add(buildDrum(m, -S.halfX + 1.1, -2.95, colliders));

  // --- Frente esquerda: escritório improvisado e interruptor ---
  root.add(buildOfficeCorner(m, -5.2, 6.8, colliders));
  root.add(buildLightSwitch(m, -(DOOR.halfWidth + 0.7), S.halfZ));

  // --- Iluminação ---
  const lighting = buildLighting(root, m, bay1);

  // Jogador entra pelo portão olhando para dentro, com o carro à esquerda.
  const spawn: SpawnPoint = { x: 0.8, z: 6.6, yaw: 0.18 };

  const raycastTargets = root.children.filter((child) => child.name !== 'PLACEHOLDER_rua' && child.name !== 'iluminacao');

  // --- Destaque visual do tutorial e visuais de upgrades (fora do raycast) ---
  const highlight = buildHighlightSystem(root, car.group);
  const upgrades = buildUpgradeVisuals(m, lift.group, cabinet.group, shelves, lighting.hall);

  return {
    root,
    colliders,
    spawn,
    raycastTargets,
    parts: {
      liftCarriage: lift.carriage,
      car: car.group,
      hoodPivot: car.hoodPivot,
      hoodClosedAngle: car.hoodClosedAngle,
      carCollider,
      carFootprint,
      drawer: cabinet.drawer,
      drawerCollider: cabinet.drawerCollider,
      benchLamp: bench.lamp,
      hallLights: lighting.hall,
      setCarLook: car.setLook,
      setHighlight: highlight.setHighlight,
      setReduceMotion: highlight.setReduceMotion,
      setUpgradeLevel: upgrades.setUpgradeLevel,
    },
    setShadowQuality(enabled: boolean, mapSize: number) {
      for (const light of lighting.shadowLights) {
        light.castShadow = enabled;
        if (light.shadow.mapSize.x !== mapSize) {
          light.shadow.mapSize.set(mapSize, mapSize);
          light.shadow.map?.dispose();
          light.shadow.map = null;
        }
      }
    },
    setHighlight: highlight.setHighlight,
    setReduceMotion: highlight.setReduceMotion,
    setUpgradeLevel: upgrades.setUpgradeLevel,
    bindEvents(bus: EventBus<GameEvents>): () => void {
      const offHighlight = bus.on('tutorial:highlight', ({ targetId }) => {
        highlight.setHighlight(targetId);
      });
      const offSettings = bus.on('settings:changed', ({ settings }) => {
        highlight.setReduceMotion(settings.reduceMotion);
      });
      const offUpgrade = (bus as EventBus<UpgradeBusEvents>).on('upgrade:changed', ({ upgradeId, level }) => {
        upgrades.setUpgradeLevel(upgradeId, level);
      });
      return () => {
        offHighlight();
        offSettings();
        offUpgrade();
      };
    },
  };
}

// ---------------------------------------------------------------------------

function buildShell(root: THREE.Group, m: Mats, colliders: Box2D[]): void {
  const S = WORKSHOP_SIZE;
  const shell = new THREE.Group();
  shell.name = 'estrutura';
  root.add(shell);

  // Piso
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S.halfX * 2, S.halfZ * 2), m.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  shell.add(floor);

  // Paredes: textura repetida a cada ~4 m na horizontal.
  const wallMat = (length: number) => {
    const mat = m.wall.clone();
    const tex = m.wall.map!.clone();
    tex.repeat.set(length / 4, 1);
    tex.needsUpdate = true;
    mat.map = tex;
    return mat;
  };
  const sideLen = S.halfZ * 2 + WALL_T * 2;
  const backLen = S.halfX * 2;
  box(shell, wallMat(sideLen), WALL_T, S.height, sideLen, -S.halfX - WALL_T / 2, 0, 0);
  box(shell, wallMat(sideLen), WALL_T, S.height, sideLen, S.halfX + WALL_T / 2, 0, 0);
  box(shell, wallMat(backLen), backLen, S.height, WALL_T, 0, 0, -S.halfZ - WALL_T / 2);

  // Frente com o vão do portão.
  const sideW = S.halfX - DOOR.halfWidth;
  const frontZ = S.halfZ + WALL_T / 2;
  box(shell, wallMat(sideW), sideW, S.height, WALL_T, -(DOOR.halfWidth + sideW / 2), 0, frontZ);
  box(shell, wallMat(sideW), sideW, S.height, WALL_T, DOOR.halfWidth + sideW / 2, 0, frontZ);
  box(shell, wallMat(DOOR.halfWidth * 2), DOOR.halfWidth * 2, S.height - DOOR.height, WALL_T, 0, DOOR.height, frontZ);

  // Teto e vigas.
  box(shell, m.ceiling, S.halfX * 2 + WALL_T * 2, 0.2, S.halfZ * 2 + WALL_T * 2, 0, S.height, 0);
  for (let z = -7.5; z <= 7.5; z += 3) {
    box(shell, m.darkSteel, S.halfX * 2, 0.32, 0.18, 0, S.height - 0.32, z, { cast: false, receive: true });
  }

  // Janelas altas na parede esquerda (luz do dia difusa).
  for (const z of [-6, -2, 2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), m.windowGlow);
    win.position.set(-S.halfX + 0.01, 3.9, z);
    win.rotation.y = Math.PI / 2;
    shell.add(win);
    box(shell, m.darkSteel, 0.06, 0.06, 2.3, -S.halfX + 0.03, 3.42, z, { cast: false, receive: false });
  }

  // Portão de enrolar (parcialmente erguido) e caixa do rolo.
  const curtainH = DOOR.height - DOOR.curtainBottom;
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.halfWidth * 2, curtainH), m.door);
  curtain.position.set(0, DOOR.curtainBottom + curtainH / 2, S.halfZ + 0.02);
  curtain.rotation.y = Math.PI;
  curtain.castShadow = true;
  shell.add(curtain);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, DOOR.halfWidth * 2 + 0.3, 20), m.darkSteel);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, DOOR.height + 0.3, S.halfZ - 0.2);
  roll.castShadow = true;
  shell.add(roll);
  for (const side of [-1, 1]) {
    box(shell, m.darkSteel, 0.12, DOOR.height, 0.12, side * (DOOR.halfWidth + 0.06), 0, S.halfZ - 0.02, { cast: true, receive: true });
  }

  // Corrente de segurança no portão: explica por que não dá para sair (a rua vem depois).
  const chain = placeholderGroup('corrente_portao', 'Corrente do portão — a rua chega numa etapa futura');
  for (const side of [-1, 1]) {
    box(chain, m.yellowPaint, 0.08, 1.0, 0.08, side * (DOOR.halfWidth - 0.15), 0, S.halfZ - 0.15);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, DOOR.halfWidth * 2 - 0.3, 8), m.blackPaint);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.9, S.halfZ - 0.15);
  chain.add(bar);
  for (let i = -5; i <= 5; i += 2) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.22, 8), m.yellowPaint);
    stripe.rotation.z = Math.PI / 2;
    stripe.position.set(i * 0.22, 0.9, S.halfZ - 0.15);
    chain.add(stripe);
  }
  tagInteractable(chain, EQUIPMENT_IDS.gate);
  root.add(chain);

  // Colisores das paredes (a frente é toda bloqueada pela corrente).
  colliders.push(
    { minX: -S.halfX - 1, maxX: -S.halfX, minZ: -S.halfZ - 1, maxZ: S.halfZ + 1 },
    { minX: S.halfX, maxX: S.halfX + 1, minZ: -S.halfZ - 1, maxZ: S.halfZ + 1 },
    { minX: -S.halfX - 1, maxX: S.halfX + 1, minZ: -S.halfZ - 1, maxZ: -S.halfZ },
    { minX: -S.halfX - 1, maxX: S.halfX + 1, minZ: S.halfZ - 0.2, maxZ: S.halfZ + 1 },
  );
}

/** Rua vista pelo portão: só cenário, sem colisão nem lógica. */
function buildOutside(root: THREE.Group, m: Mats): void {
  const S = WORKSHOP_SIZE;
  const outside = placeholderGroup('rua', 'Rua vista do portão (cenário temporário)');
  root.add(outside);

  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(60, 3.3), m.sidewalk);
  sidewalk.rotation.x = -Math.PI / 2;
  sidewalk.position.set(0, 0.002, S.halfZ + 1.65); // começa sob o portão: sem fresta
  sidewalk.receiveShadow = true;
  const street = new THREE.Mesh(new THREE.PlaneGeometry(60, 16), m.asphalt);
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, 0, S.halfZ + 3.3 + 8); // vai até debaixo das fachadas
  street.receiveShadow = true;
  outside.add(sidewalk, street);

  // Fachadas coloridas do outro lado da rua (inspiração: casario do Rio).
  const colors = [0xe9c46a, 0xf4a261, 0x90be6d, 0xa8dadc, 0xe76f51, 0xf1faee, 0x84a59d];
  const rng = createSeededRandom(31);
  let x = -26;
  let i = 0;
  while (x < 26) {
    const w = range(rng, 4.5, 8);
    const h = range(rng, 6, 11);
    const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length]!, roughness: 0.9 });
    box(outside, mat, w - 0.15, h, 6, x + w / 2, 0, S.halfZ + 21, { cast: false, receive: true });
    // Janelas escuras
    for (let wy = 2.2; wy < h - 1; wy += 3) {
      for (let wx = -w / 2 + 1.1; wx < w / 2 - 0.8; wx += 1.8) {
        box(outside, m.darkSteel, 0.9, 1.2, 0.05, x + w / 2 + wx, wy, S.halfZ + 17.97, { cast: false, receive: false });
      }
    }
    x += w;
    i++;
  }
}

function buildBayMarkings(root: THREE.Group, m: Mats): void {
  const marks = new THREE.Group();
  marks.name = 'faixas_dos_boxes';
  root.add(marks);
  const line = 0.1;
  for (const cx of [-1.6, 3.6]) {
    const cz = -1.2;
    const w = 4.0;
    const d = 6.6;
    // y ligeiramente acima do piso para não "brigar" com ele (z-fighting).
    box(marks, m.yellowPaint, line, 0.004, d, cx - w / 2, 0.001, cz, { receive: true });
    box(marks, m.yellowPaint, line, 0.004, d, cx + w / 2, 0.001, cz, { receive: true });
    box(marks, m.yellowPaint, w + line, 0.004, line, cx, 0.001, cz - d / 2, { receive: true });
  }
}

function buildLift(m: Mats, x: number, z: number, colliders: Box2D[]): { group: THREE.Group; carriage: THREE.Group } {
  const lift = placeholderGroup('elevador_2_colunas', 'Elevador automotivo de 2 colunas');
  // Parte móvel: sobe junto com o carro.
  const carriage = new THREE.Group();
  carriage.name = 'elevador_parte_movel';
  lift.add(carriage);
  const postOffset = 1.75;
  const postH = 3.9;
  for (const side of [-1, 1]) {
    const px = x + side * postOffset;
    box(lift, m.darkSteel, 0.7, 0.02, 0.7, px, 0, z);
    box(lift, m.liftPaint, 0.34, postH, 0.34, px, 0.02, z);
    // Carro de deslizamento e braços (abaixados, sob as soleiras).
    box(carriage, m.darkSteel, 0.24, 0.5, 0.24, px - side * 0.26, 0.06, z);
    for (const dir of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.12), m.steel);
      arm.position.set(px - side * 0.82, 0.13, z + dir * 0.45);
      arm.rotation.y = side * dir * 0.62;
      arm.castShadow = true;
      arm.receiveShadow = true;
      carriage.add(arm);
    }
    // Faixa de segurança na coluna.
    box(lift, m.yellowPaint, 0.35, 0.12, 0.35, px, 1.6, z, { cast: false, receive: true });
    colliders.push(boxFromCenter(px, z, 0.5, 0.5));
  }
  // Travessa superior.
  box(lift, m.liftPaint, postOffset * 2 + 0.34, 0.22, 0.26, x, postH, z);
  // Unidade hidráulica com a botoeira de comando.
  const motorX = x - postOffset - 0.35;
  box(lift, m.darkSteel, 0.3, 0.45, 0.3, motorX, 1.0, z, { cast: true, receive: true });
  box(lift, m.yellowPaint, 0.16, 0.24, 0.06, motorX, 1.12, z + 0.18, { cast: false, receive: true });
  for (const [dy, color] of [[0.07, 0x2fbf4a], [-0.03, 0xd63a2f]] as const) {
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
    button.rotation.x = Math.PI / 2;
    button.position.set(motorX, 1.24 + dy, z + 0.215);
    lift.add(button);
  }
  return { group: lift, carriage };
}

function buildJack(m: Mats, x: number, z: number, colliders: Box2D[]): THREE.Group {
  const jack = placeholderGroup('macaco_jacare', 'Macaco jacaré');
  box(jack, m.redCabinet, 0.36, 0.16, 0.9, x, 0.05, z);
  for (const dx of [-0.15, 0.15]) {
    for (const dz of [-0.38, 0.38]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), m.darkSteel);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x + dx, 0.05, z + dz);
      jack.add(wheel);
    }
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), m.steel);
  handle.position.set(x, 0.55, z + 0.85);
  handle.rotation.x = 0.7;
  handle.castShadow = true;
  jack.add(handle);
  colliders.push(boxFromCenter(x, z + 0.2, 0.45, 1.4));
  return jack;
}

function buildWorkbench(m: Mats, x: number, z: number, colliders: Box2D[]): { group: THREE.Group; lamp: BenchLamp } {
  const S = WORKSHOP_SIZE;
  const bench = placeholderGroup('bancada', 'Bancada de trabalho');
  const w = 2.6;
  const d = 0.8;
  const topY = 0.9;
  box(bench, m.wood, w, 0.06, d, x, topY, z);
  for (const dx of [-w / 2 + 0.06, w / 2 - 0.06]) {
    for (const dz of [-d / 2 + 0.06, d / 2 - 0.06]) {
      box(bench, m.darkSteel, 0.06, topY, 0.06, x + dx, 0, z + dz);
    }
  }
  box(bench, m.darkSteel, w - 0.1, 0.03, d - 0.1, x, 0.22, z);
  // Morsa
  box(bench, m.liftPaint, 0.22, 0.14, 0.3, x - w / 2 + 0.25, topY + 0.06, z + d / 2 - 0.2);
  box(bench, m.liftPaint, 0.24, 0.1, 0.06, x - w / 2 + 0.25, topY + 0.2, z + d / 2 - 0.08);
  // Objetos sobre a bancada
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 14), m.redCabinet);
  can.position.set(x + 0.6, topY + 0.06 + 0.11, z - 0.1);
  can.castShadow = true;
  bench.add(can);
  box(bench, m.redCabinet, 0.5, 0.2, 0.25, x + 0.05, topY + 0.06, z - 0.12);
  box(bench, m.cardboard, 0.3, 0.25, 0.3, x - 0.2, 0.25, z);
  // Painel de ferramentas na parede
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), m.pegboard);
  peg.position.set(x, 1.85, -S.halfZ + 0.015);
  peg.receiveShadow = true;
  bench.add(peg);

  // Luminária própria da bancada (começa apagada).
  const tube = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xfff4e0, emissiveIntensity: 0 });
  box(bench, m.fixture, 1.4, 0.06, 0.18, x, 2.65, z - 0.15, { cast: false, receive: false });
  box(bench, tube, 1.3, 0.025, 0.05, x, 2.625, z - 0.15, { cast: false, receive: false });
  for (const dx of [-0.6, 0.6]) box(bench, m.darkSteel, 0.01, 0.5, 0.01, x + dx, 2.71, z - 0.15, { cast: false, receive: false });
  const light = new THREE.PointLight(0xfff1d6, 0, 4.5, 2);
  light.position.set(x, 2.5, z - 0.05);
  bench.add(light);

  colliders.push(boxFromCenter(x, z, w + 0.05, d + 0.05));
  return { group: bench, lamp: { light, tube, onIntensity: 9, tubeOnIntensity: 2.4 } };
}

function buildToolCabinet(m: Mats, x: number, z: number, colliders: Box2D[]): { group: THREE.Group; drawer: THREE.Group; drawerCollider: Box2D } {
  const cab = placeholderGroup('armario_ferramentas', 'Armário de ferramentas');
  const w = 1.25;
  const d = 0.55;
  const chestD = d - 0.06;
  const baseFront = z + d / 2;
  const chestFront = z + chestD / 2;
  box(cab, m.redCabinet, w, 0.95, d, x, 0.1, z);
  box(cab, m.redCabinet, w, 0.45, chestD, x, 1.08, z);
  box(cab, m.darkSteel, w + 0.02, 0.03, d + 0.02, x, 1.05, z);
  // Gavetas fixas: frisos e puxadores na face frontal (+Z).
  for (const y of [0.2, 0.36, 0.52, 0.68, 0.86, 1.18]) {
    const front = y > 1.05 ? chestFront : baseFront;
    box(cab, m.darkSteel, w - 0.06, 0.012, 0.01, x, y - 0.05, front + 0.002, { cast: false, receive: false });
    box(cab, m.chrome, w * 0.6, 0.025, 0.03, x, y, front + 0.015, { cast: false, receive: false });
  }

  // Gaveta de cima: abre de verdade. A bandeja fica escondida dentro do baú.
  const drawer = new THREE.Group();
  drawer.name = 'gaveta_superior';
  const dy = 1.36;
  const trayW = w - 0.12;
  const trayD = chestD - 0.08;
  const trayZ = chestFront - trayD / 2;
  box(drawer, m.redCabinet, w - 0.06, 0.15, 0.025, x, dy - 0.075, chestFront + 0.0125, { cast: true, receive: true });
  box(drawer, m.chrome, w * 0.6, 0.025, 0.03, x, dy, chestFront + 0.04, { cast: false, receive: false });
  box(drawer, m.darkSteel, trayW, 0.012, trayD, x, dy - 0.07, trayZ, { cast: false, receive: true });
  for (const side of [-1, 1]) box(drawer, m.redCabinet, 0.012, 0.1, trayD, x + side * (trayW / 2), dy - 0.07, trayZ, { cast: false, receive: true });
  // Ferramentas na bandeja (TEMPORÁRIAS: só formas).
  for (let i = 0; i < 6; i++) {
    box(drawer, m.chrome, 0.035, 0.018, trayD * (0.55 + i * 0.06), x - 0.45 + i * 0.18, dy - 0.058, trayZ, { cast: false, receive: true });
  }
  cab.add(drawer);

  for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) {
    for (const dz of [-d / 2 + 0.08, d / 2 - 0.08]) {
      const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), m.rubber);
      caster.rotation.z = Math.PI / 2;
      caster.position.set(x + dx, 0.05, z + dz);
      cab.add(caster);
    }
  }
  colliders.push(boxFromCenter(x, z, w + 0.05, d + 0.05));
  const drawerCollider: Box2D = { minX: x - w / 2, maxX: x + w / 2, minZ: z, maxZ: chestFront + 0.4, disabled: true };
  colliders.push(drawerCollider);
  return { group: cab, drawer, drawerCollider };
}

function buildShelf(m: Mats, x: number, z: number, rng: () => number, colliders: Box2D[]): THREE.Group {
  const shelf = placeholderGroup('estante', 'Estante de peças');
  const w = 0.55;
  const len = 2.1;
  const h = 2.4;
  for (const dx of [-w / 2 + 0.03, w / 2 - 0.03]) {
    for (const dz of [-len / 2 + 0.03, len / 2 - 0.03]) {
      box(shelf, m.liftPaint, 0.05, h, 0.05, x + dx, 0, z + dz);
    }
  }
  for (const y of [0.15, 0.75, 1.35, 1.95]) {
    box(shelf, m.steel, w, 0.03, len, x, y, z);
    // Caixas de peças com tamanhos variados (semente fixa: sempre iguais).
    let cursor = -len / 2 + 0.08;
    while (cursor < len / 2 - 0.3) {
      const bw = range(rng, 0.22, 0.45);
      const bh = range(rng, 0.18, 0.42);
      if (rng() > 0.2) {
        const b = box(shelf, rng() > 0.75 ? m.drumBlue : m.cardboard, w * range(rng, 0.6, 0.9), bh, bw, x, y + 0.03, z + cursor + bw / 2);
        b.rotation.y = range(rng, -0.08, 0.08);
      }
      cursor += bw + 0.05;
    }
  }
  colliders.push(boxFromCenter(x, z, w + 0.05, len + 0.05));
  return shelf;
}

function buildTireStack(m: Mats, x: number, z: number, count: number, colliders: Box2D[]): THREE.Group {
  const stack = placeholderGroup('pilha_pneus', 'Pneus usados');
  const geo = new THREE.TorusGeometry(0.27, 0.11, 12, 28);
  for (let i = 0; i < count; i++) {
    const tire = new THREE.Mesh(geo, m.rubber);
    tire.rotation.x = Math.PI / 2;
    tire.rotation.z = i * 0.7;
    tire.position.set(x + (i % 2) * 0.03, 0.11 + i * 0.21, z - (i % 2) * 0.02);
    tire.castShadow = true;
    tire.receiveShadow = true;
    stack.add(tire);
  }
  colliders.push(boxFromCenter(x, z, 0.8, 0.8));
  return stack;
}

function buildDrum(m: Mats, x: number, z: number, colliders: Box2D[]): THREE.Group {
  const drum = placeholderGroup('tambor_oleo', 'Tambor de óleo usado');
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 24), m.drumBlue);
  body.position.set(x, 0.44, z);
  body.castShadow = true;
  body.receiveShadow = true;
  drum.add(body);
  for (const y of [0.3, 0.6]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.012, 6, 24), m.darkSteel);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y, z);
    drum.add(ring);
  }
  colliders.push(boxFromCenter(x, z, 0.6, 0.6));
  return drum;
}

function buildOfficeCorner(m: Mats, x: number, z: number, colliders: Box2D[]): THREE.Group {
  const office = placeholderGroup('escritorio', 'Mesa do escritório');
  // Mesa
  box(office, m.wood, 1.6, 0.05, 0.75, x, 0.74, z);
  box(office, m.beige, 0.05, 0.74, 0.7, x - 0.76, 0, z);
  box(office, m.beige, 0.05, 0.74, 0.7, x + 0.76, 0, z);
  // Computador antigo (monitor de tubo) e teclado: futuro computador de gestão (GDD §17.2).
  const pc = placeholderGroup('computador', 'Computador do escritório');
  box(pc, m.beige, 0.42, 0.36, 0.4, x - 0.2, 0.79, z + 0.05);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x0b1a12, emissive: 0x0e3b22, emissiveIntensity: 0.8, roughness: 0.2 }),
  );
  screen.position.set(x - 0.2, 0.97, z - 0.151);
  screen.rotation.y = Math.PI;
  pc.add(screen);
  box(pc, m.beige, 0.4, 0.025, 0.14, x - 0.2, 0.79, z - 0.25);
  tagInteractable(pc, EQUIPMENT_IDS.computer);
  office.add(pc);
  // Cadeira
  box(office, m.blackPaint, 0.45, 0.06, 0.45, x - 0.2, 0.45, z - 0.75);
  box(office, m.blackPaint, 0.45, 0.5, 0.05, x - 0.2, 0.51, z - 0.97);
  box(office, m.darkSteel, 0.05, 0.45, 0.05, x - 0.2, 0, z - 0.75);
  // Arquivo de metal
  box(office, m.steel, 0.5, 1.3, 0.6, x + 1.25, 0, z + 0.05);
  colliders.push(boxFromCenter(x, z, 1.7, 0.85), boxFromCenter(x - 0.2, z - 0.8, 0.55, 0.55), boxFromCenter(x + 1.25, z + 0.05, 0.55, 0.65));
  return office;
}

/** Interruptor das luzes do galpão, na parede da frente ao lado do portão. */
function buildLightSwitch(m: Mats, x: number, wallZ: number): THREE.Group {
  const sw = placeholderGroup('interruptor', 'Interruptor das luzes');
  box(sw, m.beige, 0.16, 0.22, 0.03, x, 1.18, wallZ - 0.015, { cast: false, receive: true });
  box(sw, m.blackPaint, 0.05, 0.08, 0.025, x, 1.25, wallZ - 0.04, { cast: false, receive: false });
  // Conduíte subindo até o teto.
  box(sw, m.darkSteel, 0.03, 3.6, 0.03, x, 1.4, wallZ - 0.02, { cast: false, receive: false });
  tagInteractable(sw, EQUIPMENT_IDS.lightSwitch);
  return sw;
}

function buildLighting(
  root: THREE.Group,
  m: Mats,
  bay: { x: number; z: number },
): { shadowLights: Array<THREE.DirectionalLight | THREE.SpotLight>; hall: HallLights } {
  const S = WORKSHOP_SIZE;
  const lights = new THREE.Group();
  lights.name = 'iluminacao';
  root.add(lights);

  // Luz ambiente de céu/chão (preenche as sombras sem achatar tudo).
  const hemi = new THREE.HemisphereLight(0xe6edf5, 0x4d4337, 0.38);
  lights.add(hemi);

  // Sol entrando pelo portão.
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(7, 15, 26);
  sun.target.position.set(0, 0, 3);
  const sc = sun.shadow.camera;
  sc.left = -16;
  sc.right = 16;
  sc.top = 16;
  sc.bottom = -16;
  sc.near = 1;
  sc.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  lights.add(sun, sun.target);

  // Spot sobre o box 1 (o carro é o foco da cena).
  const bayLight = new THREE.SpotLight(0xf4f7ff, 110, 0, 0.95, 0.65, 2);
  bayLight.position.set(bay.x, S.height - 0.5, bay.z);
  bayLight.target.position.set(bay.x, 0, bay.z);
  bayLight.shadow.bias = -0.0006;
  bayLight.shadow.normalBias = 0.02;
  bayLight.shadow.camera.near = 0.5;
  bayLight.shadow.camera.far = 8;
  lights.add(bayLight, bayLight.target);

  // Luzes sem sombra (baratas) para o resto do galpão.
  const hallLights: THREE.Light[] = [bayLight];
  const fill = (x: number, y: number, z: number, color: number, intensity: number) => {
    const light = new THREE.PointLight(color, intensity, 0, 2);
    light.position.set(x, y, z);
    lights.add(light);
    hallLights.push(light);
  };
  fill(-3.8, 3.8, -6.8, 0xfff2df, 26); // bancada
  fill(4.2, 4.0, -3.5, 0xf2f5ff, 34); // box 2 e estantes
  fill(-4.6, 3.6, 5.6, 0xffe9cc, 18); // escritório

  // Luminárias fluorescentes (emissivas; a luz de verdade vem das fontes acima).
  for (const x of [-3.6, 0.6, 4.6]) {
    for (const z of [-5.5, -1.2, 3.2]) {
      box(lights, m.fixture, 1.3, 0.08, 0.26, x, S.height - 0.62, z, { cast: false, receive: false });
      box(lights, m.tube, 1.2, 0.03, 0.06, x, S.height - 0.655, z - 0.05, { cast: false, receive: false });
      box(lights, m.tube, 1.2, 0.03, 0.06, x, S.height - 0.655, z + 0.05, { cast: false, receive: false });
      box(lights, m.darkSteel, 0.01, 0.3, 0.01, x - 0.5, S.height - 0.54, z, { cast: false, receive: false });
      box(lights, m.darkSteel, 0.01, 0.3, 0.01, x + 0.5, S.height - 0.54, z, { cast: false, receive: false });
    }
  }

  return {
    shadowLights: [sun, bayLight],
    hall: {
      entries: [
        ...hallLights.map((light) => ({ light, on: light.intensity, off: 0 })),
        // Sem as lâmpadas sobra só a luz do dia (portão e janelas).
        { light: hemi, on: hemi.intensity, off: hemi.intensity * 0.35 },
      ],
      tube: m.tube,
      tubeOnIntensity: m.tube.emissiveIntensity,
      ambientOffFactor: 0.35,
    },
  };
}

// ---------------------------------------------------------------------------
// Destaque visual do tutorial (GDD Prompt 10) e upgrades visuais (Prompt 11)
// ---------------------------------------------------------------------------

interface HighlightAnchor {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  beaconY: number;
  followCarY?: boolean;
}

const HIGHLIGHT_ANCHORS: Readonly<Record<string, HighlightAnchor>> = {
  [EQUIPMENT_IDS.car]: { x: -1.6, y: 0.02, z: -1.2, w: 2.1, d: 4.1, beaconY: 1.95, followCarY: true },
  [EQUIPMENT_IDS.hood]: { x: -1.6, y: 0.55, z: 0.35, w: 1.55, d: 1.15, beaconY: 1.65, followCarY: true },
  [EQUIPMENT_IDS.lift]: { x: -3.7, y: 0.02, z: -1.2, w: 0.75, d: 0.75, beaconY: 1.85 },
  [EQUIPMENT_IDS.benchLamp]: { x: -4.1, y: 0.02, z: -8.55, w: 2.7, d: 0.9, beaconY: 2.25 },
  [EQUIPMENT_IDS.drawer]: { x: 0.6, y: 0.02, z: -8.67, w: 1.38, d: 0.7, beaconY: 1.95 },
  [EQUIPMENT_IDS.stock]: { x: 6.65, y: 0.02, z: -3.4, w: 0.75, d: 4.65, beaconY: 2.65 },
  [EQUIPMENT_IDS.computer]: { x: -5.4, y: 0.76, z: 6.8, w: 0.7, d: 0.65, beaconY: 1.55 },
  [EQUIPMENT_IDS.lightSwitch]: { x: -3.2, y: 1.1, z: 8.95, w: 0.35, d: 0.2, beaconY: 1.65 },
  [EQUIPMENT_IDS.gate]: { x: 0, y: 0.02, z: 8.85, w: 4.8, d: 0.35, beaconY: 1.55 },
};

function disableRaycast(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    child.raycast = () => {};
  });
}

function buildHighlightSystem(
  root: THREE.Group,
  carGroup: THREE.Group,
): {
  setHighlight(targetId: string | null, reduceMotion?: boolean): void;
  setReduceMotion(reduceMotion: boolean): void;
} {
  const group = new THREE.Group();
  group.name = 'destaque_tutorial';
  group.visible = false;
  root.add(group);

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffb703,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.0,
    roughness: 0.25,
    metalness: 0.1,
  });

  // Moldura de base no contorno do equipamento destacado.
  const frameGroup = new THREE.Group();
  frameGroup.name = 'moldura_destaque';
  const barThickness = 0.045;
  const barHeight = 0.025;
  const sideLeft = new THREE.Mesh(new THREE.BoxGeometry(barThickness, barHeight, 1), glowMat);
  const sideRight = new THREE.Mesh(new THREE.BoxGeometry(barThickness, barHeight, 1), glowMat);
  const sideFront = new THREE.Mesh(new THREE.BoxGeometry(1, barHeight, barThickness), glowMat);
  const sideBack = new THREE.Mesh(new THREE.BoxGeometry(1, barHeight, barThickness), glowMat);
  frameGroup.add(sideLeft, sideRight, sideFront, sideBack);
  group.add(frameGroup);

  // Marcador flutuante (anel + seta apontando para baixo).
  const beaconGroup = new THREE.Group();
  beaconGroup.name = 'marcador_destaque';
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), glowMat);
  cone.rotation.x = Math.PI; // ponta para baixo
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.024, 8, 24), glowMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.14;
  beaconGroup.add(cone, ring);
  group.add(beaconGroup);

  let currentTargetId: string | null = null;
  let currentAnchor: HighlightAnchor | null = null;
  let reduceMotionEnabled = false;

  // Atualiza animação sutil durante a renderização se reduceMotion estiver desligado.
  cone.onBeforeRender = () => {
    if (!group.visible || !currentAnchor) return;
    const carOffsetY = currentAnchor.followCarY ? carGroup.position.y : 0;
    frameGroup.position.y = currentAnchor.y + carOffsetY;
    if (reduceMotionEnabled) {
      beaconGroup.position.y = currentAnchor.beaconY + carOffsetY;
      cone.rotation.y = Math.PI / 4;
      glowMat.emissiveIntensity = 2.0;
      return;
    }
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    beaconGroup.position.y = currentAnchor.beaconY + carOffsetY + Math.sin(t * 3.2) * 0.07;
    cone.rotation.y = t * 1.4;
    glowMat.emissiveIntensity = 1.65 + 0.55 * Math.sin(t * 4.0);
  };

  disableRaycast(group);

  return {
    setHighlight(targetId: string | null, reduceMotion?: boolean): void {
      if (reduceMotion !== undefined) reduceMotionEnabled = reduceMotion;
      currentTargetId = targetId;
      const anchor = targetId ? (HIGHLIGHT_ANCHORS[targetId] ?? null) : null;
      currentAnchor = anchor;
      if (!anchor) {
        group.visible = false;
        return;
      }
      const carOffsetY = anchor.followCarY ? carGroup.position.y : 0;
      frameGroup.position.set(anchor.x, anchor.y + carOffsetY, anchor.z);
      sideLeft.scale.z = anchor.d;
      sideRight.scale.z = anchor.d;
      sideLeft.position.set(-anchor.w / 2, 0, 0);
      sideRight.position.set(anchor.w / 2, 0, 0);
      sideFront.scale.x = anchor.w + barThickness;
      sideBack.scale.x = anchor.w + barThickness;
      sideFront.position.set(0, 0, anchor.d / 2);
      sideBack.position.set(0, 0, -anchor.d / 2);

      beaconGroup.position.set(anchor.x, anchor.beaconY + carOffsetY, anchor.z);
      cone.rotation.y = Math.PI / 4;
      glowMat.emissiveIntensity = 2.0;
      group.visible = true;
    },
    setReduceMotion(reduceMotion: boolean): void {
      reduceMotionEnabled = reduceMotion;
      if (reduceMotionEnabled && currentTargetId && currentAnchor) {
        const carOffsetY = currentAnchor.followCarY ? carGroup.position.y : 0;
        beaconGroup.position.y = currentAnchor.beaconY + carOffsetY;
        cone.rotation.y = Math.PI / 4;
        glowMat.emissiveIntensity = 2.0;
      }
    },
  };
}

function buildUpgradeVisuals(
  m: Mats,
  liftGroup: THREE.Group,
  cabinetGroup: THREE.Group,
  shelves: THREE.Group[],
  hallLights: HallLights,
): {
  setUpgradeLevel(upgradeId: WorkshopUpgradeId, level: WorkshopUpgradeLevel): void;
} {
  const baseIntensities = hallLights.entries.map((e) => e.on);
  const baseTubeOn = hallLights.tubeOnIntensity;

  // 1. Iluminação: réguas de LED nas colunas do elevador e refletores extras.
  const ledStripMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe8f4ff,
    emissiveIntensity: 2.6,
  });
  const liftLedL1 = new THREE.Group();
  liftLedL1.name = 'upgrade_iluminacao_1';
  liftLedL1.visible = false;
  for (const side of [-1, 1]) {
    box(liftLedL1, ledStripMat, 0.03, 1.5, 0.04, -1.6 + side * (1.75 - side * 0.18), 1.8, -1.2, { cast: false, receive: false });
  }
  liftGroup.add(liftLedL1);
  disableRaycast(liftLedL1);

  // 2. Armário de ferramentas: bandeja lateral (nv 1), painel superior (nv 2), torquímetro/acabamento (nv 3).
  const cabX = 0.6;
  const cabZ = -WORKSHOP_SIZE.halfZ + 0.33;
  const cabL1 = new THREE.Group();
  cabL1.name = 'upgrade_armario_1';
  cabL1.visible = false;
  box(cabL1, m.redCabinet, 0.22, 0.08, 0.42, cabX + 0.74, 0.92, cabZ, { cast: false, receive: true });
  for (let i = 0; i < 4; i++) {
    box(cabL1, m.chrome, 0.025, 0.16, 0.025, cabX + 0.74, 0.88, cabZ - 0.14 + i * 0.09, { cast: false, receive: false });
  }

  const cabL2 = new THREE.Group();
  cabL2.name = 'upgrade_armario_2';
  cabL2.visible = false;
  box(cabL2, m.darkSteel, 1.22, 0.42, 0.06, cabX, 1.53, cabZ - 0.22, { cast: false, receive: true });
  for (let i = 0; i < 7; i++) {
    box(cabL2, m.chrome, 0.04, 0.09, 0.04, cabX - 0.45 + i * 0.15, 1.68, cabZ - 0.17, { cast: false, receive: false });
  }

  const cabL3 = new THREE.Group();
  cabL3.name = 'upgrade_armario_3';
  cabL3.visible = false;
  box(cabL3, m.yellowPaint, 1.24, 0.04, 0.08, cabX, 1.95, cabZ - 0.21, { cast: false, receive: false });
  box(cabL3, m.chrome, 0.68, 0.035, 0.035, cabX, 1.82, cabZ - 0.17, { cast: false, receive: false });

  cabinetGroup.add(cabL1, cabL2, cabL3);
  disableRaycast(cabL1);
  disableRaycast(cabL2);
  disableRaycast(cabL3);

  // 3. Organização do estoque: faixas de identificação (nv 1), caixas organizadoras azuis (nv 2), topo identificado (nv 3).
  const stockL1: THREE.Group[] = [];
  const stockL2: THREE.Group[] = [];
  const stockL3: THREE.Group[] = [];
  const shelfX = WORKSHOP_SIZE.halfX - 0.35;
  for (const [idx, z] of [-4.6, -2.2].entries()) {
    const s1 = new THREE.Group();
    s1.name = `upgrade_estoque_1_${idx}`;
    s1.visible = false;
    for (const y of [0.15, 0.75, 1.35, 1.95]) {
      box(s1, m.yellowPaint, 0.015, 0.032, 2.06, shelfX - 0.28, y, z, { cast: false, receive: false });
    }
    const s2 = new THREE.Group();
    s2.name = `upgrade_estoque_2_${idx}`;
    s2.visible = false;
    for (const dz of [-0.65, 0, 0.65]) {
      box(s2, m.drumBlue, 0.38, 0.18, 0.28, shelfX - 0.04, 0.78, z + dz, { cast: false, receive: true });
    }
    const s3 = new THREE.Group();
    s3.name = `upgrade_estoque_3_${idx}`;
    s3.visible = false;
    box(s3, m.liftPaint, 0.04, 0.18, 2.08, shelfX - 0.26, 2.4, z, { cast: false, receive: false });
    box(s3, m.yellowPaint, 0.045, 0.04, 1.8, shelfX - 0.265, 2.47, z, { cast: false, receive: false });

    const targetShelf = shelves[idx]!;
    targetShelf.add(s1, s2, s3);
    disableRaycast(s1);
    disableRaycast(s2);
    disableRaycast(s3);
    stockL1.push(s1);
    stockL2.push(s2);
    stockL3.push(s3);
  }

  return {
    setUpgradeLevel(upgradeId: WorkshopUpgradeId, level: WorkshopUpgradeLevel): void {
      const lv = Math.max(0, Math.min(3, level)) as WorkshopUpgradeLevel;
      if (upgradeId === 'iluminacao') {
        const mult = [1.0, 1.18, 1.36, 1.55][lv]!;
        const tubeMult = [1.0, 1.15, 1.3, 1.5][lv]!;
        const lightsCurrentlyOn = hallLights.tube.emissiveIntensity > 0.01;
        hallLights.entries.forEach((entry, i) => {
          entry.on = baseIntensities[i]! * mult;
          if (lightsCurrentlyOn) entry.light.intensity = entry.on;
        });
        hallLights.tubeOnIntensity = baseTubeOn * tubeMult;
        if (lightsCurrentlyOn) hallLights.tube.emissiveIntensity = hallLights.tubeOnIntensity;
        liftLedL1.visible = lv >= 1;
        ledStripMat.emissiveIntensity = 2.0 + lv * 0.5;
      } else if (upgradeId === 'armario-ferramentas') {
        cabL1.visible = lv >= 1;
        cabL2.visible = lv >= 2;
        cabL3.visible = lv >= 3;
      } else if (upgradeId === 'organizacao-estoque') {
        for (const g of stockL1) g.visible = lv >= 1;
        for (const g of stockL2) g.visible = lv >= 2;
        for (const g of stockL3) g.visible = lv >= 3;
      }
    },
  };
}
