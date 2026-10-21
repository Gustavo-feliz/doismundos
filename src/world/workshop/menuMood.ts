import * as THREE from 'three';
import { MENU_MOOD, type MenuMoodPreset, type MoodSpotLight } from '../../data/lighting';
import { createSeededRandom, range } from '../../utils/random';

/**
 * Clima de luz do menu inicial (referência: docs/coordenacao/referencias/menu-repaginado.png).
 *
 * Liga/desliga por cima da iluminação normal da oficina, sem estado de jogo:
 * - sol baixo e dourado entrando pelo portão + feixe volumétrico falso com poeira;
 * - lâmpadas do galpão mais quentes (mesmo se o interruptor estiver desligado);
 * - spot no carro do box 1 e na placa da parede, que também ganha brilho próprio;
 * - objetos que atrapalham o quadro (macaco jacaré do primeiro plano) somem.
 *
 * Ao desligar, tudo volta exatamente como estava: cores e posição do sol pelo
 * retrato tirado ao ligar; intensidades das lâmpadas pelo estado do interruptor
 * (assim um upgrade de iluminação aplicado durante o menu não se perde).
 */

export type MoodQualityTier = 'baixa' | 'media' | 'alta';

export interface MenuMoodHall {
  entries: Array<{ light: THREE.Light; on: number; off: number }>;
  tube: THREE.MeshStandardMaterial;
  tubeOnIntensity: number;
}

export interface MenuMoodOptions {
  root: THREE.Group;
  preset?: MenuMoodPreset;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  hall: MenuMoodHall;
  signMaterial?: THREE.MeshStandardMaterial;
  /** Saem do quadro só no menu. */
  hideInMenu?: readonly THREE.Object3D[];
  /** Centro do vão do portão, por onde o feixe de sol entra. */
  beamStart?: readonly [number, number, number];
  beamSize?: { width: number; height: number; length: number };
}

export interface MenuMood {
  group: THREE.Group;
  readonly active: boolean;
  set(on: boolean): void;
  setReduceMotion(reduceMotion: boolean): void;
  setQualityTier(tier: MoodQualityTier): void;
}

interface Snapshot {
  sunColor: number;
  sunIntensity: number;
  sunPosition: THREE.Vector3;
  hemiColor: number;
  hemiGround: number;
  entryColors: number[];
  lightsOn: boolean;
  tubeEmissive: number;
  signEmissive: number;
  signEmissiveIntensity: number;
  signEmissiveMap: THREE.Texture | null;
  hiddenVisible: boolean[];
}

function makeSpot(spec: MoodSpotLight, name: string, group: THREE.Group): THREE.SpotLight {
  const spot = new THREE.SpotLight(spec.color, spec.intensity, 0, spec.angle, spec.penumbra, 2);
  spot.name = name;
  spot.castShadow = false;
  spot.position.set(spec.position[0], spec.position[1], spec.position[2]);
  spot.target.position.set(spec.target[0], spec.target[1], spec.target[2]);
  group.add(spot, spot.target);
  return spot;
}

export function buildMenuMood(opts: MenuMoodOptions): MenuMood {
  const preset = opts.preset ?? MENU_MOOD;
  const hideInMenu = opts.hideInMenu ?? [];
  const beamStart = opts.beamStart ?? [1.2, 2.0, 9.0];
  const beamSize = opts.beamSize ?? { width: 3.4, height: 2.8, length: 11.0 };
  const { sun, hemi, hall, signMaterial } = opts;
  const group = new THREE.Group();
  group.name = 'clima_menu';
  group.visible = false;
  opts.root.add(group);

  makeSpot(preset.carKeyLight, 'menu_luz_carro', group);
  makeSpot(preset.signLight, 'menu_luz_placa', group);

  // --- Feixe de sol: caixa aditiva alinhada à direção do sol, que some ao longo do comprimento ---
  const sunTarget = sun.target.position.clone();
  const dir = sunTarget.sub(new THREE.Vector3(...preset.sunPosition)).normalize();
  const { width, height, length } = beamSize;
  const beamGeo = new THREE.BoxGeometry(width, height, length);
  beamGeo.translate(0, 0, -length / 2);
  const pos = beamGeo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(preset.beamColor);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, -pos.getZ(i) / length));
    const k = Math.pow(1 - t, 1.4);
    colors[i * 3] = base.r * k;
    colors[i * 3 + 1] = base.g * k;
    colors[i * 3 + 2] = base.b * k;
  }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const beamMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: preset.beamOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.name = 'menu_feixe_sol';
  beam.renderOrder = 2;
  const start = new THREE.Vector3(...beamStart);
  beam.position.copy(start);
  // O comprimento corre em -Z local: aponta +Z para trás do feixe.
  beam.lookAt(start.clone().sub(dir));
  beam.updateMatrixWorld(true);
  group.add(beam);

  // --- Poeira em suspensão dentro do feixe (semente fixa: sempre igual) ---
  const rng = createSeededRandom(1987);
  const basePositions: number[] = [];
  const phases: number[] = [];
  const local = new THREE.Vector3();
  let guard = 0;
  while (basePositions.length / 3 < preset.dustCount && guard++ < preset.dustCount * 20) {
    local.set(range(rng, -width * 0.45, width * 0.45), range(rng, -height * 0.45, height * 0.45), range(rng, -length * 0.8, -0.3));
    local.applyMatrix4(beam.matrix);
    if (local.y < 0.12 || local.y > height) continue;
    basePositions.push(local.x, local.y, local.z);
    phases.push(rng() * Math.PI * 2);
  }
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(basePositions);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: preset.dustColor,
      size: preset.dustSize,
      transparent: true,
      opacity: preset.dustOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  dust.name = 'menu_poeira_feixe';
  dust.frustumCulled = false;
  group.add(dust);

  let reduceMotion = false;
  dust.onBeforeRender = () => {
    if (reduceMotion) return;
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    const attr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i]!;
      attr.setXYZ(
        i,
        basePositions[i * 3]! + Math.sin(t * 0.21 + p * 1.7) * 0.07,
        basePositions[i * 3 + 1]! + Math.sin(t * 0.33 + p) * 0.09,
        basePositions[i * 3 + 2]! + Math.cos(t * 0.17 + p * 0.6) * 0.05,
      );
    }
    attr.needsUpdate = true;
  };

  group.traverse((o) => {
    o.raycast = () => {};
  });

  let active = false;
  let tier: MoodQualityTier = 'alta';
  let snap: Snapshot | null = null;

  const syncTier = () => {
    dust.visible = tier !== 'baixa';
  };

  const apply = () => {
    snap = {
      sunColor: sun.color.getHex(),
      sunIntensity: sun.intensity,
      sunPosition: sun.position.clone(),
      hemiColor: hemi.color.getHex(),
      hemiGround: hemi.groundColor.getHex(),
      entryColors: hall.entries.map((e) => e.light.color.getHex()),
      lightsOn: hall.tube.emissiveIntensity > 0.01,
      tubeEmissive: hall.tube.emissive.getHex(),
      signEmissive: signMaterial?.emissive.getHex() ?? 0,
      signEmissiveIntensity: signMaterial?.emissiveIntensity ?? 0,
      signEmissiveMap: signMaterial?.emissiveMap ?? null,
      hiddenVisible: hideInMenu.map((o) => o.visible),
    };

    sun.color.setHex(preset.sunColor);
    sun.intensity = preset.sunIntensity;
    sun.position.set(preset.sunPosition[0], preset.sunPosition[1], preset.sunPosition[2]);
    hemi.color.setHex(preset.skyColor);
    hemi.groundColor.setHex(preset.groundColor);

    for (const entry of hall.entries) {
      entry.light.color.setHex(preset.hallLightColor);
      entry.light.intensity = entry.on * preset.hallIntensityScale;
    }
    hall.tube.emissive.setHex(preset.tubeEmissiveColor);
    hall.tube.emissiveIntensity = preset.tubeIntensity;

    if (signMaterial && preset.signGlow > 0) {
      signMaterial.emissive.setHex(preset.signLight.color);
      signMaterial.emissiveIntensity = preset.signGlow;
      if (signMaterial.map) signMaterial.emissiveMap = signMaterial.map;
      signMaterial.needsUpdate = true;
    }

    for (const obj of hideInMenu) {
      obj.visible = false;
    }

    group.visible = true;
    syncTier();
  };

  const restore = () => {
    if (!snap) return;

    sun.color.setHex(snap.sunColor);
    sun.intensity = snap.sunIntensity;
    sun.position.copy(snap.sunPosition);
    hemi.color.setHex(snap.hemiColor);
    hemi.groundColor.setHex(snap.hemiGround);

    for (let i = 0; i < hall.entries.length; i++) {
      const entry = hall.entries[i]!;
      entry.light.color.setHex(snap.entryColors[i] ?? 0xffffff);
      entry.light.intensity = snap.lightsOn ? entry.on : entry.off;
    }
    hall.tube.emissive.setHex(snap.tubeEmissive);
    hall.tube.emissiveIntensity = snap.lightsOn ? hall.tubeOnIntensity : 0;

    if (signMaterial) {
      signMaterial.emissive.setHex(snap.signEmissive);
      signMaterial.emissiveIntensity = snap.signEmissiveIntensity;
      signMaterial.emissiveMap = snap.signEmissiveMap;
      signMaterial.needsUpdate = true;
    }

    for (let i = 0; i < hideInMenu.length; i++) {
      hideInMenu[i]!.visible = snap.hiddenVisible[i] ?? true;
    }

    group.visible = false;
    snap = null;
  };

  return {
    group,
    get active() {
      return active;
    },
    set(on: boolean) {
      if (active === on) return;
      active = on;
      if (on) apply();
      else restore();
    },
    setReduceMotion(rm: boolean) {
      reduceMotion = rm;
    },
    setQualityTier(nextTier: MoodQualityTier) {
      tier = nextTier;
      if (active) syncTier();
    },
  };
}

