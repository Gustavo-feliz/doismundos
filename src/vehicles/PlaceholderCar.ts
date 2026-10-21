import * as THREE from 'three';
import { plateTexture } from '../utils/canvasTextures';
import { mergeStaticMeshes } from '../utils/mergeStatic';
import { computeExteriorVisualWear, type ExteriorVisualWear, type ExteriorWearInput } from './models/exteriorWear';
import type { VehicleCategory, VehicleDefinition } from './types';

/**
 * Modelo 3D de carro por categoria (`popular`, `hatch`, `sedan`, `suv`,
 * `picape`, `van`) a partir das dimensões do catálogo (Prompts 12 e 22).
 * Inclui interior visível (painel, volante, bancos), cofre do motor legível,
 * haste do capô e desgaste visual externo seguro.
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
  /** Reconstrói a carroceria 3D e dimensões quando muda o modelo/categoria do veículo. */
  setVehicle(def: VehicleDefinition, look: CarAppearance): void;
  /** Aplica desgaste visual externo (poeira/verniz) sem expor estado de peças internas. */
  setExteriorWear?(input: ExteriorWearInput | ExteriorVisualWear): void;
}

/** Aparência de um carro específico (vem do VehicleState, não do modelo). */
export interface CarAppearance {
  color: string;
  plate: string;
}

interface CarMaterials {
  paint: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  trim: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  headlight: THREE.MeshStandardMaterial;
  amberLight: THREE.MeshStandardMaterial;
  taillight: THREE.MeshStandardMaterial;
  caliper: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  bayDark: THREE.MeshStandardMaterial;
  castAluminum: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  valveCover: THREE.MeshStandardMaterial;
  hoseOrange: THREE.MeshStandardMaterial;
  coolantTank: THREE.MeshStandardMaterial;
  coolantCap: THREE.MeshStandardMaterial;
  yellowCap: THREE.MeshStandardMaterial;
}

function createCarMaterials(look: CarAppearance): CarMaterials {
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: look.color,
      metalness: 0.45,
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0f171c,
      metalness: 0.2,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
    trim: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.65, metalness: 0.1 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.28 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdce0e4, metalness: 0.95, roughness: 0.16 }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xf4f1e6, emissive: 0xfff6dc, emissiveIntensity: 0.35, roughness: 0.15 }),
    amberLight: new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.32, roughness: 0.2 }),
    taillight: new THREE.MeshStandardMaterial({ color: 0x8a0f0f, emissive: 0x6a0000, emissiveIntensity: 0.4, roughness: 0.2 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.4, metalness: 0.35 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTexture(look.plate), roughness: 0.45 }),
    bayDark: new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.82 }),
    castAluminum: new THREE.MeshStandardMaterial({ color: 0x8e959c, roughness: 0.42, metalness: 0.72 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x35393e, roughness: 0.5, metalness: 0.65 }),
    valveCover: new THREE.MeshStandardMaterial({ color: 0xb82e24, roughness: 0.35, metalness: 0.3 }),
    hoseOrange: new THREE.MeshStandardMaterial({ color: 0xd95f2a, roughness: 0.62 }),
    coolantTank: new THREE.MeshStandardMaterial({ color: 0xe8e4d5, roughness: 0.3, metalness: 0.05 }),
    coolantCap: new THREE.MeshStandardMaterial({ color: 0x1e56a0, roughness: 0.4 }),
    yellowCap: new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 }),
  };
}

function clearGroupGeometries(group: THREE.Group, keepGroups: ReadonlySet<THREE.Object3D>): void {
  for (const child of [...group.children]) {
    if (keepGroups.has(child)) continue;
    child.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry?.dispose();
      }
    });
    group.remove(child);
  }
}

export function buildPlaceholderCar(initialDef: VehicleDefinition, initialLook: CarAppearance): PlaceholderCar {
  const car = new THREE.Group();
  const bay = new THREE.Group();
  bay.name = 'PLACEHOLDER_compartimento_motor';
  const hoodPivot = new THREE.Group();
  hoodPivot.name = 'capo';

  const mats = createCarMaterials(initialLook);
  const keepInCar = new Set<THREE.Object3D>([bay, hoodPivot]);

  let currentModelId = '';
  let currentPlate = initialLook.plate;

  const setLook = (next: CarAppearance) => {
    mats.paint.color.set(next.color);
    if (next.plate !== currentPlate) {
      currentPlate = next.plate;
      const old = mats.plate.map;
      mats.plate.map = plateTexture(next.plate);
      mats.plate.needsUpdate = true;
      old?.dispose();
    }
  };

  const setExteriorWear = (input: ExteriorWearInput | ExteriorVisualWear) => {
    const wear = 'paintRoughness' in input ? input : computeExteriorVisualWear(input);
    mats.paint.roughness = wear.paintRoughness;
    mats.paint.clearcoatRoughness = wear.clearcoatRoughness;
    mats.paint.needsUpdate = true;
  };

  const result: PlaceholderCar = {
    group: car,
    hoodPivot,
    engineBay: bay,
    hoodClosedAngle: 0,
    setLook,
    setExteriorWear,
    setVehicle(def: VehicleDefinition, look: CarAppearance) {
      setLook(look);
      if (def.id === currentModelId) return;
      currentModelId = def.id;

      clearGroupGeometries(car, keepInCar);
      clearGroupGeometries(bay, new Set());
      clearGroupGeometries(hoodPivot, new Set());

      car.name = `PLACEHOLDER_carro_${def.id}`;
      // Preserva interactableId e demais chaves em userData.
      car.userData.placeholder = true;
      car.userData.label = `${def.manufacturer} ${def.model} (modelo temporário)`;
      car.userData.category = def.category;

      const bodyGroup = new THREE.Group();
      bodyGroup.name = 'carroceria_estatica';
      const slope = populateCarByCategory(bodyGroup, bay, hoodPivot, def, mats);
      // Une as malhas da carroceria, do cofre e do capô por material (~82 -> ~16 malhas)
      mergeStaticMeshes(bodyGroup);
      mergeStaticMeshes(bay);
      mergeStaticMeshes(hoodPivot);
      car.add(bodyGroup);

      result.hoodClosedAngle = slope;
      if (!bay.parent) car.add(bay);
      if (!hoodPivot.parent) car.add(hoodPivot);
    },
  };

  result.setVehicle(initialDef, initialLook);
  return result;
}

function populateCarByCategory(
  car: THREE.Group,
  bay: THREE.Group,
  hoodPivot: THREE.Group,
  def: VehicleDefinition,
  m: CarMaterials,
): number {
  const d = def.dimensions;
  const cat: VehicleCategory = def.category;
  const halfL = d.length / 2;
  const frontAxle = d.wheelbase / 2 + 0.02;
  const rearAxle = -d.wheelbase / 2 + 0.02;
  const archR = d.wheelRadius + 0.055;
  const wheelY = d.wheelRadius;
  const isTall = cat === 'suv' || cat === 'picape';
  const isVan = cat === 'van';
  const sill = isTall ? 0.28 : isVan ? 0.25 : 0.23;

  // --- Geometria do capô (garante intersecção limpa com AIM.hood em todas as 6 categorias) ---
  const hoodFrontY = isVan ? 0.88 : isTall ? 0.86 : cat === 'sedan' ? 0.75 : 0.73;
  const hoodRearY = isVan ? 1.08 : isTall ? 1.02 : cat === 'sedan' ? 0.9 : 0.88;
  const hingeX = isVan
    ? Math.max(0.95, halfL - 1.35)
    : Math.max(0.68, halfL - 1.35);
  const hoodEndX = halfL - 0.22;
  const hinge = new THREE.Vector2(hingeX, hoodRearY);
  const hoodEnd = new THREE.Vector2(hoodEndX, hoodFrontY);
  const hoodLen = hinge.distanceTo(hoodEnd) + 0.06;
  const slope = Math.atan2(hoodEnd.y - hinge.y, hoodEnd.x - hinge.x);
  const bayWidth = d.width * 0.86;

  // --- Perfil lateral do corpo inferior e da cabine por categoria ---
  const bevel = 0.065;
  const bodyDepth = d.width - bevel * 2;
  const cabinDepth = d.width * (isVan ? 0.9 : 0.82);

  const body = new THREE.Shape();
  body.moveTo(-halfL + 0.04, sill + 0.02);
  body.lineTo(rearAxle - archR, sill);
  body.absarc(rearAxle, wheelY, archR, Math.PI, 0, true);
  body.lineTo(frontAxle - archR, sill);
  body.absarc(frontAxle, wheelY, archR, Math.PI, 0, true);
  body.lineTo(halfL - 0.05, sill + 0.03);
  body.lineTo(halfL, sill + 0.16);
  body.lineTo(halfL - 0.02, hoodFrontY - 0.1);
  body.lineTo(hoodEnd.x, hoodEnd.y);
  body.lineTo(hinge.x, hinge.y);

  if (cat === 'picape') {
    // Picape: cabine vai até cabRearX; atrás dela o miolo desce para o piso da caçamba.
    const cabRearX = -0.18;
    body.lineTo(cabRearX, hinge.y + 0.02);
    body.lineTo(cabRearX - 0.04, 0.62);
    body.lineTo(-halfL + 0.08, 0.62);
    body.lineTo(-halfL, 0.56);
    body.lineTo(-halfL - 0.02, sill + 0.12);
  } else if (cat === 'sedan') {
    // Sedã 3 volumes: linha de cintura e porta-malas saliente atrás da cabine.
    const trunkStart = -0.78;
    body.lineTo(trunkStart, 0.93);
    body.lineTo(-halfL + 0.12, 0.87);
    body.lineTo(-halfL, 0.68);
    body.lineTo(-halfL - 0.02, sill + 0.12);
  } else if (cat === 'van') {
    // Van alta: cintura sobe até a traseira vertical.
    body.lineTo(-halfL + 0.08, 1.06);
    body.lineTo(-halfL, 0.76);
    body.lineTo(-halfL - 0.02, sill + 0.12);
  } else if (cat === 'suv') {
    // SUV robusto: cintura alta até a tampa traseira quase vertical.
    body.lineTo(-halfL + 0.14, 1.02);
    body.lineTo(-halfL, 0.74);
    body.lineTo(-halfL - 0.02, sill + 0.12);
  } else {
    // Popular e Hatch: dois volumes compactos.
    body.lineTo(-halfL + 0.18, hoodRearY + 0.01);
    body.lineTo(-halfL, 0.65);
    body.lineTo(-halfL - 0.02, sill + 0.12);
  }
  body.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(body, {
    depth: bodyDepth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: 0.045,
    bevelSegments: 4,
    curveSegments: 18,
  });
  bodyGeo.translate(0, 0, -bodyDepth / 2);
  addMesh(car, bodyGeo, m.paint, 'carroceria');

  // --- Cabine (vidros) e teto por categoria ---
  const cabin = new THREE.Shape();
  let roofStartX = 0.05;
  let roofEndX = -0.9;

  if (cat === 'picape') {
    const cabRearX = -0.18;
    roofStartX = hinge.x - 0.42;
    roofEndX = cabRearX + 0.06;
    cabin.moveTo(hinge.x + 0.02, hinge.y - 0.02);
    cabin.lineTo(roofStartX, d.height - 0.04);
    cabin.lineTo(roofEndX, d.height - 0.03);
    cabin.lineTo(cabRearX, hinge.y);
    cabin.closePath();
  } else if (cat === 'sedan') {
    const trunkStart = -0.82;
    roofStartX = hinge.x - 0.55;
    roofEndX = -0.45;
    cabin.moveTo(hinge.x + 0.02, hinge.y - 0.02);
    cabin.lineTo(roofStartX, d.height - 0.04);
    cabin.lineTo(roofEndX, d.height - 0.03);
    cabin.lineTo(trunkStart, 0.91);
    cabin.closePath();
  } else if (cat === 'van') {
    roofStartX = hinge.x - 0.48;
    roofEndX = -halfL + 0.16;
    cabin.moveTo(hinge.x + 0.02, hinge.y - 0.02);
    cabin.lineTo(roofStartX, d.height - 0.05);
    cabin.lineTo(roofEndX, d.height - 0.04);
    cabin.lineTo(-halfL + 0.08, 1.04);
    cabin.closePath();
  } else if (cat === 'suv') {
    roofStartX = hinge.x - 0.52;
    roofEndX = -halfL + 0.34;
    cabin.moveTo(hinge.x + 0.02, hinge.y - 0.02);
    cabin.lineTo(roofStartX, d.height - 0.04);
    cabin.lineTo(roofEndX, d.height - 0.03);
    cabin.lineTo(-halfL + 0.14, 1.0);
    cabin.closePath();
  } else if (cat === 'popular') {
    roofStartX = hinge.x - 0.48;
    roofEndX = -halfL + 0.32;
    cabin.moveTo(hinge.x + 0.02, hinge.y - 0.02);
    cabin.lineTo(roofStartX, d.height - 0.04);
    cabin.lineTo(roofEndX, d.height - 0.03);
    cabin.lineTo(-halfL + 0.16, hoodRearY - 0.01);
    cabin.closePath();
  } else {
    // Hatch
    roofStartX = hinge.x - 0.52;
    roofEndX = -halfL + 0.44;
    cabin.moveTo(hinge.x + 0.02, hinge.y - 0.02);
    cabin.lineTo(roofStartX, d.height - 0.04);
    cabin.lineTo(roofEndX, d.height - 0.03);
    cabin.lineTo(-halfL + 0.2, hoodRearY);
    cabin.closePath();
  }

  const cabinGeo = new THREE.ExtrudeGeometry(cabin, {
    depth: cabinDepth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 3,
  });
  cabinGeo.translate(0, 0, -cabinDepth / 2);
  addMesh(car, cabinGeo, m.glass, 'vidros');

  // Teto pintado por cima dos vidros.
  const roofLen = Math.max(0.45, roofStartX - roofEndX + 0.08);
  const roofCenterX = (roofStartX + roofEndX) / 2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.055, cabinDepth + 0.02), m.paint);
  roof.position.set(roofCenterX, d.height - 0.005, 0);
  roof.castShadow = true;
  car.add(roof);

  // Colunas laterais (escuras) dos dois lados.
  const pillarH = Math.max(0.36, d.height - hinge.y - 0.08);
  const pillarY = hinge.y + pillarH / 2 + 0.02;
  const pillarPositions =
    cat === 'van'
      ? [0.35, -0.45, -1.35, -halfL + 0.22]
      : cat === 'suv'
        ? [-0.15, -1.05]
        : [cat === 'picape' ? -0.18 : -0.25];
  const pillarGeo = new THREE.BoxGeometry(0.09, pillarH, 0.022);
  for (const px of pillarPositions) {
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, m.trim);
      pillar.position.set(px, pillarY, side * (cabinDepth / 2 + 0.045));
      car.add(pillar);
    }
  }

  // --- Elementos exclusivos de cada categoria ---
  if (cat === 'picape') {
    const cabRearX = -0.18;
    const bedLen = cabRearX - (-halfL + 0.06);
    const bedCenterX = (cabRearX + (-halfL + 0.06)) / 2;
    const wallH = 0.42;
    const wallY = 0.6 + wallH / 2;
    const wallT = 0.11;
    // Laterais pintadas da caçamba + borda superior preta
    for (const side of [-1, 1]) {
      const wz = side * (d.width / 2 - wallT / 2 - 0.01);
      addMesh(car, new THREE.BoxGeometry(bedLen, wallH, wallT), m.paint, 'lateral_cacamba').position.set(bedCenterX, wallY, wz);
      const railCap = new THREE.Mesh(new THREE.BoxGeometry(bedLen + 0.02, 0.03, wallT + 0.015), m.trim);
      railCap.position.set(bedCenterX, 0.6 + wallH + 0.01, wz);
      car.add(railCap);
    }
    // Tampa traseira da caçamba (tailgate)
    const tailgate = addMesh(car, new THREE.BoxGeometry(0.09, wallH, d.width - 0.04), m.paint, 'tampa_cacamba');
    tailgate.position.set(-halfL + 0.06, wallY, 0);
    // Revestimento interno escuro (protetor de caçamba canelado)
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(bedLen - 0.06, 0.03, d.width - wallT * 2 - 0.04), m.trim);
    bedFloor.position.set(bedCenterX, 0.63, 0);
    car.add(bedFloor);
    // Santo-antônio metálico atrás da cabine
    const rollBarY = 0.6 + wallH + 0.26;
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, d.width - 0.18, 10), m.darkMetal);
    topBar.rotation.x = Math.PI / 2;
    topBar.position.set(cabRearX - 0.08, rollBarY + 0.22, 0);
    car.add(topBar);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10), m.darkMetal);
      post.position.set(cabRearX - 0.08, rollBarY, side * (d.width / 2 - 0.12));
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.62, 10), m.darkMetal);
      brace.rotation.z = 0.68;
      brace.position.set(cabRearX - 0.3, rollBarY - 0.02, side * (d.width / 2 - 0.12));
      car.add(post, brace);
    }
  } else if (cat === 'van') {
    // Faixa escolar/turismo amarela nas laterais e painel lateral pintado sob as janelas
    const sidePanelLen = d.length - 1.35;
    const sidePanelX = -0.35;
    const stripeMat = m.yellowCap;
    for (const side of [-1, 1]) {
      const sz = side * (d.width / 2 + 0.006);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(sidePanelLen, 0.14, 0.015), stripeMat);
      stripe.position.set(sidePanelX, 0.94, sz);
      const track = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.025, 0.02), m.trim);
      track.position.set(-0.25, 1.08, sz);
      car.add(stripe, track);
    }
    // Climatizador de teto da van
    const acUnit = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.85), m.coolantTank);
    acUnit.position.set(-0.6, d.height + 0.06, 0);
    car.add(acUnit);
  } else if (cat === 'suv') {
    // Racks de teto longitudinais, estribos laterais e estepe na tampa traseira
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(roofLen * 0.88, 0.045, 0.04), m.chrome);
      rail.position.set(roofCenterX, d.height + 0.04, side * (cabinDepth / 2 - 0.08));
      const step = new THREE.Mesh(new THREE.BoxGeometry(d.wheelbase - archR * 2.1, 0.045, 0.11), m.trim);
      step.position.set(0.02, sill - 0.02, side * (d.width / 2 + 0.03));
      car.add(rail, step);
    }
    const spareTire = new THREE.Mesh(new THREE.CylinderGeometry(d.wheelRadius * 0.95, d.wheelRadius * 0.95, 0.22, 22), m.trim);
    spareTire.rotation.z = Math.PI / 2;
    spareTire.position.set(-halfL - 0.1, 0.92, 0);
    const spareCap = new THREE.Mesh(new THREE.CylinderGeometry(d.wheelRadius * 0.68, d.wheelRadius * 0.68, 0.23, 20), m.paint);
    spareCap.rotation.z = Math.PI / 2;
    spareCap.position.set(-halfL - 0.1, 0.92, 0);
    car.add(spareTire, spareCap);
  } else if (cat === 'hatch') {
    // Aerofólio esportivo no topo da tampa traseira
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, cabinDepth + 0.04), m.paint);
    spoiler.position.set(roofEndX - 0.06, d.height + 0.01, 0);
    spoiler.rotation.z = 0.12;
    car.add(spoiler);
  } else if (cat === 'sedan') {
    // Friso cromado na tampa do porta-malas
    const garnish = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, d.width * 0.56), m.chrome);
    garnish.position.set(-halfL - 0.015, 0.78, 0);
    car.add(garnish);
  }

  // --- Para-choques, grade, faróis, lanternas, frisos ---
  const bumperH = isTall ? 0.24 : 0.2;
  const bumperY = sill + 0.12;
  const bumperMat = cat === 'popular' || isTall ? m.trim : m.paint;
  const bumperGeo = new THREE.BoxGeometry(0.16, bumperH, d.width * 0.98);
  const frontBumper = new THREE.Mesh(bumperGeo, bumperMat);
  frontBumper.position.set(halfL - 0.02, bumperY, 0);
  const frontInsert = new THREE.Mesh(new THREE.BoxGeometry(0.17, bumperH * 0.45, d.width * 0.99), m.trim);
  frontInsert.position.set(halfL - 0.02, bumperY - 0.02, 0);
  const rearBumper = new THREE.Mesh(bumperGeo, bumperMat);
  rearBumper.position.set(-halfL, bumperY + 0.02, 0);
  car.add(frontBumper, frontInsert, rearBumper);

  // Grade frontal aletada com emblema cromado fictício.
  const grilleY = hoodFrontY - 0.16;
  const grilleH = isTall || isVan ? 0.18 : 0.13;
  const grilleW = d.width * 0.44;
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, grilleH, grilleW), m.trim);
  grille.position.set(halfL + 0.005, grilleY, 0);
  car.add(grille);
  for (const dy of [-grilleH * 0.26, 0, grilleH * 0.26]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, grilleW - 0.04), m.chrome);
    slat.position.set(halfL + 0.032, grilleY + dy, 0);
    car.add(slat);
  }
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.016, 12), m.chrome);
  badge.rotation.z = Math.PI / 2;
  badge.position.set(halfL + 0.036, grilleY, 0);
  car.add(badge);

  const headY = grilleY + 0.03;
  const tailY = cat === 'picape' ? 0.78 : isTall || isVan ? 0.82 : 0.7;
  const headGeo = new THREE.BoxGeometry(0.06, 0.12, 0.26);
  const blinkerGeo = new THREE.BoxGeometry(0.058, 0.118, 0.085);
  const tailGeo = new THREE.BoxGeometry(0.06, cat === 'picape' || isVan ? 0.22 : 0.13, cat === 'picape' ? 0.14 : 0.32);
  const sideStripGeo = new THREE.BoxGeometry(d.wheelbase - archR * 2.1, 0.04, 0.022);
  const handleGeo = new THREE.BoxGeometry(0.14, 0.032, 0.024);

  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(headGeo, m.headlight);
    head.position.set(halfL - 0.03, headY, side * (d.width / 2 - 0.3));
    car.add(head);
    const blinker = new THREE.Mesh(blinkerGeo, m.amberLight);
    blinker.position.set(halfL - 0.032, headY, side * (d.width / 2 - 0.125));
    car.add(blinker);
    const tail = new THREE.Mesh(tailGeo, m.taillight);
    tail.position.set(-halfL - 0.03, tailY, side * (d.width / 2 - (cat === 'picape' ? 0.12 : 0.24)));
    car.add(tail);
    // Retrovisor
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, isVan || isTall ? 0.14 : 0.1, 0.12), cat === 'popular' ? m.trim : m.paint);
    mirror.position.set(hinge.x - 0.14, hinge.y + 0.08, side * (d.width / 2 + 0.06));
    car.add(mirror);
    // Friso protetor lateral e maçaneta
    const strip = new THREE.Mesh(sideStripGeo, m.trim);
    strip.position.set(0.02, sill + 0.26, side * (d.width / 2 + 0.005));
    car.add(strip);
    const handle = new THREE.Mesh(handleGeo, m.trim);
    handle.position.set(hinge.x - 0.85, hinge.y - 0.1, side * (d.width / 2 + 0.006));
    car.add(handle);
  }

  // Limpadores de para-brisa
  for (const zOff of [-0.26, 0.18]) {
    const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 0.42), m.trim);
    wiper.position.set(hinge.x - 0.03, hinge.y + 0.015, zOff);
    wiper.rotation.y = 0.15;
    car.add(wiper);
  }

  // Ponteira do escapamento traseiro
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.24, 12), m.chrome);
  exhaust.rotation.z = Math.PI / 2;
  exhaust.position.set(-halfL - 0.02, sill - 0.01, -d.width * 0.28);
  car.add(exhaust);

  // Placas (Mercosul/Rio fictícias).
  const plateGeo = new THREE.PlaneGeometry(0.4, 0.13);
  const frontPlate = new THREE.Mesh(plateGeo, m.plate);
  frontPlate.position.set(halfL + 0.07, bumperY, 0);
  frontPlate.rotation.y = Math.PI / 2;
  car.add(frontPlate);
  const rearPlate = new THREE.Mesh(plateGeo, m.plate);
  rearPlate.position.set(-halfL - 0.085, bumperY + 0.04, 0);
  rearPlate.rotation.y = -Math.PI / 2;
  car.add(rearPlate);

  // --- Rodas, discos e pinças de freio ---
  const tireWidth = isTall ? 0.24 : 0.2;
  const tireGeo = new THREE.CylinderGeometry(d.wheelRadius, d.wheelRadius, tireWidth, 28);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(d.wheelRadius * 0.62, d.wheelRadius * 0.62, tireWidth + 0.012, 20);
  rimGeo.rotateX(Math.PI / 2);
  const brakeDiscGeo = new THREE.CylinderGeometry(d.wheelRadius * 0.46, d.wheelRadius * 0.46, 0.03, 18);
  brakeDiscGeo.rotateX(Math.PI / 2);
  const caliperGeo = new THREE.BoxGeometry(0.09, 0.12, 0.06);
  const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, tireWidth + 0.03, 10);
  hubGeo.rotateX(Math.PI / 2);
  for (const x of [frontAxle, rearAxle]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.name = 'roda';
      wheel.position.set(x, wheelY, side * (d.track / 2));
      const tire = new THREE.Mesh(tireGeo, m.rubber);
      tire.castShadow = true;
      const disc = new THREE.Mesh(brakeDiscGeo, m.chrome);
      disc.position.z = -side * 0.04;
      const caliper = new THREE.Mesh(caliperGeo, m.caliper);
      caliper.position.set(-0.08, 0.04, -side * 0.04);
      wheel.add(tire, new THREE.Mesh(rimGeo, m.rim), disc, caliper, new THREE.Mesh(hubGeo, m.trim));
      car.add(wheel);
    }
  }

  // Assoalho escuro e interior visível (painel, volante e bancos — Prompt 22 Parte A).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(d.length * 0.92, 0.05, d.width * 0.9), m.trim);
  floor.position.y = sill + 0.02;
  car.add(floor);

  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, cabinDepth * 0.88), m.bayDark);
  dash.position.set(hinge.x - 0.18, hinge.y - 0.08, 0);
  const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 14), m.trim);
  steeringWheel.rotation.y = Math.PI / 2 - 0.35;
  steeringWheel.position.set(hinge.x - 0.36, hinge.y - 0.02, -cabinDepth * 0.24);
  car.add(dash, steeringWheel);
  for (const side of [-1, 1]) {
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), m.bayDark);
    seatBase.position.set(hinge.x - 0.65, sill + 0.24, side * (cabinDepth * 0.24));
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.4), m.bayDark);
    seatBack.position.set(hinge.x - 0.84, sill + 0.5, side * (cabinDepth * 0.24));
    car.add(seatBase, seatBack);
  }

  // --- Capô e compartimento do motor (Direção Híbrida A+B: peças legíveis + PBR) ---
  bay.position.set(hinge.x, hinge.y, 0);
  bay.rotation.z = slope;

  const bayFloor = new THREE.Mesh(new THREE.BoxGeometry(hoodLen, 0.015, bayWidth), m.bayDark);
  bayFloor.position.set(hoodLen / 2, -0.01, 0);
  bay.add(bayFloor);

  // 1. Bloco transversal, cabeçote, tampa de válvulas e 4 bobinas/cabos de vela
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.54), m.castAluminum);
  engineBlock.position.set(hoodLen * 0.42, 0.032, -0.04);
  const valveCover = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.036, 0.48), m.valveCover);
  valveCover.position.set(hoodLen * 0.4, 0.085, -0.04);
  const oilCap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), m.trim);
  oilCap.position.set(hoodLen * 0.4, 0.11, -0.2);
  bay.add(engineBlock, valveCover, oilCap);

  for (let i = 0; i < 4; i++) {
    const zPos = -0.2 + i * 0.11;
    const runner = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 10), m.castAluminum);
    runner.rotation.z = Math.PI / 2;
    runner.position.set(hoodLen * 0.54, 0.06, zPos);
    const sparkBoot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 10), m.trim);
    sparkBoot.position.set(hoodLen * 0.4, 0.108, zPos + 0.03);
    bay.add(runner, sparkBoot);
  }

  // 2. Alternador + polia e correia de acessórios
  const alternator = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.11, 14), m.castAluminum);
  alternator.rotation.x = Math.PI / 2;
  alternator.position.set(hoodLen * 0.5, 0.045, -0.38);
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.025, 14), m.darkMetal);
  pulley.rotation.x = Math.PI / 2;
  pulley.position.set(hoodLen * 0.5, 0.045, -0.45);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.018), m.rubber);
  belt.position.set(hoodLen * 0.45, 0.04, -0.45);
  bay.add(alternator, pulley, belt);

  // 3. Caixa do filtro de ar e duto de admissão
  const airFilterBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.22), m.trim);
  airFilterBox.position.set(hoodLen * 0.22, 0.04, -0.22);
  const intakeDuct = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 12), m.rubber);
  intakeDuct.rotation.x = Math.PI / 2;
  intakeDuct.position.set(hoodLen * 0.24, 0.065, -0.04);
  bay.add(airFilterBox, intakeDuct);

  // 4. Bateria 12V com polos positivo (vermelho) e negativo (chumbo)
  const batX = hoodLen * 0.5;
  const batZ = bayWidth / 2 - 0.18;
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.085, 0.17), m.trim);
  battery.position.set(batX, 0.042, batZ);
  const posPost = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.035), m.valveCover);
  posPost.position.set(batX + 0.06, 0.092, batZ - 0.045);
  const negPost = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.035), m.chrome);
  negPost.position.set(batX - 0.06, 0.092, batZ - 0.045);
  bay.add(battery, posPost, negPost);

  // 5. Radiador frontal, tampa de pressão e mangueiras de arrefecimento
  const radiatorX = hoodLen - 0.11;
  const radiatorCore = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, bayWidth * 0.62), m.castAluminum);
  radiatorCore.position.set(radiatorX, 0.042, 0);
  const radiatorTop = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, bayWidth * 0.64), m.trim);
  radiatorTop.position.set(radiatorX, 0.092, 0);
  const radCap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.018, 12), m.chrome);
  radCap.position.set(radiatorX, 0.11, -0.18);
  const upperHose = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.28, 10), m.hoseOrange);
  upperHose.rotation.z = Math.PI / 2;
  upperHose.rotation.y = 0.25;
  upperHose.position.set(hoodLen * 0.64, 0.075, 0.18);
  bay.add(radiatorCore, radiatorTop, radCap, upperHose);

  // 6. Reservatório de expansão e fluido de freio
  const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.075, 16), m.coolantTank);
  reservoir.position.set(hoodLen * 0.3, 0.04, -bayWidth / 2 + 0.16);
  const reservoirCap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.018, 12), m.coolantCap);
  reservoirCap.position.set(hoodLen * 0.3, 0.085, -bayWidth / 2 + 0.16);
  const brakeRes = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.065, 0.09), m.coolantTank);
  brakeRes.position.set(hoodLen * 0.17, 0.045, bayWidth / 2 - 0.2);
  const brakeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.016, 12), m.yellowCap);
  brakeCap.position.set(hoodLen * 0.17, 0.085, bayWidth / 2 - 0.2);
  bay.add(reservoir, reservoirCap, brakeRes, brakeCap);

  // Capô articulado + haste metálica de sustentação (Prompt 22)
  hoodPivot.position.set(hinge.x, hinge.y, 0);
  hoodPivot.rotation.z = slope;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(hoodLen, 0.025, bayWidth + 0.06), m.paint);
  hood.position.set(hoodLen / 2, 0.075, 0);
  hood.castShadow = true;
  hood.receiveShadow = true;
  const hoodLiner = new THREE.Mesh(new THREE.BoxGeometry(hoodLen * 0.78, 0.008, bayWidth * 0.82), m.bayDark);
  hoodLiner.position.set(hoodLen / 2, 0.06, 0);
  const hoodPropRod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, hoodLen * 0.55, 6), m.chrome);
  hoodPropRod.rotation.z = Math.PI / 2;
  hoodPropRod.position.set(hoodLen * 0.48, 0.048, bayWidth * 0.36);
  hoodPivot.add(hood, hoodLiner, hoodPropRod);

  return slope;
}

function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
