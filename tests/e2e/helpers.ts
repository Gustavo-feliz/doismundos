import { expect, type Page } from '@playwright/test';

/** Junta erros de console e exceções da página. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

export async function diag(page: Page) {
  return page.evaluate(() => window.__GAME_DIAGNOSTICS__!);
}

/** O diagnóstico é atualizado uma vez por quadro: espere alguns antes de ler. */
export async function waitFrames(page: Page, count: number) {
  const start = (await diag(page)).frame;
  await page.waitForFunction((target) => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > target, start + count);
}

export async function openGame(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
}

/** Entra no jogo sem capturar o mouse (o headless não captura). */
export async function startPlaying(page: Page, fresh = true) {
  const state = await page.evaluate((f) => window.__GAME_TEST_HOOKS__!.startWithoutPointerLock(f), fresh);
  expect(state).toBe('playing');
  await waitFrames(page, 3);
}

/** Posiciona o jogador e espera a mira atualizar. */
export async function aimFrom(page: Page, x: number, z: number, yaw: number, pitch: number) {
  await page.evaluate(([px, pz, py, pp]) => window.__GAME_TEST_HOOKS__!.teleport(px!, pz!, py!, pp!), [x, z, yaw, pitch]);
  await waitFrames(page, 3);
}

export async function pressInteract(page: Page) {
  await page.keyboard.press('KeyE');
  await waitFrames(page, 2);
}

/**
 * Pontos de mira (x, z, yaw, pitch) calculados a partir do layout da oficina
 * em src/world/Workshop.ts. yaw 0 = olhando para o fundo (-Z).
 */
export const AIM = {
  liftControl: [-3.7, 0.3, 0, -0.3],
  hood: [-1.6, 1.6, 0, -0.5],
  carSide: [0.4, -1.9, Math.PI / 2, -0.5], // vidro lateral traseiro
  underCarToLift: [-1.6, -1.2, Math.PI / 2, 0],
  lightSwitch: [-3.2, 8.3, Math.PI, -0.49],
  bench: [-4.1, -7.3, 0, -0.6],
  drawer: [0.6, -7.5, 0, -0.3],
  gate: [2.35, 8.3, Math.PI, -1.0],
  computer: [-5.4, 5.4, Math.PI, -0.48],
  floor: [0.8, 4, 0, -1.4],
  /** Lateral do carro quando ele está no alto do elevador (olhando para cima). */
  carSideLifted: [0.4, -1.9, Math.PI / 2, 0.35],
  /** Estante de peças (estoque), na parede da direita. */
  stockShelf: [5.2, -2.2, -Math.PI / 2, -0.2],
} as const;

export type Aim = readonly [number, number, number, number];
export const aim = (page: Page, a: Aim) => aimFrom(page, ...a);

/** Sobe ou desce o elevador pela botoeira e espera terminar. */
export async function setLift(page: Page, phase: 'extended' | 'retracted') {
  if ((await diag(page)).equipment.lift === phase) return;
  await aim(page, AIM.liftControl);
  await pressInteract(page);
  await page.waitForFunction((p) => window.__GAME_DIAGNOSTICS__?.equipment.lift === p, phase, { timeout: 8000 });
}
