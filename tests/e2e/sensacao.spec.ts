import { expect, test, type Page } from '@playwright/test';
import { diag, openGame, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 25 (sensação de jogo): a câmera balança ao andar e
 * "reduzir movimento" desliga o balanço e a inclinação.
 */
async function walkAndMeasure(page: Page): Promise<{ bob: number; roll: number }> {
  // Volta ao ponto de partida, olhando para dentro da oficina.
  await page.evaluate(() => window.__GAME_TEST_HOOKS__!.teleport(0.8, 6.6, 0.18, 0));
  await waitFrames(page, 2);
  let bob = 0;
  let roll = 0;
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 12; i++) {
    await waitFrames(page, 3);
    const f = (await diag(page)).feel;
    bob = Math.max(bob, Math.abs(f.bob));
    roll = Math.max(roll, Math.abs(f.roll));
  }
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  return { bob, roll };
}

test('câmera: balança ao andar; "reduzir movimento" desliga balanço e inclinação', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);

  const normal = await walkAndMeasure(page);
  expect((await diag(page)).player.speed).toBeGreaterThanOrEqual(0);
  expect(normal.bob).toBeGreaterThan(0.005);
  expect(normal.roll).toBeGreaterThan(0.0005);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.locator('#set-motion').check();
  await startPlaying(page, false);
  await waitFrames(page, 20); // o que sobrou do balanço amortece

  const calm = await walkAndMeasure(page);
  expect(calm.bob).toBe(0);
  expect(calm.roll).toBe(0);
  expect(errors).toEqual([]);
});
