import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus';
import { GameClock } from '../../src/core/GameClock';
import { GameStateMachine } from '../../src/core/GameState';

describe('GameClock', () => {
  const make = () => new GameClock({ startMinuteOfDay: 8 * 60, minutesPerRealSecond: 1 });

  it('começa no horário configurado do dia 1', () => {
    const clock = make();
    expect(clock.day).toBe(1);
    expect(clock.formatTime()).toBe('08:00');
  });

  it('avança e vira o dia', () => {
    const clock = make();
    clock.advance(65);
    expect(clock.formatTime()).toBe('09:05');
    clock.advance(16 * 60);
    expect(clock.day).toBe(2);
    expect(clock.formatTime()).toBe('01:05');
  });

  it('ignora deltas inválidos', () => {
    const clock = make();
    clock.advance(-10);
    clock.advance(Number.NaN);
    clock.advance(Infinity);
    expect(clock.formatTime()).toBe('08:00');
  });

  it('reset volta ao início', () => {
    const clock = make();
    clock.advance(500);
    clock.reset();
    expect(clock.formatTime()).toBe('08:00');
    expect(clock.day).toBe(1);
  });

  it('rejeita configuração inválida', () => {
    expect(() => new GameClock({ startMinuteOfDay: 24 * 60, minutesPerRealSecond: 1 })).toThrow(RangeError);
    expect(() => new GameClock({ startMinuteOfDay: 0, minutesPerRealSecond: 0 })).toThrow(RangeError);
  });
});

describe('GameStateMachine', () => {
  it('segue o fluxo menu → jogando → pausado → jogando', () => {
    const changes: string[] = [];
    const sm = new GameStateMachine((from, to) => changes.push(`${from}>${to}`));
    expect(sm.current).toBe('loading');
    expect(sm.transition('menu')).toBe(true);
    expect(sm.transition('playing')).toBe(true);
    expect(sm.transition('paused')).toBe(true);
    expect(sm.transition('playing')).toBe(true);
    expect(changes).toEqual(['loading>menu', 'menu>playing', 'playing>paused', 'paused>playing']);
  });

  it('recusa transições inválidas sem mudar de estado nem notificar', () => {
    const onChange = vi.fn();
    const sm = new GameStateMachine(onChange);
    expect(sm.transition('playing')).toBe(false); // loading → playing não pode
    sm.transition('menu');
    onChange.mockClear();
    expect(sm.transition('paused')).toBe(false); // menu → paused não pode
    expect(sm.transition('menu')).toBe(false); // mesmo estado não notifica
    expect(sm.current).toBe('menu');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('erro é terminal', () => {
    const sm = new GameStateMachine();
    sm.transition('menu');
    expect(sm.transition('error')).toBe(true);
    expect(sm.transition('menu')).toBe(false);
    expect(sm.is('error')).toBe(true);
  });

  it('painel: abre só jogando, volta ao jogo ou pausa', () => {
    const sm = new GameStateMachine();
    sm.transition('menu');
    expect(sm.transition('panel')).toBe(false);
    sm.transition('playing');
    expect(sm.transition('panel')).toBe(true);
    expect(sm.transition('menu')).toBe(false);
    expect(sm.transition('playing')).toBe(true);
    sm.transition('panel');
    expect(sm.transition('paused')).toBe(true);
  });

  it('pausado pode voltar ao menu', () => {
    const sm = new GameStateMachine();
    sm.transition('menu');
    sm.transition('playing');
    sm.transition('paused');
    expect(sm.transition('menu')).toBe(true);
  });
});

describe('EventBus', () => {
  interface Events {
    ping: { n: number };
    other: string;
  }

  it('entrega o payload só para o tipo certo', () => {
    const bus = new EventBus<Events>();
    const ping = vi.fn();
    const other = vi.fn();
    bus.on('ping', ping);
    bus.on('other', other);
    bus.emit('ping', { n: 1 });
    expect(ping).toHaveBeenCalledWith({ n: 1 });
    expect(other).not.toHaveBeenCalled();
  });

  it('a função retornada por on() remove o ouvinte', () => {
    const bus = new EventBus<Events>();
    const handler = vi.fn();
    const off = bus.on('ping', handler);
    off();
    bus.emit('ping', { n: 2 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('um ouvinte pode se remover durante o emit sem pular os outros', () => {
    const bus = new EventBus<Events>();
    const calls: string[] = [];
    const off = bus.on('ping', () => {
      calls.push('a');
      off();
    });
    bus.on('ping', () => calls.push('b'));
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
