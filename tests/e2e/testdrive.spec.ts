import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 13 do GDD: test drive pelo portão, painel com velocímetro e luzes,
 * colisão, recomeçar, voltar à oficina sem mexer nela, e medição de desempenho.
 */
const driving = (page: Page) => page.evaluate(() => window.__GAME_DIAGNOSTICS__!.driving);

test('test drive: sai pelo portão, acelera até o limite, bate, recomeça e volta à oficina intacta', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);
  const before = await diag(page);

  // Sair pelo portão (o pátio é carregado sob demanda).
  const t0 = Date.now();
  await aim(page, AIM.gate);
  await expect(page.getByTestId('interact-prompt')).toContainText('Fazer test drive');
  await pressInteract(page);
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'driving');
  const loadMs = Date.now() - t0;
  await expect(page.getByTestId('drive-hud')).toBeVisible();
  await expect(page.getByTestId('hud-objective')).toBeHidden();
  // Carro de demonstração: pastilhas críticas → luz de freio acesa.
  expect((await driving(page))!.lights).toContain('freio');

  // Acelera: a velocidade sobe e nunca passa de 60 km/h.
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.driving?.speedKmh ?? 0) > 25);
  await info.attach('test-drive', { body: await page.screenshot(), contentType: 'image/png' });
  const perf = (await diag(page)).renderer;
  // Segue reto até o muro do fundo e bate.
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.driving?.collisions ?? 0) > 0, undefined, { timeout: 15_000 });
  await page.keyboard.up('KeyW');
  const crashed = (await driving(page))!;
  expect(crashed.speedKmh).toBeLessThanOrEqual(60);
  await expect(page.getByTestId('drive-message')).toContainText('Batida');

  // R recomeça no ponto de partida.
  await page.keyboard.press('KeyR');
  await waitFrames(page, 3);
  const reset = (await driving(page))!;
  expect(reset).toMatchObject({ x: -24, z: 14, speedKmh: 0 });

  // F volta à oficina: tudo como estava, mais os km rodados no carro.
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');
  await waitFrames(page, 3);
  const after = await diag(page);
  expect(after.driving).toBeNull();
  expect(after.order.status).toBe(before.order.status);
  expect(after.cash).toBe(before.cash);
  expect(after.player.x).toBeCloseTo(AIM.gate[0], 1);
  expect(after.vehicle.mileageKm).toBeGreaterThan(before.vehicle.mileageKm);
  await expect(page.getByTestId('hud-notice')).toContainText('Test drive:');

  // Desempenho do pátio (registrado no relatório do teste).
  info.annotations.push({ type: 'desempenho', description: `pátio carregado em ${loadMs} ms · ${perf.calls} chamadas de desenho · ${perf.triangles} triângulos` });
  expect(errors).toEqual([]);
});

test('test drive: Esc pausa e continua dirigindo; sair ao menu descarta a volta', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.startTestDrive())).toBe('driving');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'paused');
  await expect(page.getByTestId('drive-hud')).toBeVisible();
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.startWithoutPointerLock(false))).toBe('driving');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'paused');
  await page.getByRole('button', { name: /Sair para o menu|Menu inicial|Voltar ao menu/ }).first().click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'menu');
  expect((await diag(page)).driving).toBeNull();
  expect(errors).toEqual([]);
});
