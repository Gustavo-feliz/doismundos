import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_VERSION, shortVersion } from '../../src/core/version';

describe('versão do jogo', () => {
  it('é a mesma do package.json (o menu mostra a versão certa)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { version: string };
    expect(GAME_VERSION).toBe(pkg.version);
  });

  it('o menu mostra só maior.menor', () => {
    expect(shortVersion('0.2.0')).toBe('0.2');
    expect(shortVersion('1.10.3')).toBe('1.10');
  });
});
