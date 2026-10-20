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
  const headlight = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, emissive: 0xfff6dc, emissiveIntensity: 0.35, roughness: 0.15 });
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

  // --- Para-choques, grade, faróis, lanternas ---
  const bumperGeo = new THREE.BoxGeometry(0.16, 0.2, d.width * 0.98);
  const frontBumper = new THREE.Mesh(bumperGeo, trim);
  frontBumper.position.set(halfL - 0.02, 0.36, 0);
  car.add(frontBumper);
  const rearBumper = new THREE.Mesh(bumperGeo, trim);
  rearBumper.position.set(-halfL + 0.0, 0.38, 0);
  car.add(rearBumper);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, d.width * 0.42), trim);
  grille.position.set(halfL + 0.005, 0.56, 0);
  car.add(grille);

  const lampGeo = new THREE.BoxGeometry(0.06, 0.12, 0.34);
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(lampGeo, headlight);
    head.position.set(halfL - 0.03, 0.6, side * (d.width / 2 - 0.26));
    car.add(head);
    const tail = new THREE.Mesh(lampGeo, taillight);
    tail.position.set(-halfL - 0.03, 0.7, side * (d.width / 2 - 0.24));
    car.add(tail);
    // Retrovisor
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.12), paint);
    mirror.position.set(0.62, 0.98, side * (d.width / 2 + 0.06));
    car.add(mirror);
  }

  // Placas (fictícias, provisórias).
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture(look.plate), roughness: 0.5 });
  const plateGeo = new THREE.PlaneGeometry(0.4, 0.13);
  const frontPlate = new THREE.Mesh(plateGeo, plateMat);
  frontPlate.position.set(halfL + 0.07, 0.36, 0);
  frontPlate.rotation.y = Math.PI / 2;
  car.add(frontPlate);
  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(-halfL - 0.085, 0.42, 0);
  rearPlate.rotation.y = -Math.PI / 2;
  car.add(rearPlate);

  // --- Rodas ---
  const tireWidth = 0.2;
  const tireGeo = new THREE.CylinderGeometry(d.wheelRadius, d.wheelRadius, tireWidth, 28);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(d.wheelRadius * 0.62, d.wheelRadius * 0.62, tireWidth + 0.012, 20);
  rimGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, tireWidth + 0.03, 10);
  hubGeo.rotateX(Math.PI / 2);
  for (const x of [frontAxle, rearAxle]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.name = 'roda';
      wheel.position.set(x, wheelY, side * (d.track / 2));
      const tire = new THREE.Mesh(tireGeo, rubber);
      tire.castShadow = true;
      wheel.add(tire, new THREE.Mesh(rimGeo, rim), new THREE.Mesh(hubGeo, trim));
      car.add(wheel);
    }
  }

  // Assoalho escuro para não ver "através" do carro por baixo.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(d.length * 0.92, 0.05, d.width * 0.9), trim);
  floor.position.y = sill + 0.02;
  car.add(floor);

  // --- Capô e compartimento do motor ---
  // A dobradiça fica na base do para-brisa; o capô segue a inclinação da carroceria.
  const hinge = new THREE.Vector2(0.78, 0.9);
  const hoodEnd = new THREE.Vector2(halfL - 0.25, 0.75);
  const hoodLen = hinge.distanceTo(hoodEnd) + 0.06;
  const slope = Math.atan2(hoodEnd.y - hinge.y, hoodEnd.x - hinge.x);
  const bayWidth = d.width * 0.86;

  // Compartimento: TEMPORÁRIO, só para mostrar que o capô abre. Peças reais vêm no Prompt 3.
  const bay = new THREE.Group();
  bay.name = 'PLACEHOLDER_compartimento_motor';
  bay.position.set(hinge.x, hinge.y, 0);
  bay.rotation.z = slope;
  const bayFloor = new THREE.Mesh(new THREE.BoxGeometry(hoodLen, 0.012, bayWidth), new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.8 }));
  bayFloor.position.set(hoodLen / 2, 0.006, 0);
  const engineMat = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.5, metalness: 0.6 });
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.6), engineMat);
  engine.position.set(0.55, 0.035, 0);
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.16), new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.6 }));
  battery.position.set(0.3, 0.035, bayWidth / 2 - 0.16);
  const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.4 }));
  reservoir.position.set(0.85, 0.035, -bayWidth / 2 + 0.18);
  bay.add(bayFloor, engine, battery, reservoir);
  car.add(bay);

  const hoodPivot = new THREE.Group();
  hoodPivot.name = 'capo';
  hoodPivot.position.set(hinge.x, hinge.y, 0);
  hoodPivot.rotation.z = slope;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(hoodLen, 0.025, bayWidth + 0.06), paint);
  hood.position.set(hoodLen / 2, 0.075, 0);
  hood.castShadow = true;
  hood.receiveShadow = true;
  hoodPivot.add(hood);
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
