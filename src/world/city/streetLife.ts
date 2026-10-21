import * as THREE from 'three';
import { lightingAtMinute } from '../../data/lighting';
import { mergeStaticMeshes } from '../../utils/mergeStatic';

/**
 * Arquitetura carioca e vida de rua de São Cristóvão (Prompt 21 — Direção Híbrida A+B):
 * - Sobrados com sacadas, ar-condicionado de janela, caixas d'água azuis, amendoeiras,
 *   bueiros e morros ao fundo (tudo unido via `mergeStaticMeshes` para manter draw calls baixos);
 * - Cachorro caramelo carioca, pombos na calçada e barraca de ambulante;
 * - Ciclo de hora do dia (`setTimeOfDay`) e clima chuvoso (`setRain` com asfalto molhado).
 */

export interface CariocaStreetAmbience {
  staticGroup: THREE.Group;
  dynamicGroup: THREE.Group;
  streetLightBulbs: THREE.MeshStandardMaterial;
  setTimeOfDay(minuteOfDay: number): void;
  setRain(raining: boolean): void;
  updateAnim(timeSec: number, reduceMotion: boolean): void;
}

export function buildCariocaStreetAmbience(
  root: THREE.Group,
  halfX: number,
  _halfZ: number,
  sun: THREE.DirectionalLight,
  hemi: THREE.HemisphereLight,
  asphaltMat: THREE.MeshStandardMaterial,
  registerDisposable: <T extends { dispose(): void }>(item: T) => T,
): CariocaStreetAmbience {
  const mat = (params: THREE.MeshStandardMaterialParameters) => registerDisposable(new THREE.MeshStandardMaterial(params));
  const geo = <T extends THREE.BufferGeometry>(g: T) => registerDisposable(g);

  const staticGroup = new THREE.Group();
  staticGroup.name = 'arquitetura_carioca_estatica';
  root.add(staticGroup);

  const ironMat = mat({ color: 0x1f2428, roughness: 0.55, metalness: 0.7 });
  const acBoxMat = mat({ color: 0xd6d3c9, roughness: 0.65, metalness: 0.2 });
  const waterTankMat = mat({ color: 0x1d63b8, roughness: 0.45, metalness: 0.1 });
  const trunkMat = mat({ color: 0x5c432d, roughness: 0.9 });
  const canopyMat = mat({ color: 0x437a3b, roughness: 0.85 });
  const hillMat = mat({ color: 0x526b65, roughness: 0.95 });
  const streetLightBulbs = mat({
    color: 0xfff3c4,
    emissive: 0xffb703,
    emissiveIntensity: 0.25,
    roughness: 0.3,
  });

  // 1. Bueiros metálicos no meio-fio, sacadas de sobrados, aparelhos de ar-condicionado e caixas d'água
  const grateGeo = geo(new THREE.BoxGeometry(0.9, 0.02, 0.45));
  for (const gx of [-20, -8, 8, 20]) {
    for (const gz of [-4.0, 4.0]) {
      const grate = new THREE.Mesh(grateGeo, ironMat);
      grate.position.set(gx, 0.02, gz);
      staticGroup.add(grate);
    }
  }

  // Sacadas de ferro, aparelhos de AC e caixas d'água nos telhados dos prédios
  const balconyGeo = geo(new THREE.BoxGeometry(2.4, 0.95, 0.55));
  const acGeo = geo(new THREE.BoxGeometry(0.65, 0.45, 0.45));
  const tankGeo = geo(new THREE.CylinderGeometry(0.75, 0.68, 0.95, 10));
  for (const [bx, bz, bh, sign] of [
    [-22, -13, 8.2, 1],
    [-4, -13.5, 7.6, 1],
    [16, -13, 6.8, 1],
    [-16, 13.5, 9.0, -1],
    [4, 13.5, 7.4, -1],
    [21, 13, 8.0, -1],
  ] as const) {
    const balcony = new THREE.Mesh(balconyGeo, ironMat);
    balcony.position.set(bx, 4.2, bz + sign * 3.6);
    const ac = new THREE.Mesh(acGeo, acBoxMat);
    ac.position.set(bx + 2.2, 4.6, bz + sign * 3.4);
    const tank = new THREE.Mesh(tankGeo, waterTankMat);
    tank.position.set(bx - 1.5, bh + 0.45, bz);
    staticGroup.add(balcony, ac, tank);
  }

  // 2. Amendoeiras cariocas nas calçadas e fiação aérea entre os postes
  const trunkGeo = geo(new THREE.CylinderGeometry(0.14, 0.2, 2.5, 8));
  const canopyGeo = geo(new THREE.DodecahedronGeometry(1.35, 1));
  for (const [tx, tz] of [
    [-25, -6.2],
    [-11, -6.2],
    [10, -6.2],
    [25, -6.2],
    [-24, 6.2],
    [-9, 6.2],
    [12, 6.2],
  ] as const) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(tx, 1.25, tz);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(tx, 3.1, tz);
    canopy.scale.set(1.25, 0.82, 1.1);
    staticGroup.add(trunk, canopy);
  }

  // Fiação aérea e luminárias no topo dos postes (z = ±4.6)
  const wireGeo = geo(new THREE.BoxGeometry(halfX * 2 - 4, 0.025, 0.025));
  for (const wz of [-4.6, 4.6]) {
    const wire1 = new THREE.Mesh(wireGeo, ironMat);
    wire1.position.set(0, 4.25, wz);
    const wire2 = new THREE.Mesh(wireGeo, ironMat);
    wire2.position.set(0, 4.05, wz);
    staticGroup.add(wire1, wire2);
  }
  const lampHeadGeo = geo(new THREE.BoxGeometry(0.36, 0.1, 0.22));
  for (const px of [-18, -6, 6, 18]) {
    for (const pz of [-4.6, 4.6]) {
      const bulb = new THREE.Mesh(lampHeadGeo, streetLightBulbs);
      bulb.position.set(px, 4.38, pz > 0 ? pz - 0.25 : pz + 0.25);
      staticGroup.add(bulb);
    }
  }

  // 3. Morros cariocas ao fundo da Rua das Oficinas
  const hill1 = new THREE.Mesh(geo(new THREE.ConeGeometry(22, 18, 7)), hillMat);
  hill1.position.set(-28, 8, -36);
  const hill2 = new THREE.Mesh(geo(new THREE.ConeGeometry(26, 22, 8)), hillMat);
  hill2.position.set(24, 10, -40);
  const hill3 = new THREE.Mesh(geo(new THREE.ConeGeometry(20, 15, 7)), hillMat);
  hill3.position.set(0, 7, 38);
  staticGroup.add(hill1, hill2, hill3);

  // 4. Barraca de ambulante com guarda-sol colorido na calçada sul
  const umbrellaMat = mat({ color: 0xf59e0b, roughness: 0.65 });
  const umbrella = new THREE.Mesh(geo(new THREE.ConeGeometry(1.15, 0.55, 8)), umbrellaMat);
  umbrella.position.set(11.5, 2.25, 6.8);
  const umbrellaPole = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6)), ironMat);
  umbrellaPole.position.set(11.5, 1.05, 6.8);
  const cooler = new THREE.Mesh(geo(new THREE.BoxGeometry(0.65, 0.52, 0.45)), waterTankMat);
  cooler.position.set(11.5, 0.26, 6.8);
  staticGroup.add(umbrella, umbrellaPole, cooler);

  // Une toda a arquitetura e decoração estática por material (~7 malhas no total)
  mergeStaticMeshes(staticGroup);

  // 5. Elementos vivos (cachorro caramelo de rua + pombos)
  const dynamicGroup = new THREE.Group();
  dynamicGroup.name = 'vida_rua_carioca';
  root.add(dynamicGroup);

  const carameloMat = mat({ color: 0xc87d32, roughness: 0.78 });
  const dogGroup = new THREE.Group();
  dogGroup.name = 'cachorro_caramelo';
  const dogBody = new THREE.Mesh(geo(new THREE.BoxGeometry(0.56, 0.26, 0.24)), carameloMat);
  dogBody.position.set(0, 0.28, 0);
  const dogHead = new THREE.Mesh(geo(new THREE.BoxGeometry(0.22, 0.2, 0.2)), carameloMat);
  dogHead.position.set(0.32, 0.42, 0);
  const dogTail = new THREE.Mesh(geo(new THREE.BoxGeometry(0.18, 0.05, 0.05)), carameloMat);
  dogTail.position.set(-0.32, 0.36, 0);
  dogGroup.add(dogBody, dogHead, dogTail);
  mergeStaticMeshes(dogGroup);
  dogGroup.position.set(15.2, 0, 6.4); // Perto da Lanchonete da Tia Léa
  dynamicGroup.add(dogGroup);

  // Pombos na calçada (1 único InstancedMesh para 5 pombos = 1 chamada de desenho)
  const pigeonMat = mat({ color: 0x71717a, roughness: 0.75 });
  const pigeonGeo = geo(new THREE.BoxGeometry(0.18, 0.14, 0.12));
  const pigeons = new THREE.InstancedMesh(pigeonGeo, pigeonMat, 5);
  pigeons.name = 'pombos_calcada';
  const pm = new THREE.Matrix4();
  const pigeonCoords = [
    [-2.5, 0.08, 5.8],
    [-2.1, 0.08, 6.1],
    [-2.8, 0.08, 6.3],
    [7.2, 0.08, -5.9],
    [7.6, 0.08, -6.2],
  ] as const;
  pigeonCoords.forEach(([px, py, pz], idx) => {
    pigeons.setMatrixAt(idx, pm.makeTranslation(px, py, pz));
  });
  pigeons.instanceMatrix.needsUpdate = true;
  dynamicGroup.add(pigeons);

  let isRaining = false;

  const setTimeOfDay = (minuteOfDay: number) => {
    const preset = lightingAtMinute(minuteOfDay);
    sun.color.setHex(preset.sunColor);
    sun.intensity = isRaining ? preset.sunIntensity * 0.55 : preset.sunIntensity;
    sun.position.set(preset.sunPosition[0], preset.sunPosition[1], preset.sunPosition[2]);
    hemi.color.setHex(preset.skyColor);
    hemi.groundColor.setHex(preset.groundColor);
    hemi.intensity = preset.hemiIntensity;
    streetLightBulbs.emissiveIntensity = preset.streetLightsOn ? 2.4 : 0.15;
  };

  const setRain = (raining: boolean) => {
    isRaining = raining;
    // Asfalto molhado reflete os postes e faróis (menor rugosidade)
    asphaltMat.roughness = raining ? 0.26 : 0.85;
    asphaltMat.metalness = raining ? 0.18 : 0.05;
    asphaltMat.needsUpdate = true;
  };

  const updateAnim = (timeSec: number, reduceMotion: boolean) => {
    if (reduceMotion) {
      dogGroup.rotation.y = 0.4;
      return;
    }
    // Leve balanço vivo do cachorro caramelo olhando o movimento da rua
    dogGroup.rotation.y = 0.4 + Math.sin(timeSec * 2.2) * 0.12;
  };

  return {
    staticGroup,
    dynamicGroup,
    streetLightBulbs,
    setTimeOfDay,
    setRain,
    updateAnim,
  };
}
