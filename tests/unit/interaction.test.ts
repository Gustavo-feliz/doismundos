import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EQUIPMENT } from '../../src/data/equipment';
import { Actuator, easeInOut, type ActuatorPhase } from '../../src/equipment/Actuator';
import { carBlocksWalking, hoodAvailability, liftAvailability } from '../../src/equipment/bayRules';
import { InteractionSystem } from '../../src/interaction/InteractionSystem';
import { findInteractableId, resolveTarget, tagInteractable } from '../../src/interaction/resolveTarget';
import { createInteractable, type Availability } from '../../src/interaction/types';

describe('Actuator', () => {
  it('percorre de 0 a 1 no tempo configurado, passando pelas fases', () => {
    const a = new Actuator(2);
    expect(a.phase).toBe('retracted');
    expect(a.extend()).toBe(true);
    expect(a.phase).toBe('extending');
    a.update(1);
    expect(a.position).toBeCloseTo(0.5);
    a.update(5); // passa do fim: trava em 1
    expect(a.position).toBe(1);
    expect(a.phase).toBe('extended');
    expect(a.moving).toBe(false);
  });

  it('extend repetido não reinicia e retract no meio inverte o sentido', () => {
    const a = new Actuator(1);
    a.extend();
    a.update(0.4);
    expect(a.extend()).toBe(false);
    a.retract();
    expect(a.phase).toBe('retracting');
    a.update(0.4);
    expect(a.position).toBe(0);
    expect(a.phase).toBe('retracted');
  });

  it('reset posiciona sem animar e ignora dt inválido', () => {
    const a = new Actuator(1);
    a.reset(1);
    expect(a.phase).toBe('extended');
    a.retract();
    a.update(-1);
    a.update(Number.NaN);
    expect(a.position).toBe(1);
  });

  it('rejeita tempo de percurso inválido', () => {
    expect(() => new Actuator(0)).toThrow(RangeError);
  });

  it('easeInOut começa e termina nos extremos', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});

describe('regras do box (elevador × capô × jogador)', () => {
  const s = (lift: ActuatorPhase, hood: ActuatorPhase, playerUnderCar = false) => ({ lift, hood, playerUnderCar });
  const L = EQUIPMENT.lift;
  const H = EQUIPMENT.hood;

  it('elevador embaixo e capô fechado: pode subir', () => {
    expect(liftAvailability(s('retracted', 'retracted'))).toEqual({ status: 'available', action: L.actionRaise });
  });

  it('elevador não sobe com o capô aberto ou se movendo', () => {
    expect(liftAvailability(s('retracted', 'extended'))).toMatchObject({ status: 'unavailable', reason: L.blockedHoodOpen });
    expect(liftAvailability(s('retracted', 'extending'))).toMatchObject({ status: 'unavailable', reason: L.blockedHoodMoving });
    expect(liftAvailability(s('retracted', 'retracting'))).toMatchObject({ status: 'unavailable', reason: L.blockedHoodMoving });
  });

  it('elevador em movimento fica "em uso"', () => {
    expect(liftAvailability(s('extending', 'retracted')).status).toBe('busy');
    expect(liftAvailability(s('retracting', 'retracted')).status).toBe('busy');
  });

  it('elevador no alto desce, mas não com o jogador embaixo', () => {
    expect(liftAvailability(s('extended', 'retracted'))).toEqual({ status: 'available', action: L.actionLower });
    expect(liftAvailability(s('extended', 'retracted', true))).toMatchObject({ status: 'unavailable', reason: L.blockedPlayerUnder });
  });

  it('capô só com o elevador parado embaixo', () => {
    expect(hoodAvailability(s('retracted', 'retracted'))).toEqual({ status: 'available', action: H.actionOpen });
    expect(hoodAvailability(s('retracted', 'extended'))).toEqual({ status: 'available', action: H.actionClose });
    expect(hoodAvailability(s('extended', 'retracted'))).toMatchObject({ status: 'unavailable', reason: H.blockedLiftUp });
    expect(hoodAvailability(s('extending', 'retracted'))).toMatchObject({ status: 'unavailable', reason: H.blockedLiftMoving });
    expect(hoodAvailability(s('retracted', 'extending')).status).toBe('busy');
  });

  it('nunca existe um estado em que elevador e capô estejam ambos disponíveis para mover juntos', () => {
    const phases: ActuatorPhase[] = ['retracted', 'extending', 'extended', 'retracting'];
    for (const lift of phases) {
      for (const hood of phases) {
        const moving = (p: ActuatorPhase) => p === 'extending' || p === 'retracting';
        // Se um dos dois está se movendo, o outro não pode estar disponível.
        if (moving(lift)) expect(hoodAvailability(s(lift, hood)).status).not.toBe('available');
        if (moving(hood)) expect(liftAvailability(s(lift, hood)).status).not.toBe('available');
      }
    }
  });

  it('carro só deixa passar por baixo no alto e parado', () => {
    expect(carBlocksWalking('extended')).toBe(false);
    expect(carBlocksWalking('extending')).toBe(true);
    expect(carBlocksWalking('retracting')).toBe(true);
    expect(carBlocksWalking('retracted')).toBe(true);
  });
});

describe('createInteractable', () => {
  it('revalida na hora de executar: se mudou para indisponível, não executa', () => {
    let state: Availability = { status: 'available', action: 'Fazer' };
    const perform = vi.fn(() => 'feito');
    const item = createInteractable({ id: 'x', name: 'X', evaluate: () => state, perform });
    expect(item.getPrompt()).toMatchObject({ name: 'X', status: 'available', action: 'Fazer' });

    state = { status: 'unavailable', reason: 'Agora não' };
    expect(item.interact()).toEqual({ ok: false, message: 'Agora não' });
    expect(perform).not.toHaveBeenCalled();

    state = { status: 'busy', reason: 'Ocupado' };
    expect(item.interact()).toEqual({ ok: false, message: 'Ocupado' });

    state = { status: 'available', action: 'Fazer' };
    expect(item.interact()).toEqual({ ok: true, message: 'feito' });
    expect(perform).toHaveBeenCalledTimes(1);
  });
});

describe('mira por raycast', () => {
  function setup() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
    camera.position.set(0, 1.6, 0); // olhando para -Z
    camera.updateMatrixWorld();

    const machine = new THREE.Group();
    const part = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2));
    part.position.set(0, 1.6, -2);
    machine.add(part); // a malha é filha: o id vem do grupo
    tagInteractable(machine, 'maquina');
    scene.add(machine);

    const blocker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2));
    blocker.position.set(0, 1.6, -1);
    scene.add(blocker);
    scene.updateMatrixWorld(true);

    const system = new InteractionSystem([scene], 2.4);
    system.register(createInteractable({ id: 'maquina', name: 'Máquina', evaluate: () => ({ status: 'available', action: 'Ligar' }), perform: () => 'ligada' }));
    return { scene, camera, blocker, system };
  }

  it('não seleciona através de um objeto que bloqueia a visão', () => {
    const { camera, system } = setup();
    expect(system.update(camera)).toBeNull();
    expect(system.focusedId).toBeNull();
    expect(system.interact()).toBeNull();
  });

  it('seleciona quando nada está na frente e executa a ação', () => {
    const { camera, blocker, scene, system } = setup();
    scene.remove(blocker);
    expect(system.update(camera)).toMatchObject({ name: 'Máquina', status: 'available', action: 'Ligar' });
    expect(system.interact()).toEqual({ ok: true, message: 'ligada' });
  });

  it('respeita o alcance máximo', () => {
    const { camera, blocker, scene, system } = setup();
    scene.remove(blocker);
    camera.position.z = 2; // agora a máquina está a ~4 m
    camera.updateMatrixWorld();
    expect(system.update(camera)).toBeNull();
  });

  it('recusa ids duplicados', () => {
    const { system } = setup();
    expect(() => system.register(createInteractable({ id: 'maquina', name: 'Outra', evaluate: () => ({ status: 'available' }), perform: () => '' }))).toThrow(/duplicado/);
  });

  it('resolveTarget usa só o primeiro acerto e sobe na hierarquia', () => {
    const parent = new THREE.Group();
    tagInteractable(parent, 'pai');
    const child = new THREE.Object3D();
    parent.add(child);
    expect(findInteractableId(child)).toBe('pai');
    expect(resolveTarget([{ object: child }])).toBe('pai');
    expect(resolveTarget([{ object: new THREE.Object3D() }, { object: child }])).toBeNull();
    expect(resolveTarget([])).toBeNull();
  });
});
