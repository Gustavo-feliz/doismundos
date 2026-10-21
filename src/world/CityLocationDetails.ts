import * as THREE from 'three';
import type { CityLocationDef, CityLocationId } from '../city/types';
import { mergeStaticMeshes } from '../utils/mergeStatic';

/**
 * Detalhes 3D carregados sob demanda (`import()`) por estabelecimento do bairro
 * (GDD §7.3, Prompts 14 e 21). Só monta os objetos internos/vitrines do local quando
 * o jogador o visita pela primeira vez.
 */
export function buildLocationDetailGroup(
  loc: CityLocationDef,
  registerDisposable: <T extends { dispose(): void }>(item: T) => T,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `PLACEHOLDER_detalhe_local_${loc.id}`;
  group.userData.placeholder = true;
  group.userData.locationId = loc.id;

  const mat = (color: number, roughness = 0.7, metalness = 0.1) =>
    registerDisposable(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const geo = <T extends THREE.BufferGeometry>(g: T) => registerDisposable(g);

  const { x: ex, z: ez } = loc.entrance;
  const sideSign = loc.entrance.z > 0 ? 1 : -1;

  switch (loc.id as CityLocationId) {
    case 'loja-pecas': {
      // Expositor externo de pneus e balcão de baterias na entrada da Autopeças
      const rackMat = mat(0x1e40af, 0.45, 0.5);
      const tireMat = mat(0x18181b, 0.9);
      const rack = new THREE.Mesh(geo(new THREE.BoxGeometry(1.6, 1.3, 0.45)), rackMat);
      rack.position.set(ex - 2.2, 0.65, ez + sideSign * 0.6);
      group.add(rack);
      const tireGeo = geo(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14));
      for (let i = 0; i < 3; i++) {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(ex - 2.65 + i * 0.45, 0.95, ez + sideSign * 0.6);
        group.add(tire);
      }
      break;
    }
    case 'ferro-velho': {
      // Pilha de carcaças/blocos de motor e pórtico de talha no pátio do Tião
      const rustMat = mat(0x8c4a27, 0.88, 0.35);
      const metalMat = mat(0x52525b, 0.6, 0.7);
      const stack = new THREE.Mesh(geo(new THREE.BoxGeometry(2.1, 1.4, 1.2)), rustMat);
      stack.position.set(ex + 2.5, 0.7, ez + sideSign * 0.7);
      const block = new THREE.Mesh(geo(new THREE.BoxGeometry(0.9, 0.8, 0.8)), metalMat);
      block.position.set(ex + 2.4, 1.75, ez + sideSign * 0.7);
      group.add(stack, block);
      break;
    }
    case 'banco': {
      // Totem de autoatendimento 24h e vasos ornamentais na entrada da agência
      const tealMat = mat(0x0f766e, 0.35, 0.3);
      const screenMat = mat(0x38bdf8, 0.2, 0.1);
      const atm = new THREE.Mesh(geo(new THREE.BoxGeometry(0.75, 1.65, 0.55)), tealMat);
      atm.position.set(ex - 2.0, 0.825, ez + sideSign * 0.65);
      const screen = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.45, 0.35)), screenMat);
      screen.position.set(ex - 2.0, 1.2, ez + sideSign * 0.36);
      if (sideSign > 0) screen.rotation.y = Math.PI;
      group.add(atm, screen);
      break;
    }
    case 'lanchonete': {
      // Mesas de calçada carioca e carrinho de caldo de cana da Tia Léa
      const redMat = mat(0xdc2626, 0.55, 0.1);
      const steelMat = mat(0xd4d4d8, 0.35, 0.8);
      for (const dx of [-2.1, 2.1]) {
        const table = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.55, 0.55, 0.78, 12)), redMat);
        table.position.set(ex + dx, 0.39, ez - sideSign * 0.3);
        group.add(table);
      }
      const cart = new THREE.Mesh(geo(new THREE.BoxGeometry(1.1, 1.15, 0.65)), steelMat);
      cart.position.set(ex + 2.4, 0.575, ez + sideSign * 0.6);
      group.add(cart);
      break;
    }
    case 'oficina': {
      // Placa de cavalete "ABERTO — DIAGNÓSTICO E REPARO" e fachada detalhada na calçada da oficina
      const boardMat = mat(0xfacc15, 0.6, 0.1);
      const sign = new THREE.Mesh(geo(new THREE.BoxGeometry(0.7, 1.05, 0.4)), boardMat);
      sign.position.set(ex + 2.0, 0.525, ez - sideSign * 0.2);
      group.add(sign);
      break;
    }
  }

  mergeStaticMeshes(group);
  return group;
}

