import { describe, expect, it } from 'vitest';
import { keyLabel, rebind, resolveBindings, sanitizeOverrides } from '../../src/core/bindings';
import { DEFAULT_BINDINGS, MOUSE_LEFT } from '../../src/data/controls';
import { DEFAULT_SETTINGS, parseSettings } from '../../src/save/settings';

describe('remapeamento de teclas (Prompt 24)', () => {
  it('sem trocas, o mapa é o de fábrica', () => {
    expect(resolveBindings({})).toEqual(DEFAULT_BINDINGS);
  });

  it('a tecla nova vira a principal e as alternativas de fábrica continuam', () => {
    const r = rebind({}, 'interact', 'KeyQ');
    expect(r).toMatchObject({ ok: true, swappedWith: null });
    if (!r.ok) return;
    expect(resolveBindings(r.overrides).interact).toEqual(['KeyQ', MOUSE_LEFT]);
    const fwd = rebind({}, 'forward', 'KeyZ');
    expect(fwd.ok && resolveBindings(fwd.overrides).forward).toEqual(['KeyZ', 'ArrowUp']);
  });

  it('tecla que já é de outra ação: as duas trocam e nenhuma fica sem tecla', () => {
    const r = rebind({}, 'interact', 'KeyF'); // F era "voltar à oficina"
    expect(r).toMatchObject({ ok: true, swappedWith: 'exitDrive' });
    if (!r.ok) return;
    const b = resolveBindings(r.overrides);
    expect(b.interact[0]).toBe('KeyF');
    expect(b.exitDrive[0]).toBe('KeyE');
  });

  it('teclas reservadas (Esc, números das abas e respostas) são recusadas', () => {
    expect(rebind({}, 'interact', 'Escape')).toMatchObject({ ok: false });
    expect(rebind({}, 'interact', 'Digit2')).toMatchObject({ ok: false, reason: '2 é reservada pelo jogo.' });
    expect(rebind({}, 'choice1', 'KeyQ')).toMatchObject({ ok: false });
  });

  it('voltar para a tecla de fábrica limpa a troca do save', () => {
    const a = rebind({}, 'run', 'KeyC');
    const b = a.ok ? rebind(a.overrides, 'run', 'ShiftLeft') : a;
    expect(b.ok && b.overrides).toEqual({});
  });

  it('trocas vindas do armazenamento são conferidas (lixo é descartado, duplicadas não ficam)', () => {
    expect(sanitizeOverrides({ interact: 'KeyQ', voar: 'KeyV', run: 42, forward: 'Escape' })).toEqual({ interact: 'KeyQ' });
    const dup = sanitizeOverrides({ interact: 'KeyQ', openMap: 'KeyQ' });
    const b = resolveBindings(dup);
    expect(new Set([b.interact[0], b.openMap[0]]).size).toBe(2);
    expect(sanitizeOverrides('lixo')).toEqual({});
  });

  it('nomes de tecla para a tela (teclado ABNT2)', () => {
    expect(keyLabel('KeyE')).toBe('E');
    expect(keyLabel('Space')).toBe('Espaço');
    expect(keyLabel('Semicolon')).toBe('Ç');
    expect(keyLabel('Digit7')).toBe('7');
  });
});

describe('configurações novas (Prompt 24)', () => {
  it('padrão sensato e valores estranhos voltam ao padrão sem quebrar', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ textScale: 1, colorVision: 'normal', fpsLimit: 0, timeSpeed: 1, keyBindings: {} });
    const s = parseSettings({ ...DEFAULT_SETTINGS, textScale: 9, colorVision: 'roxo', fpsLimit: 45, timeSpeed: 3, keyBindings: { interact: 'KeyQ' } });
    expect(s).toMatchObject({ textScale: 1.5, colorVision: 'normal', fpsLimit: 0, timeSpeed: 1, keyBindings: { interact: 'KeyQ' } });
  });

  it('preferências antigas (sem os campos novos) recebem o padrão', () => {
    const old = { schemaVersion: 1, mouseSensitivity: 1.4, invertY: true, fov: 80, reduceMotion: false, quality: 'media', diagnosisAssist: true, sfxVolume: 0.3 };
    expect(parseSettings(old)).toMatchObject({ mouseSensitivity: 1.4, invertY: true, textScale: 1, colorVision: 'normal', keyBindings: {} });
  });
});
