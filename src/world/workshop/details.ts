import * as THREE from 'three';
import { createSeededRandom, range } from '../../utils/random';
import { boxFromCenter, type Box2D } from '../collision';

/**
 * Detalhes modulares da Oficina Nível Steam (Prompt 20 — Direção Híbrida A+B):
 * - Canaletas de drenagem com grelha metálica no piso dos boxes;
 * - Quadro de distribuição elétrica, conduítes, tomadas e relógio/calendário;
 * - Compressor de ar de 200L, coletor de óleo a vácuo e prensa hidráulica no Box 2;
 * - Rádio antigo sintonizado sobre a bancada;
 * - Ventilador de parede/teto com pás animadas (respeita `reduceMotion`);
 * - Camada de poeira/história herdada do tio que diminui conforme os upgrades evoluem;
 * - Poeira em suspensão no feixe de sol do portão (visível em qualidade `'alta'`).
 */

export interface WorkshopDetailMaterials {
  steel: THREE.MeshStandardMaterial;
  darkSteel: THREE.MeshStandardMaterial;
  liftPaint: THREE.MeshStandardMaterial;
  yellowPaint: THREE.MeshStandardMaterial;
  blackPaint: THREE.MeshStandardMaterial;
  redCabinet: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  beige: THREE.MeshStandardMaterial;
}

export interface WorkshopDynamicDetails {
  /** Grupo de detalhes decorativos secundários (oculto em qualidade `'baixa'`). */
  decorGroup: THREE.Group;
  /** Grupo de marcas de poeira/uso inicial que se limpa com os upgrades da oficina. */
  legacyDustGroup: THREE.Group;
  /** Partículas sutis de poeira no feixe de sol do portão (apenas qualidade `'alta'`). */
  sunDustPoints: THREE.Points;
  /** Atualiza a preferência de reduzir movimento (para o ventilador e partículas). */
  setReduceMotion(reduceMotion: boolean): void;
  /** Atualiza o nível de limpeza conforme a soma dos níveis de upgrade (0..15). */
  setTotalUpgradeProgress(totalLevels: number): void;
  /** Ajusta visibilidade para qualidade `'baixa' | 'media' | 'alta'`. */
  setQualityTier(tier: 'baixa' | 'media' | 'alta'): void;
}

function addBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  cast = false,
  receive = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

/**
 * Adiciona detalhes arquitetônicos estáticos ao grupo `shell` (que será unido por `mergeStaticMeshes`):
 * canaletas de piso, quadro de força, conduítes, calendário e rádio na bancada.
 */
export function addStaticArchitecturalDetails(
  shell: THREE.Group,
  bench: THREE.Group,
  m: WorkshopDetailMaterials,
  halfX: number,
  halfZ: number,
): void {
  // 1. Canaletas de drenagem com grelha metálica entre os boxes
  for (const cx of [-1.6, 3.6]) {
    addBox(shell, m.darkSteel, 0.24, 0.004, 5.2, cx, 0.001, -1.2, false, true);
    for (let gz = -3.6; gz <= 1.2; gz += 0.4) {
      addBox(shell, m.steel, 0.2, 0.006, 0.04, cx, 0.002, gz, false, false);
    }
  }

  // 2. Quadro de luz geral com disjuntores na parede esquerda (próximo ao escritório)
  const qx = -halfX + 0.04;
  const qz = 3.8;
  addBox(shell, m.darkSteel, 0.08, 0.65, 0.48, qx, 1.35, qz, false, true);
  addBox(shell, m.yellowPaint, 0.085, 0.12, 0.14, qx + 0.005, 1.72, qz, false, false);
  // Conduítes aparentes correndo pela parede esquerda até o quadro
  addBox(shell, m.darkSteel, 0.03, 0.03, 11.5, -halfX + 0.02, 2.45, -1.5, false, false);
  addBox(shell, m.darkSteel, 0.03, 2.1, 0.03, -halfX + 0.02, 1.4, qz - 0.15, false, false);

  // 3. Relógio de parede octogonal e calendário do Seu Zé nos fundos
  addBox(shell, m.darkSteel, 0.36, 0.36, 0.04, -0.8, 2.85, -halfZ + 0.02, false, false);
  addBox(shell, m.beige, 0.3, 0.3, 0.045, -0.8, 2.88, -halfZ + 0.022, false, false);
  addBox(shell, m.blackPaint, 0.02, 0.11, 0.05, -0.8, 3.0, -halfZ + 0.025, false, false);
  addBox(shell, m.redCabinet, 0.32, 0.12, 0.015, 2.1, 2.25, -halfZ + 0.015, false, false);
  addBox(shell, m.beige, 0.32, 0.28, 0.015, 2.1, 1.97, -halfZ + 0.015, false, false);

  // 4. Rádio portátil clássico sobre a bancada (-4.1, -8.55) com antena inclinada
  const rx = -5.05;
  const rz = -halfZ + 0.32;
  const ry = 0.96;
  addBox(bench, m.blackPaint, 0.28, 0.15, 0.12, rx, ry, rz, false, true);
  addBox(bench, m.chrome, 0.24, 0.05, 0.125, rx, ry + 0.08, rz, false, false);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 6), m.chrome);
  antenna.position.set(rx - 0.1, ry + 0.28, rz);
  antenna.rotation.z = -0.35;
  bench.add(antenna);
}

/**
 * Monta equipamentos de apoio da oficina (compressor de ar de 200L, coletor de óleo
 * e prensa hidráulica) + ventilador com pás animadas + poeira do feixe de luz.
 */
export function buildDynamicWorkshopDetails(
  root: THREE.Group,
  m: WorkshopDetailMaterials,
  halfX: number,
  halfZ: number,
  height: number,
  colliders: Box2D[],
): WorkshopDynamicDetails {
  const decorGroup = new THREE.Group();
  decorGroup.name = 'decoracao_oficina_steam';
  root.add(decorGroup);

  // 1. Compressor de ar industrial azul de 200L no canto esquerdo dos fundos
  const compX = -halfX + 0.55;
  const compZ = -6.8;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.15, 16), m.liftPaint);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(compX, 0.36, compZ);
  tank.castShadow = true;
  tank.receiveShadow = true;
  decorGroup.add(tank);
  addBox(decorGroup, m.darkSteel, 0.28, 0.26, 0.32, compX, 0.58, compZ - 0.15, true, true);
  addBox(decorGroup, m.redCabinet, 0.12, 0.12, 0.12, compX, 0.62, compZ + 0.25, false, false);
  for (const dz of [-0.38, 0.38]) {
    addBox(decorGroup, m.darkSteel, 0.32, 0.14, 0.06, compX, 0, compZ + dz, false, true);
  }
  colliders.push(boxFromCenter(compX, compZ, 0.65, 1.3));

  // 2. Prensa hidráulica de coluna vermelha no fundo do Box 2
  const pressX = 5.3;
  const pressZ = -halfZ + 0.42;
  for (const dx of [-0.32, 0.32]) {
    addBox(decorGroup, m.redCabinet, 0.08, 1.75, 0.14, pressX + dx, 0, pressZ, true, true);
  }
  addBox(decorGroup, m.redCabinet, 0.76, 0.12, 0.18, pressX, 1.65, pressZ, false, true);
  addBox(decorGroup, m.darkSteel, 0.72, 0.08, 0.18, pressX, 0.88, pressZ, false, true);
  addBox(decorGroup, m.chrome, 0.08, 0.35, 0.08, pressX, 1.3, pressZ, false, false);
  colliders.push(boxFromCenter(pressX, pressZ, 0.85, 0.5));

  // 3. Coletor móvel de óleo usado ao lado do elevador
  const drainerX = -3.65;
  const drainerZ = -3.1;
  const drainerTank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.58, 14), m.redCabinet);
  drainerTank.position.set(drainerX, 0.32, drainerZ);
  const drainerStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 8), m.chrome);
  drainerStem.position.set(drainerX, 0.9, drainerZ);
  const drainerFunnel = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 14), m.blackPaint);
  drainerFunnel.rotation.x = Math.PI;
  drainerFunnel.position.set(drainerX, 1.25, drainerZ);
  decorGroup.add(drainerTank, drainerStem, drainerFunnel);
  colliders.push(boxFromCenter(drainerX, drainerZ, 0.5, 0.5));

  // 4. Ventilador de teto industrial (gira suavemente se reduceMotion for false)
  const fanGroup = new THREE.Group();
  fanGroup.name = 'ventilador_teto';
  fanGroup.position.set(1.2, height - 0.55, 1.2);
  const fanRod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), m.darkSteel);
  fanRod.position.y = 0.25;
  const fanHub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 12), m.darkSteel);
  const bladesGroup = new THREE.Group();
  bladesGroup.name = 'ventilador_pas';
  const bladeGeo = new THREE.BoxGeometry(0.95, 0.015, 0.14);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(bladeGeo, m.steel);
    const angle = (i * Math.PI * 2) / 3;
    b.position.set(Math.cos(angle) * 0.52, 0, Math.sin(angle) * 0.52);
    b.rotation.y = -angle;
    bladesGroup.add(b);
  }
  fanGroup.add(fanRod, fanHub, bladesGroup);
  decorGroup.add(fanGroup);

  // 5. História e evolução: caixas velhas/manchas extras da oficina herdada que somem conforme upgrades sobem
  const legacyDustGroup = new THREE.Group();
  legacyDustGroup.name = 'poeira_inicial_heranca';
  addBox(legacyDustGroup, m.beige, 0.48, 0.003, 0.62, 1.8, 0.002, 3.2, false, true);
  addBox(legacyDustGroup, m.beige, 0.55, 0.003, 0.42, -2.9, 0.002, 4.1, false, true);
  root.add(legacyDustGroup);

  // 6. Partículas sutis de poeira no feixe de luz do portão (qualidade 'alta')
  const rng = createSeededRandom(901);
  const particleCount = 48;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = range(rng, -2.2, 2.2);
    positions[i * 3 + 1] = range(rng, 0.6, 3.4);
    positions[i * 3 + 2] = range(rng, 3.5, 8.6);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xfff3d6,
    size: 0.035,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const sunDustPoints = new THREE.Points(dustGeo, dustMat);
  sunDustPoints.name = 'particulas_feixe_sol';
  sunDustPoints.raycast = () => {};
  root.add(sunDustPoints);

  let reduceMotionEnabled = false;
  fanHub.onBeforeRender = () => {
    if (reduceMotionEnabled) return;
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    bladesGroup.rotation.y = t * 2.8;
  };

  return {
    decorGroup,
    legacyDustGroup,
    sunDustPoints,
    setReduceMotion(reduceMotion: boolean) {
      reduceMotionEnabled = reduceMotion;
    },
    setTotalUpgradeProgress(totalLevels: number) {
      // Conforme o jogador evolui a oficina (totalLevels >= 3), a bagunça/poeira inicial desaparece.
      legacyDustGroup.visible = totalLevels < 3;
    },
    setQualityTier(tier: 'baixa' | 'media' | 'alta') {
      decorGroup.visible = tier !== 'baixa';
      sunDustPoints.visible = tier === 'alta';
    },
  };
}

