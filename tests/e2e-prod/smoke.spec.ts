import { expect, test } from '@playwright/test';

/**
 * Fumaça do build de produção (GDD Prompt 18): abre, joga, carrega os módulos
 * sob demanda (test drive e bairro) e não tem erro no console.
 */
test('build de produção: abre, entra no jogo, test drive e bairro carregam, sem erros', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?debug');
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
  await expect(page.getByRole('button', { name: /Iniciar|Novo jogo/ }).first()).toBeVisible();
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.startWithoutPointerLock(true))).toBe('playing');

  // Test drive: carrega o chunk do pátio.
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.startTestDrive())).toBe('driving');
  await expect(page.getByTestId('drive-hud')).toBeVisible();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');

  // Bairro: carrega o chunk da cidade (tecla M sai para a rua).
  await page.keyboard.press('KeyM');
  await expect(page.getByTestId('city-hud')).toBeVisible();

  const perf = await page.evaluate(() => window.__GAME_DIAGNOSTICS__!.renderer);
  test.info().annotations.push({ type: 'desempenho (bairro)', description: `${perf.calls} chamadas de desenho · ${perf.triangles} triângulos · ${perf.textures} texturas` });
  expect(errors).toEqual([]);
});
