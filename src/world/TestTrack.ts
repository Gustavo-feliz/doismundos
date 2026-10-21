import * as THREE from 'three';
import { VEHICLES } from '../data/vehicles';
import type { TestTrackDef } from '../driving/types';
import { createSeededRandom, range } from '../utils/random';
import { buildPlaceholderCar } from '../vehicles/PlaceholderCar';

/**
 * Pátio de teste (Prompt 13, Direção Híbrida A+B).
 * Carregado sob demanda (import dinâmico) só quando o jogador faz o test drive.
 * Usa a carroceria 3D por categoria (`PlaceholderCar`) e atmosfera carioca.
 */
export interface TestTrack {
  root: THREE.Group;
  car: THREE.Group;
  /** Carroceria (inclina com o balanço). */
  body: THREE.Group;
  setCarLook(color: string, dims: { length: number; width: number; height: number; wheelRadius: number }): void;
  dispose(): void;
}

/** Textura procedural rápida de asfalto carioca com marcas de frenagem e faixa central. */
function makeAsphaltTrackTexture(seed = 1301): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = createSeededRandom(seed);

  ctx.fillStyle = '#383a3d';
  ctx.fillRect(0, 0, size, size);

  // Grão de asfalto e manchas suaves de piche/borracha
  for (let i = 0; i < 45; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = range(rng, 18, 70);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng() < 0.65;
    g.addColorStop(0, dark ? 'rgba(22,23,25,0.22)' : 'rgba(92,95,98,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 4500; i++) {
    const v = rng() < 0.5 ? 18 : 120;
    ctx.fillStyle = `rgba(${v},${v},${v},0.16)`;
    ctx.fillRect(rng() * size, rng() * size, 2, 2);
  }

  // Marcas de pneu no slalom/chicane
  ctx.strokeStyle = 'rgba(15,15,16,0.28)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(size * 0.12, size * 0.82);
  ctx.bezierCurveTo(size * 0.35, size * 0.62, size * 0.62, size * 0.72, size * 0.82, size * 0.28);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Placa pintada no muro do pátio ("PÁTIO DE TESTE — LIMITE 60 KM/H"). */
function makeTrackBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f2ede1';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#1f5f43';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 500, 116);

  // Faixa zebrada inferior
  ctx.fillStyle = '#e0a619';
  ctx.fillRect(10, 96, 492, 22);
  ctx.fillStyle = '#1d1f21';
  for (let x = 10; x < 502; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 96);
    ctx.lineTo(x + 18, 96);
    ctx.lineTo(x + 6, 118);
    ctx.lineTo(x - 12, 118);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#1a3d2f';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OFICINA DO SEU ZÉ · PÁTIO DE TESTE', 256, 44);
  ctx.fillStyle = '#b62921';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('VELOCIDADE MÁXIMA: 60 KM/H', 256, 78);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTestTrack(track: TestTrackDef): TestTrack {
  const root = new THREE.Group();
  root.name = 'PLACEHOLDER_patio_de_teste';
  root.userData.placeholder = true;
  const disposables: Array<{ dispose(): void }> = [];
  const mat = (params: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(params);
    disposables.push(m);
    return m;
  };
  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    disposables.push(g);
    return g;
  };
  const tex = <T extends THREE.Texture>(t: T) => {
    disposables.push(t);
    return t;
  };

  // Luz carioca de fim de tarde: a oficina fica escondida durante o test drive.
  root.add(new THREE.HemisphereLight(0xffe9c8, 0x4f4a42, 1.55));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.set(22, 32, 14);
  root.add(sun);

  const { halfX, halfZ, wallThickness: t } = track;
  const asphaltTex = tex(makeAsphaltTrackTexture());
  const ground = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(halfX * 2 + 20, halfZ * 2 + 20)),
    mat({ map: asphaltTex, roughness: 0.86, metalness: 0.04 }),
  );
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  // Faixas pintadas no asfalto: largada amarela + linha guia tracejada pelo pátio.
  const yellowPaint = mat({ color: 0xf2c935, roughness: 0.55 });
  const whitePaint = mat({ color: 0xedeae2, roughness: 0.55 });
  const start = new THREE.Mesh(geo(new THREE.PlaneGeometry(4.4, 0.45)), yellowPaint);
  start.rotation.x = -Math.PI / 2;
  start.position.set(track.start.x, 0.012, track.start.z - 2.5);
  root.add(start);

  // Bordas da baia de largada
  for (const side of [-2.2, 2.2]) {
    const bayLine = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.18, 4.6)), whitePaint);
    bayLine.rotation.x = -Math.PI / 2;
    bayLine.position.set(track.start.x + side, 0.011, track.start.z - 0.4);
    root.add(bayLine);
  }

  // Muros perimetrais de alvenaria carioca + rodapé de segurança amarelo
  const wallMat = mat({ color: 0xd8cdb8, roughness: 0.85 });
  const curbMat = mat({ color: 0xdca31e, roughness: 0.65 });
  const wall = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(w, 1.35, d)), wallMat);
    m.position.set(x, 0.675, z);
    root.add(m);
    const curb = new THREE.Mesh(geo(new THREE.BoxGeometry(w + 0.04, 0.22, d + 0.04)), curbMat);
    curb.position.set(x, 0.11, z);
    root.add(curb);
  };
  wall(0, -halfZ - t / 2, halfX * 2 + t * 2, t);
  wall(0, halfZ + t / 2, halfX * 2 + t * 2, t);
  wall(-halfX - t / 2, 0, t, halfZ * 2);
  wall(halfX + t / 2, 0, t, halfZ * 2);

  // Placa de aviso no muro norte (frente para quem sai da largada)
  const bannerTex = tex(makeTrackBannerTexture());
  const banner = new THREE.Mesh(
    geo(new THREE.PlaneGeometry(6.8, 1.7)),
    mat({ map: bannerTex, roughness: 0.5 }),
  );
  banner.position.set(-14, 1.55, -halfZ + 0.05);
  root.add(banner);

  // Pilares de concreto com base zebrada de alerta
  const pillarMat = mat({ color: 0x969186, roughness: 0.82 });
  const hazardMat = mat({ color: 0xe2a81b, roughness: 0.55 });
  for (const p of track.pillars) {
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(p.width, 2.3, p.depth)), pillarMat);
    m.position.set(p.x, 1.15, p.z);
    root.add(m);
    const band = new THREE.Mesh(geo(new THREE.BoxGeometry(p.width + 0.04, 0.45, p.depth + 0.04)), hazardMat);
    band.position.set(p.x, 0.35, p.z);
    root.add(band);
  }

  // Silhueta distante de prédios/morro carioca fora do muro para compor o horizonte
  const backdropMat = mat({ color: 0x5c6d75, roughness: 0.95 });
  for (const [bx, bz, bw, bh, bd] of [
    [-22, -halfZ - 8, 12, 9, 6],
    [-4, -halfZ - 10, 14, 13, 7],
    [16, -halfZ - 9, 15, 10, 6],
    [halfX + 9, -6, 6, 11, 14],
  ] as const) {
    const b = new THREE.Mesh(geo(new THREE.BoxGeometry(bw, bh, bd)), backdropMat);
    b.position.set(bx, bh / 2, bz);
    root.add(b);
  }

  // Cones com instancing: corpo laranja + faixa refletiva branca (2 draw calls no total).
  const cones = new THREE.InstancedMesh(
    geo(new THREE.ConeGeometry(track.coneRadius, 0.75, 12)),
    mat({ color: 0xff6214, roughness: 0.52 }),
    track.cones.length,
  );
  const coneStripes = new THREE.InstancedMesh(
    geo(new THREE.CylinderGeometry(track.coneRadius * 0.42, track.coneRadius * 0.62, 0.18, 12)),
    mat({ color: 0xf7f7f2, roughness: 0.35 }),
    track.cones.length,
  );
  const m4 = new THREE.Matrix4();
  track.cones.forEach((c, i) => {
    cones.setMatrixAt(i, m4.makeTranslation(c.x, 0.375, c.z));
    coneStripes.setMatrixAt(i, m4.makeTranslation(c.x, 0.46, c.z));
  });
  root.add(cones, coneStripes);

  // Carro 3D por categoria reutilizando `PlaceholderCar` (frente alinhada com -Z da física).
  const car = new THREE.Group();
  car.name = 'PLACEHOLDER_carro_test_drive';
  const body = new THREE.Group();
  car.add(body);
  const defaultVehicle = VEHICLES[0]!;
  const placeholderCar = buildPlaceholderCar(defaultVehicle, {
    color: defaultVehicle.paintColor,
    plate: 'TEST-013',
  });
  // Em PlaceholderCar a dianteira aponta para +X; na física do TestTrack heading=0 aponta para -Z.
  placeholderCar.group.rotation.y = Math.PI / 2;
  body.add(placeholderCar.group);
  root.add(car);

  function setCarLook(color: string, d: { length: number; width: number; height: number; wheelRadius: number }): void {
    const matched =
      VEHICLES.find(
        (v) =>
          Math.abs(v.dimensions.length - d.length) < 0.02 &&
          Math.abs(v.dimensions.width - d.width) < 0.02 &&
          Math.abs(v.dimensions.height - d.height) < 0.02,
      ) ?? {
        ...defaultVehicle,
        dimensions: {
          ...defaultVehicle.dimensions,
          ...d,
        },
      };
    placeholderCar.setVehicle(matched, { color, plate: 'TEST-013' });
  }

  return {
    root,
    car,
    body,
    setCarLook,
    dispose: () => {
      for (const d of disposables) d.dispose();
      cones.dispose();
      coneStripes.dispose();
    },
  };
}
