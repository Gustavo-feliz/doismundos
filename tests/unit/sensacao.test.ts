import { describe, expect, it } from 'vitest';
import { aimAssistScale, CAMERA_FEEL, createCameraFeel, stepCameraFeel, type CameraFeelInput } from '../../src/player/cameraFeel';
import { FirstPersonController } from '../../src/player/FirstPersonController';
import { DEFAULT_SETTINGS, parseSettings } from '../../src/save/settings';
import { ACTION_LABELS, coinBurst, hashSeed, thanksLine } from '../../src/ui/feedbackText';

/** Prompt 25: sensação de jogo sem mudar regras. */
const walk = (over: Partial<CameraFeelInput> = {}): CameraFeelInput => ({ dt: 1 / 60, speed: 3, strafe: 0, yawDelta: 0, walkSpeed: 3, enabled: true, ...over });

describe('câmera: balanço e inclinação', () => {
  it('andando, a cabeça balança dentro da amplitude', () => {
    const s = createCameraFeel();
    let max = 0;
    for (let i = 0; i < 120; i++) max = Math.max(max, Math.abs(stepCameraFeel(s, walk()).bob));
    expect(max).toBeGreaterThan(0.01);
    expect(max).toBeLessThanOrEqual(CAMERA_FEEL.bobAmplitude * 1.4 + 1e-9);
  });

  it('andar de lado e virar inclinam a câmera, com limite', () => {
    const s = createCameraFeel();
    for (let i = 0; i < 120; i++) stepCameraFeel(s, walk({ strafe: 5, yawDelta: -0.2 }));
    expect(s.roll).toBeLessThan(0);
    expect(Math.abs(s.roll)).toBeLessThanOrEqual(CAMERA_FEEL.maxRoll + 1e-9);
  });

  it('desligada (reduzir movimento), balanço e inclinação voltam a zero sem tranco', () => {
    const s = createCameraFeel();
    for (let i = 0; i < 60; i++) stepCameraFeel(s, walk({ strafe: 4 }));
    expect(s.roll).not.toBe(0);
    const first = { ...stepCameraFeel(s, walk({ enabled: false, strafe: 4 })) };
    expect(first.roll).not.toBe(0); // amortece, não corta
    for (let i = 0; i < 120; i++) stepCameraFeel(s, walk({ enabled: false, strafe: 4 }));
    expect(s.bob).toBe(0);
    expect(s.roll).toBe(0);
  });

  it('o jogador com "reduzir movimento" anda sem balanço nem inclinação', () => {
    const p = new FirstPersonController([], { x: 0, z: 0, yaw: 0 });
    const look = { mouseSensitivity: 1, invertY: false, reduceMotion: true, cameraSway: true };
    for (let i = 0; i < 90; i++) p.update(1 / 60, { forward: 1, right: 1, run: false }, { x: 6, y: 0 }, look);
    expect(p.speed).toBeGreaterThan(1);
    expect(p.cameraFeel.bob).toBe(0);
    expect(p.cameraFeel.roll).toBe(0);
  });

  it('o jogador com o balanço ligado balança; a opção própria também desliga', () => {
    const on = new FirstPersonController([], { x: 0, z: 0, yaw: 0 });
    const off = new FirstPersonController([], { x: 0, z: 0, yaw: 0 });
    let moved = 0;
    for (let i = 0; i < 90; i++) {
      on.update(1 / 60, { forward: 1, right: 0, run: false }, { x: 0, y: 0 }, { mouseSensitivity: 1, invertY: false, reduceMotion: false, cameraSway: true });
      off.update(1 / 60, { forward: 1, right: 0, run: false }, { x: 0, y: 0 }, { mouseSensitivity: 1, invertY: false, reduceMotion: false, cameraSway: false });
      moved = Math.max(moved, Math.abs(on.cameraFeel.bob));
    }
    expect(moved).toBeGreaterThan(0.01);
    expect(off.cameraFeel.bob).toBe(0);
    // A posição não muda com o balanço: é só a câmera.
    expect(on.position.z).toBeCloseTo(off.position.z, 6);
  });

  it('mira assistida só desacelera sobre um interativo e com a opção ligada', () => {
    expect(aimAssistScale(true, true)).toBeLessThan(1);
    expect(aimAssistScale(false, true)).toBe(1);
    expect(aimAssistScale(true, false)).toBe(1);
  });
});

describe('preferências novas', () => {
  it('balanço e mira assistida vêm ligados e são validados', () => {
    expect(DEFAULT_SETTINGS.cameraSway).toBe(true);
    expect(DEFAULT_SETTINGS.aimAssist).toBe(true);
    const old = parseSettings({ schemaVersion: 1, mouseSensitivity: 1 });
    expect(old.cameraSway).toBe(true);
    expect(old.aimAssist).toBe(true);
    const bad = parseSettings({ schemaVersion: 1, cameraSway: 'sim', aimAssist: 0 });
    expect(bad.cameraSway).toBe(true);
    expect(bad.aimAssist).toBe(true);
    expect(parseSettings({ schemaVersion: 1, cameraSway: false, aimAssist: false })).toMatchObject({ cameraSway: false, aimAssist: false });
  });
});

describe('retorno das ações e recompensas', () => {
  it('toda ação tem ícone, texto de andamento e de fim', () => {
    for (const labels of Object.values(ACTION_LABELS)) {
      expect(labels.running.length).toBeGreaterThan(0);
      expect(labels.done.length).toBeGreaterThan(0);
    }
  });

  it('o agradecimento acompanha a nota e é estável pela semente', () => {
    expect(thanksLine(5, 1)).toBe(thanksLine(5, 1));
    const good = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => thanksLine(5, s)));
    expect(good.size).toBeGreaterThan(1); // varia entre serviços
    for (const s of [1, 2, 3, 4]) expect(thanksLine(1, s)).not.toMatch(/Valeu demais|primeira/);
  });

  it('moedas: mesma semente, mesmo efeito; sementes diferentes, efeitos diferentes', () => {
    expect(coinBurst(42, 7)).toEqual(coinBurst(42, 7));
    expect(coinBurst(42, 7)).not.toEqual(coinBurst(hashSeed('caso-2:002'), 7));
    for (const c of coinBurst(7, 7)) expect(Math.abs(c.dx)).toBeLessThanOrEqual(90);
  });
});
