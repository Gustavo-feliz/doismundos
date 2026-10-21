import * as THREE from 'three';
import { plateTexture } from '../utils/canvasTextures';
import type { VehicleDefinition } from './types';

/**
 * MODELO TEMPORÁRIO de carro, montado com formas simples a partir das
 * dimensões do catálogo. Será trocado por GLB do Blender (GDD §21.1).
 *
 * Eixos locais: comprimento em X (frente = +X), altura em Y, largura em Z.
 * O chão fica em y = 0.
 */
export interface PlaceholderCar {
  group: THREE.Group;
  /** Grupo do capô, com a dobradiça na origem. Girar em Z abre (positivo). */
  hoodPivot: THREE.Group;
  /** Compartimento do motor (visível com o capô aberto). */
  engineBay: THREE.Group;
  /** Rotação Z do capô fechado (acompanha a inclinação da carroceria). */
  hoodClosedAngle: number;
  /** Troca cor e placa (outro carro do mesmo modelo chegou ao box). */
  setLook(look: CarAppearance): void;
}

/** Aparência de um carro específico (vem do VehicleState, não do modelo). */
export interface CarAppearance {
  color: string;
  plate: string;
}

export function buildPlaceholderCar(def: VehicleDefinition, look: CarAppearance): PlaceholderCar {
  const d = def.dimensions;
  const car = new THREE.Group();
  car.name = `PLACEHOLDER_carro_${def.id}`;
  car.userData = { placeholder: true, label: `${def.manufacturer} ${def.model} (modelo temporário)` };

  const halfL = d.length / 2;
  const frontAxle = d.wheelbase / 2 + 0.02;
  const rearAxle = -d.wheelbase / 2 + 0.02;
  const archR = d.wheelRadius + 0.06;
  const wheelY = d.wheelRadius;
  const sill = 0.24; // altura da soleira

  // --- Materiais (compartilhados dentro do carro) ---
  const paint = new THREE.MeshPhysicalMaterial({
    color: look.color,
    metalness: 0.45,
    roughness: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0f171c,
    metalness: 0.2,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.65, metalness: 0.1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.28 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdce0e4, metalness: 0.95, roughness: 0.16 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, emissive: 0xfff6dc, emissiveIntensity: 0.35, roughness: 0.15 });
  const amberLight = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.32, roughness: 0.2 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0x8a0f0f, emissive: 0x6a0000, emissiveIntensity: 0.4, roughness: 0.2 });

  // --- Carroceria: perfil lateral extrudado na largura ---
  const body = new THREE.Shape();
  body.moveTo(-halfL + 0.04, sill + 0.02);
  body.lineTo(rearAxle - archR, sill);
  body.absarc(rearAxle, wheelY, archR, Math.PI, 0, true);
  body.lineTo(frontAxle - archR, sill);
  body.absarc(frontAxle, wheelY, archR, Math.PI, 0, true);
  body.lineTo(halfL - 0.06, sill + 0.03);
  body.lineTo(halfL, 0.4);
  body.lineTo(halfL - 0.02, 0.62);
  body.lineTo(halfL - 0.25, 0.75);
  body.lineTo(0.78, 0.9); // base do para-brisa
  body.lineTo(-1.32, 0.92); // base do vidro traseiro
  body.lineTo(-halfL + 0.2, 0.88);
  body.lineTo(-halfL, 0.66);
  body.lineTo(-halfL - 0.02, 0.36);
  body.closePath();

  const bevel = 0.07;
  const bodyDepth = d.width - bevel * 2;
  const bodyGeo = new THREE.ExtrudeGeometry(body, {
    depth: bodyDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: 0.05,
    bevelSegments: 4,
    curveSegments: 18,
  });
  bodyGeo.translate(0, 0, -bodyDepth / 2);
  addMesh(car, bodyGeo, paint, 'carroceria');

  // --- Cabine (vidros) ---
  const cabin = new THREE.Shape();
  cabin.moveTo(0.8, 0.88);
  cabin.lineTo(0.02, d.height - 0.04);
  cabin.lineTo(-0.9, d.height - 0.03);
  cabin.lineTo(-1.36, 0.9);
  cabin.closePath();
  const cabinDepth = d.width * 0.82;
  const cabinGeo = new THREE.ExtrudeGeometry(cabin, {
    depth: cabinDepth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 3,
  });
  cabinGeo.translate(0, 0, -cabinDepth / 2);
  addMesh(car, cabinGeo, glass, 'vidros');

  // Teto pintado por cima dos vidros.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.05, cabinDepth + 0.02), paint);
  roof.position.set(-0.44, d.height - 0.005, 0);
  roof.castShadow = true;
  car.add(roof);

  // Colunas B (escuras) dos dois lados.
  const pillarGeo = new THREE.BoxGeometry(0.09, 0.5, 0.02);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, trim);
    pillar.position.set(-0.3, 1.16, side * (cabinDepth / 2 + 0.045));
    pillar.rotation.z = 0.06;
    car.add(pillar);
  }

  // --- Para-choques, grade, faróis, lanternas, frisos ---
  const bumperGeo = new THREE.BoxGeometry(0.16, 0.2, d.width * 0.98);
  const frontBumper = new THREE.Mesh(bumperGeo, trim);
  frontBumper.position.set(halfL - 0.02, 0.36, 0);
  car.add(frontBumper);
  const rearBumper = new THREE.Mesh(bumperGeo, trim);
  rearBumper.position.set(-halfL + 0.0, 0.38, 0);
  car.add(rearBumper);

  // Grade frontal aletada com emblema cromado fictício.
  const grilleW = d.width * 0.42;
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, grilleW), trim);
  grille.position.set(halfL + 0.005, 0.56, 0);
  car.add(grille);
  for (const dy of [-0.032, 0, 0.032]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, grilleW - 0.04), chrome);
    slat.position.set(halfL + 0.032, 0.56 + dy, 0);
    car.add(slat);
  }
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.016, 12), chrome);
  badge.rotation.z = Math.PI / 2;
  badge.position.set(halfL + 0.036, 0.56, 0);
  car.add(badge);

  const headGeo = new THREE.BoxGeometry(0.06, 0.12, 0.26);
  const blinkerGeo = new THREE.BoxGeometry(0.058, 0.118, 0.085);
  const tailGeo = new THREE.BoxGeometry(0.06, 0.13, 0.32);
  const sideStripGeo = new THREE.BoxGeometry(d.wheelbase - archR * 2.1, 0.04, 0.022);
  const handleGeo = new THREE.BoxGeometry(0.14, 0.032, 0.024);

  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(headGeo, headlight);
    head.position.set(halfL - 0.03, 0.6, side * (d.width / 2 - 0.3));
    car.add(head);
    const blinker = new THREE.Mesh(blinkerGeo, amberLight);
    blinker.position.set(halfL - 0.032, 0.6, side * (d.width / 2 - 0.125));
    car.add(blinker);
    const tail = new THREE.Mesh(tailGeo, taillight);
    tail.position.set(-halfL - 0.03, 0.7, side * (d.width / 2 - 0.24));
    car.add(tail);
    // Retrovisor com espelho reflexivo
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), paint);
    mirror.position.set(0.62, 0.98, side * (d.width / 2 + 0.06));
    car.add(mirror);
    // Friso protetor lateral e maçaneta
    const strip = new THREE.Mesh(sideStripGeo, trim);
    strip.position.set(0.02, 0.5, side * (d.width / 2 + 0.005));
    car.add(strip);
    const handle = new THREE.Mesh(handleGeo, trim);
    handle.position.set(-0.18, 0.78, side * (d.width / 2 + 0.006));
    car.add(handle);
  }

  // Limpadores de para-brisa
  for (const zOff of [-0.26, 0.18]) {
    const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 0.42), trim);
    wiper.position.set(0.75, 0.915, zOff);
    wiper.rotation.y = 0.15;
    car.add(wiper);
  }

  // Ponteira do escapamento traseiro
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 12), chrome);
  exhaust.rotation.z = Math.PI / 2;
  exhaust.position.set(-halfL - 0.02, 0.23, -d.width * 0.28);
  car.add(exhaust);

  // Placas (Mercosul/Rio fictícias).
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(look.plate), roughness: 0.45 });
  const plateGeo = new THREE.PlaneGeometry(0.4, 0.13);
  const frontPlate = new THREE.Mesh(plateGeo, plateMat);
  frontPlate.position.set(halfL + 0.07, 0.36, 0);
  frontPlate.rotation.y = Math.PI / 2;
  car.add(frontPlate);
  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(-halfL - 0.085, 0.42, 0);
  rearPlate.rotation.y = -Math.PI / 2;
  car.add(rearPlate);

  // --- Rodas, discos e pinças de freio ---
  const tireWidth = 0.2;
  const tireGeo = new THREE.CylinderGeometry(d.wheelRadius, d.wheelRadius, tireWidth, 28);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(d.wheelRadius * 0.62, d.wheelRadius * 0.62, tireWidth + 0.012, 20);
  rimGeo.rotateX(Math.PI / 2);
  const brakeDiscGeo = new THREE.CylinderGeometry(d.wheelRadius * 0.46, d.wheelRadius * 0.46, 0.03, 18);
  brakeDiscGeo.rotateX(Math.PI / 2);
  const caliperGeo = new THREE.BoxGeometry(0.09, 0.12, 0.06);
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.4, metalness: 0.35 });
  const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, tireWidth + 0.03, 10);
  hubGeo.rotateX(Math.PI / 2);
  for (const x of [frontAxle, rearAxle]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.name = 'roda';
      wheel.position.set(x, wheelY, side * (d.track / 2));
      const tire = new THREE.Mesh(tireGeo, rubber);
      tire.castShadow = true;
      const disc = new THREE.Mesh(brakeDiscGeo, chrome);
      disc.position.z = -side * 0.04;
      const caliper = new THREE.Mesh(caliperGeo, caliperMat);
      caliper.position.set(-0.08, 0.04, -side * 0.04);
      wheel.add(tire, new THREE.Mesh(rimGeo, rim), disc, caliper, new THREE.Mesh(hubGeo, trim));
      car.add(wheel);
    }
  }

  // Assoalho escuro para não ver "através" do carro por baixo.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(d.length * 0.92, 0.05, d.width * 0.9), trim);
  floor.position.y = sill + 0.02;
  car.add(floor);

  // --- Capô e compartimento do motor (Direção Híbrida A+B: peças legíveis + PBR) ---
  // A dobradiça fica na base do para-brisa; o capô segue a inclinação da carroceria.
  const hinge = new THREE.Vector2(0.78, 0.9);
  const hoodEnd = new THREE.Vector2(halfL - 0.25, 0.75);
  const hoodLen = hinge.distanceTo(hoodEnd) + 0.06;
  const slope = Math.atan2(hoodEnd.y - hinge.y, hoodEnd.x - hinge.x);
  const bayWidth = d.width * 0.86;

  const bay = new THREE.Group();
  bay.name = 'PLACEHOLDER_compartimento_motor';
  bay.position.set(hinge.x, hinge.y, 0);
  bay.rotation.z = slope;

  const bayDarkMat = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.82 });
  const castAluminumMat = new THREE.MeshStandardMaterial({ color: 0x8e959c, roughness: 0.42, metalness: 0.72 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x35393e, roughness: 0.5, metalness: 0.65 });
  const valveCoverMat = new THREE.MeshStandardMaterial({ color: 0xb82e24, roughness: 0.35, metalness: 0.3 });
  const hoseOrangeMat = new THREE.MeshStandardMaterial({ color: 0xd95f2a, roughness: 0.62 });
  const coolantTankMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d5, roughness: 0.3, metalness: 0.05 });
  const coolantCapMat = new THREE.MeshStandardMaterial({ color: 0x1e56a0, roughness: 0.4 });
  const yellowCapMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 });

  // Base do cofre e abas laterais internas
  const bayFloor = new THREE.Mesh(new THREE.BoxGeometry(hoodLen, 0.015, bayWidth), bayDarkMat);
  bayFloor.position.set(hoodLen / 2, -0.01, 0);
  bay.add(bayFloor);

  // 1. Bloco transversal, cabeçote, tampa de válvulas e 4 bobinas/cabos de vela
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.54), castAluminumMat);
  engineBlock.position.set(0.46, 0.032, -0.04);
  const valveCover = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.036, 0.48), valveCoverMat);
  valveCover.position.set(0.44, 0.085, -0.04);
  const oilCap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), trim);
  oilCap.position.set(0.44, 0.11, -0.2);
  bay.add(engineBlock, valveCover, oilCap);

  // Coletor de admissão (4 tubos metálicos frontais) e 4 bobinas/velas
  for (let i = 0; i < 4; i++) {
    const zPos = -0.2 + i * 0.11;
    const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 10), castAluminumMat);
    runner.rotation.z = Math.PI / 2;
    runner.position.set(0.6, 0.06, zPos);
    const sparkBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 10), trim);
    sparkBoot.position.set(0.44, 0.108, zPos + 0.03);
    bay.add(runner, sparkBoot);
  }

  // 2. Alternador + polia e correia de acessórios (lado direito do motor / -Z)
  const alternator = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.11, 14), castAluminumMat);
  alternator.rotation.x = Math.PI / 2;
  alternator.position.set(0.56, 0.045, -0.38);
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.025, 14), darkMetalMat);
  pulley.rotation.x = Math.PI / 2;
  pulley.position.set(0.56, 0.045, -0.45);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.018), rubber);
  belt.position.set(0.5, 0.04, -0.45);
  bay.add(alternator, pulley, belt);

  // 3. Caixa do filtro de ar e duto de admissão
  const airFilterBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.22), trim);
  airFilterBox.position.set(0.24, 0.04, -0.22);
  const intakeDuct = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 12), rubber);
  intakeDuct.rotation.x = Math.PI / 2;
  intakeDuct.position.set(0.26, 0.065, -0.04);
  bay.add(airFilterBox, intakeDuct);

  // 4. Bateria 12V com polos positivo (vermelho) e negativo (chumbo)
  const batX = 0.56;
  const batZ = bayWidth / 2 - 0.18;
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.085, 0.17), trim);
  battery.position.set(batX, 0.042, batZ);
  const posPost = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.035), valveCoverMat);
  posPost.position.set(batX + 0.06, 0.092, batZ - 0.045);
  const negPost = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.035), chrome);
  negPost.position.set(batX - 0.06, 0.092, batZ - 0.045);
  bay.add(battery, posPost, negPost);

  // 5. Radiador frontal, tampa de pressão e mangueiras de arrefecimento
  const radiatorX = hoodLen - 0.11;
  const radiatorCore = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, bayWidth * 0.62), castAluminumMat);
  radiatorCore.position.set(radiatorX, 0.042, 0);
  const radiatorTop = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, bayWidth * 0.64), trim);
  radiatorTop.position.set(radiatorX, 0.092, 0);
  const radCap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.018, 12), chrome);
  radCap.position.set(radiatorX, 0.11, -0.18);
  const upperHose = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 10), hoseOrangeMat);
  upperHose.rotation.z = Math.PI / 2;
  upperHose.rotation.y = 0.25;
  upperHose.position.set(0.7, 0.075, 0.18);
  bay.add(radiatorCore, radiatorTop, radCap, upperHose);

  // 6. Reservatório de expansão (arrefecimento) e reservatório de fluido de freio
  const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.075, 16), coolantTankMat);
  reservoir.position.set(0.32, 0.04, -bayWidth / 2 + 0.16);
  const reservoirCap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.018, 12), coolantCapMat);
  reservoirCap.position.set(0.32, 0.085, -bayWidth / 2 + 0.16);
  const brakeRes = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.065, 0.09), coolantTankMat);
  brakeRes.position.set(0.18, 0.045, bayWidth / 2 - 0.2);
  const brakeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.016, 12), yellowCapMat);
  brakeCap.position.set(0.18, 0.085, bayWidth / 2 - 0.2);
  bay.add(reservoir, reservoirCap, brakeRes, brakeCap);

  car.add(bay);

  const hoodPivot = new THREE.Group();
  hoodPivot.name = 'capo';
  hoodPivot.position.set(hinge.x, hinge.y, 0);
  hoodPivot.rotation.z = slope;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(hoodLen, 0.025, bayWidth + 0.06), paint);
  hood.position.set(hoodLen / 2, 0.075, 0);
  hood.castShadow = true;
  hood.receiveShadow = true;
  // Manta acústica escura na face interna do capô
  const hoodLiner = new THREE.Mesh(new THREE.BoxGeometry(hoodLen * 0.78, 0.008, bayWidth * 0.82), bayDarkMat);
  hoodLiner.position.set(hoodLen / 2, 0.06, 0);
  hoodPivot.add(hood, hoodLiner);
  car.add(hoodPivot);

  const setLook = (next: CarAppearance) => {
    paint.color.set(next.color);
    const old = plateMat.map;
    plateMat.map = plateTexture(next.plate);
    plateMat.needsUpdate = true;
    old?.dispose();
  };

  return { group: car, hoodPivot, engineBay: bay, hoodClosedAngle: slope, setLook };
}

function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
