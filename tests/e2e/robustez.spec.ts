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
