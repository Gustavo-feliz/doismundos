import { expect, test } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * GDD §25, teste B: "asset falha ao carregar". O pátio de teste e o bairro
 * vêm sob demanda; se o arquivo não chegar, o jogo avisa e continua na oficina.
 */
test('asset que falha ao carregar: aviso claro, jogo continua na oficina', async ({ page }) => {
  const errors = watchErrors(page);
  // Bloqueia os módulos carregados sob demanda (dev: /src/world/*.ts; build: assets/*.js).
  await page.route(/(TestTrack|CityNeighborhood)[^/]*\.(ts|js)(\?.*)?$/, (route) => route.abort());
  await openGame(page);
  await startPlaying(page);

  await aim(page, AIM.gate);
  await pressInteract(page);
  await expect(page.getByTestId('hud-notice')).toContainText('Não foi possível carregar o pátio de teste');
  await waitFrames(page, 3);
  const after = await diag(page);
  expect(after.state).toBe('playing');
  expect(after.driving).toBeNull();

  // O jogo segue normal: dá para abrir o carro na oficina.
  await aim(page, AIM.carSide);
  await pressInteract(page);
  await expect(page.getByTestId('inspection-panel')).toBeVisible();
  // Só o aviso de rede esperado (console.warn), nenhum erro.
  expect(errors.filter((e) => !/Failed to fetch dynamically imported module|net::ERR_FAILED/.test(e))).toEqual([]);
});

test('carregamento lento: aparece a tela de carregamento honesta e some quando o pátio chega', async ({ page }) => {
  const errors = watchErrors(page);
  // Atrasa o módulo do pátio em 1,2 s (simula conexão lenta).
  await page.route(/TestTrack[^/]*\.(ts|js)(\?.*)?$/, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await openGame(page);
  await startPlaying(page);
  await aim(page, AIM.gate);
  await pressInteract(page);
  await expect(page.getByTestId('loading-overlay')).toBeVisible();
  await expect(page.getByTestId('loading-overlay')).toContainText('Abrindo o pátio de teste');
  await expect(page.getByTestId('loading-overlay')).toContainText('Seu Zé');
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'driving');
  await expect(page.getByTestId('loading-overlay')).toBeHidden();
  expect(errors).toEqual([]);
});
