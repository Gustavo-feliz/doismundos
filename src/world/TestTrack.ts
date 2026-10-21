import * as THREE from 'three';
import type { TestTrackDef } from '../driving/types';

/**
 * Pátio de teste (Prompt 13). PROVISÓRIO: geometria simples gerada por código,
 * carregada sob demanda (import dinâmico) só quando o jogador faz o test drive.
 * O passe de arte pode trocar tudo, mantendo as medidas de TEST_TRACK.
 */
export interface TestTrack {
  root: THREE.Group;
  car: THREE.Group;
  /** Carroceria (inclina com o balanço). */
  body: THREE.Group;
  setCarLook(color: string, dims: { length: number; width: number; height: number; wheelRadius: number }): void;
  dispose(): void;
}

export function buildTestTrack(track: TestTrackDef): TestTrack {
  const root = new THREE.Group();
  root.name = 'PLACEHOLDER_patio_de_teste';
  root.userData.placeholder = true;
  const disposables: Array<{ dispose(): void }> = [];
  const mat = (color: number, roughness = 0.9) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness });
    disposables.push(m);
    return m;
  };
  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    disposables.push(g);
    return g;
  };

  // Luz própria: a oficina fica escondida durante o test drive.
  root.add(new THREE.HemisphereLight(0xdfeeff, 0x5a5348, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(20, 30, 10);
  root.add(sun);

  const { halfX, halfZ, wallThickness: t } = track;
  const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(halfX * 2 + 20, halfZ * 2 + 20)), mat(0x6c6c68));
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  // Faixas pintadas: largada e um "S" orientando o zigue-zague.
  const paint = mat(0xf2d33a, 0.6);
  const start = new THREE.Mesh(geo(new THREE.PlaneGeometry(4, 0.4)), paint);
  start.rotation.x = -Math.PI / 2;
  start.position.set(track.start.x, 0.01, track.start.z - 2.5);
  root.add(start);

  const wallMat = mat(0xb9b2a6);
  const wall = (x: number, z: number, w: number, d: number) => {
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(w, 1.2, d)), wallMat);
    m.position.set(x, 0.6, z);
    root.add(m);
  };
  wall(0, -halfZ - t / 2, halfX * 2 + t * 2, t);
  wall(0, halfZ + t / 2, halfX * 2 + t * 2, t);
  wall(-halfX - t / 2, 0, t, halfZ * 2);
  wall(halfX + t / 2, 0, t, halfZ * 2);

  const pillarMat = mat(0x8f8a80);
  for (const p of track.pillars) {
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(p.width, 2.2, p.depth)), pillarMat);
    m.position.set(p.x, 1.1, p.z);
    root.add(m);
  }

  // Cones com instancing: um único desenho para todos.
  const cones = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(track.coneRadius, 0.75, 12)), mat(0xff6a1a, 0.6), track.cones.length);
  const m4 = new THREE.Matrix4();
  track.cones.forEach((c, i) => cones.setMatrixAt(i, m4.makeTranslation(c.x, 0.375, c.z)));
  root.add(cones);

  // Carro provisório: caixa da carroceria, cabine e 4 rodas.
  const car = new THREE.Group();
  car.name = 'PLACEHOLDER_carro_test_drive';
  const body = new THREE.Group();
  car.add(body);
  const paintMat = new THREE.MeshStandardMaterial({ color: 0x7d1d1d, roughness: 0.45, metalness: 0.2 });
  disposables.push(paintMat);
  const glass = mat(0x22313d, 0.2);
  const tire = mat(0x1b1b1b, 0.95);
  const lower = new THREE.Mesh(geo(new THREE.BoxGeometry(1, 1, 1)), paintMat);
  const cabin = new THREE.Mesh(geo(new THREE.BoxGeometry(1, 1, 1)), glass);
  body.add(lower, cabin);
  const wheelGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 16));
  const wheels = [0, 1, 2, 3].map(() => {
    const w = new THREE.Mesh(wheelGeo, tire);
    w.rotation.z = Math.PI / 2;
    car.add(w);
    return w;
  });
  root.add(car);

  function setCarLook(color: string, d: { length: number; width: number; height: number; wheelRadius: number }): void {
    paintMat.color.set(color);
    lower.scale.set(d.width, d.height * 0.45, d.length);
    lower.position.set(0, d.wheelRadius + d.height * 0.2, 0);
    cabin.scale.set(d.width * 0.86, d.height * 0.4, d.length * 0.5);
    cabin.position.set(0, d.wheelRadius + d.height * 0.62, d.length * 0.06);
    const wx = d.width / 2 - 0.1;
    const wz = d.length / 2 - d.wheelRadius * 1.6;
    wheels.forEach((w, i) => {
      w.scale.set(d.wheelRadius, 0.22, d.wheelRadius);
      w.position.set(i % 2 ? wx : -wx, d.wheelRadius, i < 2 ? -wz : wz);
    });
  }

  return {
    root,
    car,
    body,
    setCarLook,
    dispose: () => {
      for (const d of disposables) d.dispose();
      cones.dispose();
    },
  };
}
