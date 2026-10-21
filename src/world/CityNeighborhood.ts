import * as THREE from 'three';
import { cityColliders } from '../city/rules';
import type { CityLocationDef, CityLocationId, CityNeighborhoodDef, CityWorldState } from '../city/types';
import { tagInteractable } from '../interaction/resolveTarget';
import { createInteractable, type Interactable } from '../interaction/types';
import { asphaltRoadTexture, portugueseStoneTexture } from '../utils/canvasTextures';
import { mergeStaticMeshes } from '../utils/mergeStatic';
import { buildCariocaStreetAmbience } from './city/streetLife';
import type { Box2D } from './collision';

/**
 * Cena 3D do Bairro de São Cristóvão — Rua das Oficinas (GDD §7, Prompts 14 e 21).
 * Carregada sob demanda (`import()`) na primeira saída para a rua.
 * Inclui os 5 locais da carreira, calçada de pedra portuguesa, sobrados cariocas,
 * marcadores 3D, trânsito, pedestres, cachorro caramelo, hora do dia e chuva.
 */
export interface CityNeighborhood {
  root: THREE.Group;
  colliders: Box2D[];
  raycastTargets: THREE.Object3D[];
  loadedLocations: ReadonlySet<CityLocationId>;
  createInteractables(onVisit: (id: CityLocationId) => void): Interactable[];
  ensureLocationLoaded(id: CityLocationId): Promise<void>;
  syncWorldState(state: CityWorldState, reduceMotion: boolean): void;
  setTimeOfDay?(minuteOfDay: number): void;
  setRain?(raining: boolean): void;
  dispose(): void;
}

/** Letreiro pintado em canvas para a fachada de cada estabelecimento. */
function makeFacadeSignTexture(loc: CityLocationDef): THREE.CanvasTexture {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    const tex = new THREE.CanvasTexture({ width: 512, height: 128 } as unknown as HTMLCanvasElement);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  ctx.fillStyle = loc.accentColor;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(loc.name.toUpperCase(), 256, 56);

  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText(loc.subtitle.toUpperCase(), 256, 94);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCityNeighborhood(def: CityNeighborhoodDef): CityNeighborhood {
  const root = new THREE.Group();
  root.name = 'PLACEHOLDER_bairro_sao_cristovao';
  root.userData.placeholder = true;

  const disposables: Array<{ dispose(): void }> = [];
  const registerDisposable = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const mat = (params: THREE.MeshStandardMaterialParameters) => registerDisposable(new THREE.MeshStandardMaterial(params));
  const geo = <T extends THREE.BufferGeometry>(g: T) => registerDisposable(g);

  // Iluminação carioca de fim de tarde (Direção Híbrida A+B)
  const hemi = new THREE.HemisphereLight(0xffedd5, 0x57534e, 1.55);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d1, 2.05);
  sun.position.set(18, 28, 12);
  root.add(sun);

  const { halfX, halfZ } = def;
  const width = halfX * 2;
  const depth = halfZ * 2;

  const roadAndSidewalkGroup = new THREE.Group();
  roadAndSidewalkGroup.name = 'calcada_e_asfalto_estatico';
  root.add(roadAndSidewalkGroup);

  // Base de calçada de pedra portuguesa tradicional do Rio
  const stoneTex = registerDisposable(portugueseStoneTexture(512, 163));
  const sidewalkMat = mat({ map: stoneTex, color: 0xffffff, roughness: 0.84 });
  const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(width + 8, depth + 8)), sidewalkMat);
  ground.rotation.x = -Math.PI / 2;
  roadAndSidewalkGroup.add(ground);

  // Leito de asfalto da Rua das Oficinas (z = -4.2 a +4.2)
  const roadTex = registerDisposable(asphaltRoadTexture(512, 149));
  const asphaltMat = mat({ map: roadTex, color: 0xffffff, roughness: 0.85, metalness: 0.05 });
  const road = new THREE.Mesh(geo(new THREE.PlaneGeometry(width + 4, 8.4)), asphaltMat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  roadAndSidewalkGroup.add(road);

  // Meio-fio norte e sul
  const curbMat = mat({ color: 0x9ca3af, roughness: 0.8 });
  for (const cz of [-4.3, 4.3]) {
    const curb = new THREE.Mesh(geo(new THREE.BoxGeometry(width + 2, 0.16, 0.25)), curbMat);
    curb.position.set(0, 0.08, cz);
    roadAndSidewalkGroup.add(curb);
  }

  // Faixa dupla amarela divisória e faixa de pedestres central
  const yellowPaint = mat({ color: 0xfacc15, roughness: 0.55 });
  const whitePaint = mat({ color: 0xf8fafc, roughness: 0.55 });
  for (let x = -halfX + 2; x <= halfX - 2; x += 4.5) {
    if (Math.abs(x) < 4) continue;
    const dash = new THREE.Mesh(geo(new THREE.PlaneGeometry(2.2, 0.16)), yellowPaint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.02, 0);
    roadAndSidewalkGroup.add(dash);
  }
  for (let z = -3.4; z <= 3.4; z += 0.85) {
    const zebra = new THREE.Mesh(geo(new THREE.PlaneGeometry(3.8, 0.42)), whitePaint);
    zebra.rotation.x = -Math.PI / 2;
    zebra.position.set(0, 0.022, z);
    roadAndSidewalkGroup.add(zebra);
  }
  // Une todas as faixas da rua, meio-fios, calçada e asfalto por material (26 malhas -> 5 malhas)
  mergeStaticMeshes(roadAndSidewalkGroup);

  // Prédios dos 5 locais necessários à carreira + portas interativas + marcadores 3D
  const raycastTargets: THREE.Object3D[] = [];
  const markerBeacons: THREE.Mesh[] = [];
  const doorFrameMat = mat({ color: 0x1e293b, roughness: 0.5, metalness: 0.4 });
  const glassDoorMat = mat({ color: 0x38bdf8, roughness: 0.18, metalness: 0.25, emissive: 0x0c4a6e, emissiveIntensity: 0.25 });

  for (const loc of def.locations) {
    const b = loc.building;
    const locGroup = new THREE.Group();
    locGroup.name = `PLACEHOLDER_predio_${loc.id}`;
    locGroup.userData.placeholder = true;
    locGroup.userData.locationId = loc.id;

    // Volume principal do prédio
    const wallMat = mat({ color: loc.wallColor, roughness: 0.84 });
    const accentMat = mat({ color: loc.accentColor, roughness: 0.55, metalness: 0.15 });
    const buildingMesh = new THREE.Mesh(geo(new THREE.BoxGeometry(b.width, b.height, b.depth)), wallMat);
    buildingMesh.position.set(b.x, b.height / 2, b.z);
    locGroup.add(buildingMesh);

    // Platibanda/friso superior na cor do estabelecimento
    const cornice = new THREE.Mesh(geo(new THREE.BoxGeometry(b.width + 0.16, 0.55, b.depth + 0.16)), accentMat);
    cornice.position.set(b.x, b.height - 0.25, b.z);
    locGroup.add(cornice);

    // Face voltada para a rua (norte olha para +Z; sul olha para -Z)
    const frontSign = b.z > 0 ? -1 : 1;
    const frontZ = b.z + frontSign * (b.depth / 2 + 0.03);

    // Letreiro pintado na fachada
    const signTex = registerDisposable(makeFacadeSignTexture(loc));
    const signMat = mat({ map: signTex, roughness: 0.45 });
    const signMesh = new THREE.Mesh(geo(new THREE.PlaneGeometry(Math.min(6.4, b.width * 0.82), 1.45)), signMat);
    signMesh.position.set(b.x, b.height - 1.35, frontZ);
    if (frontSign < 0) signMesh.rotation.y = Math.PI;
    locGroup.add(signMesh);

    // Toldo sobre a porta
    const awning = new THREE.Mesh(geo(new THREE.BoxGeometry(3.2, 0.22, 1.1)), accentMat);
    awning.position.set(loc.entrance.x, 2.65, frontZ + frontSign * 0.5);
    locGroup.add(awning);

    // Porta/entrada interativa (alvo do raycast)
    const doorGroup = new THREE.Group();
    const frame = new THREE.Mesh(geo(new THREE.BoxGeometry(2.1, 2.4, 0.28)), doorFrameMat);
    frame.position.set(loc.entrance.x, 1.2, frontZ + frontSign * 0.08);
    const glass = new THREE.Mesh(geo(new THREE.BoxGeometry(1.75, 2.15, 0.32)), glassDoorMat);
    glass.position.set(loc.entrance.x, 1.15, frontZ + frontSign * 0.1);
    // Tapete/piso de entrada até o ponto `loc.entrance` para facilitar a mira de perto
    const matPad = new THREE.Mesh(geo(new THREE.BoxGeometry(2.2, 0.08, 1.6)), accentMat);
    matPad.position.set(loc.entrance.x, 0.04, loc.entrance.z);
    doorGroup.add(frame, glass, matPad);
    mergeStaticMeshes(doorGroup);
    tagInteractable(doorGroup, `local:${loc.id}`);
    raycastTargets.push(doorGroup);
    mergeStaticMeshes(locGroup);
    locGroup.add(doorGroup);

    // Marcador 3D flutuante acima da entrada (GDD Prompt 14: "Use marcadores no mapa e interações claras")
    const beaconMat = mat({
      color: loc.accentColor,
      emissive: loc.accentColor,
      emissiveIntensity: 0.55,
      roughness: 0.25,
    });
    const beacon = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.38, 0)), beaconMat);
    beacon.position.set(loc.entrance.x, 3.45, loc.entrance.z);
    beacon.userData.baseY = 3.45;
    markerBeacons.push(beacon);
    locGroup.add(beacon);

    root.add(locGroup);
  }

  // Postes de luz da rua (instancing para economizar draw calls)
  const polePosts = [
    [-18, -4.6],
    [-6, -4.6],
    [6, -4.6],
    [18, -4.6],
    [-18, 4.6],
    [-6, 4.6],
    [6, 4.6],
    [18, 4.6],
  ] as const;
  const poles = new THREE.InstancedMesh(
    geo(new THREE.CylinderGeometry(0.08, 0.11, 4.4, 8)),
    mat({ color: 0x3f3f46, roughness: 0.6, metalness: 0.6 }),
    polePosts.length,
  );
  const m4 = new THREE.Matrix4();
  polePosts.forEach(([px, pz], i) => poles.setMatrixAt(i, m4.makeTranslation(px, 2.2, pz)));
  root.add(poles);

  // Veículos de trânsito controlado (assets temporários identificados com PLACEHOLDER_)
  const trafficMeshes = new Map<string, THREE.Group>();
  const wheelGeo = geo(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12));
  const tireMat = mat({ color: 0x18181b, roughness: 0.92 });
  const cabinGlassMat = mat({ color: 0x1e293b, roughness: 0.2, metalness: 0.2 });

  for (const lane of def.trafficLanes) {
    const carGroup = new THREE.Group();
    carGroup.name = `PLACEHOLDER_transito_${lane.id}`;
    carGroup.userData.placeholder = true;
    carGroup.userData.label = lane.label;

    const bodyMat = mat({ color: lane.color, roughness: 0.42, metalness: 0.3 });
    const hull = new THREE.Mesh(geo(new THREE.BoxGeometry(3.9, 0.68, 1.68)), bodyMat);
    hull.position.y = 0.56;
    const cabin = new THREE.Mesh(geo(new THREE.BoxGeometry(2.1, 0.56, 1.48)), cabinGlassMat);
    cabin.position.set(-0.15 * lane.direction, 1.12, 0);
    carGroup.add(hull, cabin);

    for (const [wx, wz] of [
      [-1.2, -0.78],
      [1.2, -0.78],
      [-1.2, 0.78],
      [1.2, 0.78],
    ] as const) {
      const w = new THREE.Mesh(wheelGeo, tireMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.3, wz);
      carGroup.add(w);
    }
    mergeStaticMeshes(carGroup);

    carGroup.position.set(lane.startX, 0, lane.z);
    trafficMeshes.set(lane.id, carGroup);
    root.add(carGroup);
  }

  // Pedestres controlados na calçada (assets temporários identificados com PLACEHOLDER_)
  const pedestrianMeshes = new Map<string, THREE.Group>();
  const headGeo = geo(new THREE.SphereGeometry(0.2, 10, 10));
  const torsoGeo = geo(new THREE.CylinderGeometry(0.22, 0.25, 0.78, 10));
  const legsGeo = geo(new THREE.CylinderGeometry(0.18, 0.16, 0.72, 10));
  const skinMat = mat({ color: 0xd6a17c, roughness: 0.75 });
  const pantsMat = mat({ color: 0x27272a, roughness: 0.85 });

  for (const ped of def.pedestrians) {
    const pedGroup = new THREE.Group();
    pedGroup.name = `PLACEHOLDER_pedestre_${ped.id}`;
    pedGroup.userData.placeholder = true;
    pedGroup.userData.label = `${ped.name} (NPC temporário)`;

    const shirtMat = mat({ color: ped.shirtColor, roughness: 0.7 });
    const legs = new THREE.Mesh(legsGeo, pantsMat);
    legs.position.y = 0.36;
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 1.1;
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.66;
    pedGroup.add(legs, torso, head);
    mergeStaticMeshes(pedGroup);
    pedGroup.position.set(ped.startX, 0, ped.z);
    pedestrianMeshes.set(ped.id, pedGroup);
    root.add(pedGroup);
  }

  // Ambiência viva de São Cristóvão (Prompt 21: sobrados, amendoeiras, fiação, cachorro caramelo, pombos, hora/clima)
  const ambience = buildCariocaStreetAmbience(root, halfX, halfZ, sun, hemi, asphaltMat, registerDisposable);

  // Carregamento sob demanda (`import()`) dos detalhes 3D de cada local visitado
  const loadedLocations = new Set<CityLocationId>();
  const detailContainer = new THREE.Group();
  detailContainer.name = 'detalhes_locais_sob_demanda';
  root.add(detailContainer);

  async function ensureLocationLoaded(id: CityLocationId): Promise<void> {
    if (loadedLocations.has(id)) return;
    const loc = def.locations.find((l) => l.id === id);
    if (!loc) return;
    const { buildLocationDetailGroup } = await import('./CityLocationDetails');
    if (loadedLocations.has(id)) return;
    loadedLocations.add(id);
    detailContainer.add(buildLocationDetailGroup(loc, registerDisposable));
  }

  function createInteractables(onVisit: (id: CityLocationId) => void): Interactable[] {
    return def.locations.map((loc) =>
      createInteractable({
        id: `local:${loc.id}`,
        name: loc.name,
        evaluate: () => ({
          status: 'available',
          action: loc.actionLabel,
          detail: loc.subtitle,
        }),
        perform: () => {
          onVisit(loc.id);
          return '';
        },
      }),
    );
  }

  function syncWorldState(state: CityWorldState, reduceMotion: boolean): void {
    for (const car of state.traffic) {
      const m = trafficMeshes.get(car.id);
      if (m) m.position.set(car.x, 0, car.z);
    }
    for (const ped of state.pedestrians) {
      const m = pedestrianMeshes.get(ped.id);
      if (m) {
        const bob = !reduceMotion && !ped.pausedForPlayer ? Math.abs(Math.sin(state.time * 6 + ped.x)) * 0.04 : 0;
        m.position.set(ped.x, bob, ped.z);
      }
    }
    markerBeacons.forEach((b, i) => {
      const baseY = (b.userData.baseY as number) ?? 3.45;
      if (reduceMotion) {
        b.position.y = baseY;
      } else {
        b.position.y = baseY + Math.sin(state.time * 2.6 + i) * 0.12;
        b.rotation.y = state.time * 1.2 + i * 0.5;
      }
    });
    ambience.updateAnim(state.time, reduceMotion);
  }

  return {
    root,
    colliders: cityColliders(def),
    raycastTargets,
    loadedLocations,
    createInteractables,
    ensureLocationLoaded,
    syncWorldState,
    setTimeOfDay: ambience.setTimeOfDay,
    setRain: ambience.setRain,
    dispose: () => {
      for (const d of disposables) d.dispose();
      poles.dispose();
    },
  };
}
