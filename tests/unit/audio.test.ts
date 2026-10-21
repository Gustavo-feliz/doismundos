import { describe, expect, it } from 'vitest';
import { AudioMixer } from '../../src/audio/AudioMixer';
import { buildEngineConditionTones, buildVariedFoleyTones } from '../../src/audio/FoleyLibrary';
import { Sfx } from '../../src/audio/Sfx';
import { EventBus } from '../../src/core/EventBus';
import type { GameEvents } from '../../src/core/events';

describe('Prompt 25 (Áudio) — Mixer por barramentos, ducking, foley variado e som do motor', () => {
  it('controla os 6 barramentos independentes e aplica ducking na música durante diálogos', () => {
    const mixer = new AudioMixer();
    mixer.setBusVolume('master', 1.0);
    mixer.setBusVolume('music', 0.5);

    const before = mixer.snapshot();
    expect(before.musicDuckFactor).toBe(1.0);
    expect(before.effectiveMusicGain).toBeCloseTo(0.5, 3);

    mixer.triggerDialogueDucking(1500, 1000);
    const during = mixer.snapshot();
    expect(during.musicDuckFactor).toBe(0.35);
    expect(during.effectiveMusicGain).toBeLessThan(before.effectiveMusicGain);

    mixer.tickDucking(2600);
    const after = mixer.snapshot();
    expect(after.musicDuckFactor).toBe(1.0);
    expect(after.effectiveMusicGain).toBeCloseTo(0.5, 3);
  });

  it('aplica variação de pitch nos sons de foley consecutivos e distingue defeitos do motor', () => {
    const first = buildVariedFoleyTones('catraca', 0);
    const second = buildVariedFoleyTones('catraca', 1);
    expect(first[0]!.freq).not.toBe(second[0]!.freq);

    const normal = buildEngineConditionTones('normal');
    const misfire = buildEngineConditionTones('falha-ignicao');
    const beltSqueal = buildEngineConditionTones('correia-chiando');

    expect(misfire.some((t) => t.freq < 80)).toBe(true);
    expect(beltSqueal.some((t) => t.freq > 2500)).toBe(true);
    expect(beltSqueal.length).toBeGreaterThan(normal.length);
  });

  it('Sfx funciona em ambiente sem AudioContext (ou suspenso) e ativa ducking ao receber dialogue:line', () => {
    const sfx = new Sfx();
    const bus = new EventBus<GameEvents>();
    const cleanup = sfx.bindEvents(bus);

    expect(() => sfx.play('ok')).not.toThrow();
    expect(() => sfx.playFoley('chave-impacto')).not.toThrow();
    expect(() => sfx.playEngineCondition('falha-ignicao')).not.toThrow();
    expect(() => sfx.playMusicCue('entrega')).not.toThrow();

    bus.emit('dialogue:line', { speaker: 'seu-ze', text: 'Olha o barulho dessa correia!' });
    expect(sfx.mixer.snapshot().musicDuckFactor).toBe(0.35);

    // Eventos feedback:action e feedback:reward do Prompt 25
    expect(() => bus.emit('feedback:action', { kind: 'remover', minutes: 10 })).not.toThrow();
    bus.emit('upgrade:changed', { upgradeId: 'chave-impacto', level: 2 });
    expect(() => bus.emit('feedback:action', { kind: 'instalar', minutes: 8 })).not.toThrow();
    expect(() => bus.emit('feedback:action', { kind: 'exame', minutes: 5 })).not.toThrow();
    expect(() => bus.emit('feedback:action', { kind: 'compra', minutes: 0 })).not.toThrow();
    expect(() => bus.emit('feedback:action', { kind: 'entrega', minutes: 0 })).not.toThrow();
    expect(() => bus.emit('feedback:action', { kind: 'erro', minutes: 0 })).not.toThrow();
    expect(() => bus.emit('feedback:reward', { kind: 'pagamento', amount: 45_000 })).not.toThrow();
    expect(() => bus.emit('feedback:reward', { kind: 'reputacao', amount: 3 })).not.toThrow();
    expect(() => bus.emit('feedback:reward', { kind: 'reputacao', amount: -2 })).not.toThrow();
    expect(() => bus.emit('feedback:reward', { kind: 'missao' })).not.toThrow();

    cleanup();
    sfx.dispose();
  });
});

