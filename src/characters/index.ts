import * as THREE from 'three';

/**
 * Modelos 3D estilizados e animações procedurais dos personagens (Prompt 22 — Parte B).
 * Coerentes com a Direção Híbrida (A+B), cada personagem tem menos de 1.500 triângulos
 * (teto do GDD: <= 15.000 triângulos) e 4 animações procedurais (`idle`, `talking`, `walking`, `pointing`)
 * que respeitam a preferência `reduceMotion`.
 */

export type CharacterRole =
  | 'seu-ze'
  | 'protagonista'
  | 'cliente-motorista-app'
  | 'cliente-aposentado'
  | 'cliente-senhora-exigente'
  | 'gerente-banco';

export const CHARACTER_ROLES: readonly CharacterRole[] = [
  'seu-ze',
  'protagonista',
  'cliente-motorista-app',
  'cliente-aposentado',
  'cliente-senhora-exigente',
  'gerente-banco',
] as const;

export type CharacterAnimationState = 'idle' | 'talking' | 'walking' | 'pointing';

export interface CharacterCustomization {
  skinTone?: number;
  overallColor?: number;
  shirtColor?: number;
  hairColor?: number;
  label?: string;
}

export interface CharacterRig {
  root: THREE.Group;
  headPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  role: CharacterRole;
  triangleCount: number;
  setAnimation(state: CharacterAnimationState): void;
  getAnimation(): CharacterAnimationState;
  setCustomization(custom: CharacterCustomization): void;
  update(timeSec: number, reduceMotion?: boolean): void;
  dispose(): void;
}

interface RolePreset {
  label: string;
  skinTone: number;
  shirtColor: number;
  pantsColor: number;
  hairColor: number;
  accessory: 'oculos-testa' | 'bone' | 'boina' | 'bolsa' | 'gravata' | 'nenhum';
}

const ROLE_PRESETS: Readonly<Record<CharacterRole, RolePreset>> = {
  'seu-ze': {
    label: 'Seu Zé (Mestre Mecânico)',
    skinTone: 0xc68b59,
    shirtColor: 0x24518a, // Macacão azul-oficina clássico
    pantsColor: 0x1d3c6a,
    hairColor: 0xd4d4d8, // Grisalho
    accessory: 'oculos-testa',
  },
  protagonista: {
    label: 'Protagonista',
    skinTone: 0xd6a17c,
    shirtColor: 0x2b5852, // Macacão verde-oficina herdado
    pantsColor: 0x1f3f3b,
    hairColor: 0x27272a,
    accessory: 'nenhum',
  },
  'cliente-motorista-app': {
    label: 'Cliente — Motorista de Aplicativo',
    skinTone: 0x8d5524,
    shirtColor: 0x0284c7,
    pantsColor: 0x1e293b,
    hairColor: 0x18181b,
    accessory: 'bone',
  },
  'cliente-aposentado': {
    label: 'Cliente — Aposentado Cuidadoso',
    skinTone: 0xe0ac69,
    shirtColor: 0xd97706,
    pantsColor: 0x44403c,
    hairColor: 0xe5e7eb,
    accessory: 'boina',
  },
  'cliente-senhora-exigente': {
    label: 'Cliente — Senhora Exigente',
    skinTone: 0xc68642,
    shirtColor: 0x9333ea,
    pantsColor: 0x1f2937,
    hairColor: 0x3f2e21,
    accessory: 'bolsa',
  },
  'gerente-banco': {
    label: 'Gerente do Banco Carioca',
    skinTone: 0xd2996c,
    shirtColor: 0x1e293b, // Paletó escuro
    pantsColor: 0x0f172a,
    hairColor: 0x27272a,
    accessory: 'gravata',
  },
};

export function buildCharacter(role: CharacterRole, custom?: CharacterCustomization): CharacterRig {
  const preset = ROLE_PRESETS[role];
  const root = new THREE.Group();
  root.name = `personagem_${role}`;
  root.userData = {
    characterRole: role,
    label: custom?.label ?? preset.label,
  };

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({ color: custom?.skinTone ?? preset.skinTone, roughness: 0.72 }),
  );
  const shirtMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: custom?.overallColor ?? custom?.shirtColor ?? preset.shirtColor,
      roughness: 0.68,
    }),
  );
  const pantsMat = trackMat(
    new THREE.MeshStandardMaterial({ color: preset.pantsColor, roughness: 0.8 }),
  );
  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({ color: custom?.hairColor ?? preset.hairColor, roughness: 0.85 }),
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.55 }),
  );

  // Pernas e botas
  const legGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.72, 0.18));
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, pantsMat);
    leg.position.set(side * 0.11, 0.36, 0);
    root.add(leg);
  }

  // Tronco / macacão
  const torso = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.64, 0.24)), shirtMat);
  torso.position.set(0, 1.04, 0);
  root.add(torso);

  // Cabeça articulada
  const headPivot = new THREE.Group();
  headPivot.name = 'cabeca_pivot';
  headPivot.position.set(0, 1.4, 0);
  const headMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.26, 0.28, 0.26)), skinMat);
  headMesh.position.y = 0.14;
  const hairMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.1, 0.28)), hairMat);
  hairMesh.position.y = 0.27;
  headPivot.add(headMesh, hairMesh);

  // Acessório distintivo por papel
  if (preset.accessory === 'oculos-testa') {
    const glasses = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.27, 0.05, 0.06)), accentMat);
    glasses.position.set(0, 0.23, 0.12);
    headPivot.add(glasses);
    // Pano de oficina vermelho no bolso do Seu Zé
    const rag = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.08, 0.14, 0.04)), accentMat);
    rag.position.set(0.12, 1.12, 0.13);
    root.add(rag);
  } else if (preset.accessory === 'gravata') {
    const tie = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.34, 0.03)), accentMat);
    tie.position.set(0, 1.08, 0.13);
    root.add(tie);
  } else if (preset.accessory === 'bone' || preset.accessory === 'boina') {
    const brim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.26, 0.04, 0.16)), shirtMat);
    brim.position.set(0, 0.25, 0.16);
    headPivot.add(brim);
  } else if (preset.accessory === 'bolsa') {
    const bag = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.26, 0.22)), accentMat);
    bag.position.set(-0.27, 0.88, 0.04);
    root.add(bag);
  }
  root.add(headPivot);

  // Braços articulados (direito aponta/gesticula no diálogo)
  const armGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.56, 0.12));
  const rightArmPivot = new THREE.Group();
  rightArmPivot.name = 'braco_direito_pivot';
  rightArmPivot.position.set(-0.28, 1.32, 0);
  const rightArm = new THREE.Mesh(armGeo, shirtMat);
  rightArm.position.y = -0.24;
  rightArmPivot.add(rightArm);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.name = 'braco_esquerdo_pivot';
  leftArmPivot.position.set(0.28, 1.32, 0);
  const leftArm = new THREE.Mesh(armGeo, shirtMat);
  leftArm.position.y = -0.24;
  leftArmPivot.add(leftArm);

  root.add(rightArmPivot, leftArmPivot);

  let triangleCount = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const idx = mesh.geometry.index;
    const pos = mesh.geometry.getAttribute('position');
    triangleCount += idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
  });

  let animState: CharacterAnimationState = 'idle';

  const applyPose = (timeSec: number, reduceMotion: boolean) => {
    if (reduceMotion) {
      headPivot.rotation.set(0, 0, 0);
      leftArmPivot.rotation.set(0, 0, 0);
      rightArmPivot.rotation.set(animState === 'pointing' ? -1.15 : animState === 'talking' ? -0.35 : 0, 0, 0);
      return;
    }
    switch (animState) {
      case 'idle': {
        headPivot.rotation.y = Math.sin(timeSec * 1.1) * 0.08;
        headPivot.rotation.x = Math.sin(timeSec * 1.8) * 0.03;
        rightArmPivot.rotation.x = Math.sin(timeSec * 1.5) * 0.04;
        leftArmPivot.rotation.x = -Math.sin(timeSec * 1.5) * 0.04;
        break;
      }
      case 'talking': {
        headPivot.rotation.x = Math.sin(timeSec * 6.5) * 0.07;
        headPivot.rotation.y = Math.sin(timeSec * 2.4) * 0.12;
        rightArmPivot.rotation.x = -0.45 + Math.sin(timeSec * 5.2) * 0.22;
        leftArmPivot.rotation.x = -0.2 + Math.cos(timeSec * 4.4) * 0.14;
        break;
      }
      case 'pointing': {
        headPivot.rotation.y = -0.15;
        rightArmPivot.rotation.x = -1.25 + Math.sin(timeSec * 3.0) * 0.06;
        leftArmPivot.rotation.x = 0;
        break;
      }
      case 'walking': {
        const swing = Math.sin(timeSec * 6.0) * 0.45;
        rightArmPivot.rotation.x = swing;
        leftArmPivot.rotation.x = -swing;
        headPivot.rotation.y = 0;
        break;
      }
    }
  };

  return {
    root,
    headPivot,
    rightArmPivot,
    leftArmPivot,
    role,
    triangleCount,
    setAnimation(state: CharacterAnimationState) {
      animState = state;
      applyPose(0, true);
    },
    getAnimation: () => animState,
    setCustomization(next: CharacterCustomization) {
      if (next.skinTone !== undefined) skinMat.color.setHex(next.skinTone);
      if (next.overallColor !== undefined) shirtMat.color.setHex(next.overallColor);
      else if (next.shirtColor !== undefined) shirtMat.color.setHex(next.shirtColor);
      if (next.hairColor !== undefined) hairMat.color.setHex(next.hairColor);
      if (next.label !== undefined) root.userData.label = next.label;
    },
    update(timeSec: number, reduceMotion = false) {
      applyPose(timeSec, reduceMotion);
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export interface CastMemberSpec {
  role: CharacterRole;
  position: readonly [number, number, number];
  yaw: number;
  animation: CharacterAnimationState;
  custom?: CharacterCustomization;
}

export interface CastStage {
  group: THREE.Group;
  placeCast(cast: readonly CastMemberSpec[] | null): void;
  getRig(role: CharacterRole): CharacterRig | undefined;
  update(timeSec: number, reduceMotion?: boolean): void;
  dispose(): void;
}

/**
 * Gerenciador de elenco em cena (`placeCast`) para a abertura cinematográfica (Prompt 23)
 * e personagens ativos na oficina (Prompt 22). Cria ou reaproveita os modelos por `role`.
 */
export function createCastStage(parent?: THREE.Object3D): CastStage {
  const group = new THREE.Group();
  group.name = 'elenco_personagens';
  group.traverse((c) => {
    c.raycast = () => {};
  });
  if (parent) parent.add(group);

  const rigs = new Map<CharacterRole, CharacterRig>();

  const disableRigRaycast = (rig: CharacterRig) => {
    rig.root.traverse((c) => {
      c.raycast = () => {};
    });
  };

  return {
    group,
    placeCast(cast: readonly CastMemberSpec[] | null) {
      for (const rig of rigs.values()) {
        rig.root.visible = false;
      }
      if (!cast || cast.length === 0) return;

      for (const item of cast) {
        let rig = rigs.get(item.role);
        if (!rig) {
          rig = buildCharacter(item.role, item.custom);
          disableRigRaycast(rig);
          rigs.set(item.role, rig);
          group.add(rig.root);
        } else if (item.custom) {
          rig.setCustomization(item.custom);
        }
        rig.root.position.set(item.position[0], item.position[1], item.position[2]);
        rig.root.rotation.y = item.yaw;
        rig.setAnimation(item.animation);
        rig.root.visible = true;
      }
    },
    getRig(role: CharacterRole) {
      return rigs.get(role);
    },
    update(timeSec: number, reduceMotion = false) {
      for (const rig of rigs.values()) {
        if (rig.root.visible) {
          rig.update(timeSec, reduceMotion);
        }
      }
    },
    dispose() {
      for (const rig of rigs.values()) {
        rig.dispose();
      }
      rigs.clear();
    },
  };
}

