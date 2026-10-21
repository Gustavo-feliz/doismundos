import { expect, test } from '@playwright/test';
import { aimFrom, diag, openGame, pressInteract, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 14 do GDD: bairro pequeno com oficina, loja de peças, ferro-velho,
 * banco e lanchonete; mapa com marcadores; carregamento sob demanda; trânsito
 * e pedestres controlados; navegação, colisão, transições de local e retorno
 * à oficina, com medição de FPS, tempo de carregamento e memória.
 */
test('bairro e locais: sai da oficina, navega e colide, visita os locais pelos marcadores e volta à oficina', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);
  const before = await diag(page);

  // Mira na porta lateral de saída para o bairro (x = 4.6, z = 9.0) e sai para a rua.
  await aimFrom(page, 4.6, 7.5, Math.PI, -0.15);
  await expect(page.getByTestId('interact-prompt')).toContainText('Ir para a Rua das Oficinas');
  await pressInteract(page);
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.city?.active === true);

  await expect(page.getByTestId('city-hud')).toBeVisible();
  for (const id of ['oficina', 'loja-pecas', 'ferro-velho', 'banco', 'lanchonete']) {
    await expect(page.getByTestId(`city-marker-${id}`)).toBeVisible();
  }

  // Navegação a pé e colisão com prédio (tenta atravessar a parede da Oficina em z = 12).
  await aimFrom(page, 0, 11.4, Math.PI, 0);
  await page.keyboard.down('KeyW');
  await waitFrames(page, 18);
  await page.keyboard.up('KeyW');
  const afterWalk = await diag(page);
  expect(afterWalk.player.z).toBeLessThan(12.0); // barrado pelo colisor do prédio

  // Trânsito para quando o jogador está na faixa de pedestres central.
  await aimFrom(page, -4.5, 1.85, 0, 0);
  await waitFrames(page, 10);
  const cityDiag = (await diag(page)).city!;
  expect(cityDiag.trafficCount).toBe(2);
  expect(cityDiag.pedestrianCount).toBe(3);

  // 1) Transição para a Loja de Peças pelo marcador do mapa -> abre a Loja do computador.
  await page.getByTestId('city-marker-loja-pecas').click();
  await expect(page.getByTestId('computer-panel')).toBeVisible();
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('computer-panel')).toBeHidden();

  // 2) Transição para o Banco -> abre a aba Caixa/Dívida do computador.
  await page.getByTestId('city-marker-banco').click();
  await expect(page.getByTestId('computer-panel')).toBeVisible();
  await expect(page.getByTestId('computer-body')).toContainText('Empréstimo do banco');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('computer-panel')).toBeHidden();

  // 3) Transição para o Ferro-Velho do Tião -> garimpa uma peça para o estoque.
  await page.getByTestId('city-marker-ferro-velho').click();
  await expect(page.getByTestId('city-location-panel')).toBeVisible();
  await expect(page.getByTestId('salvage-list').locator('li')).toHaveCount(3);
  await page.getByTestId('salvage-list').locator('button').first().click();
  await expect(page.getByTestId('city-panel-notice')).toContainText('Garimpo:');
  await page.getByTestId('city-panel-close').click();
  await expect(page.getByTestId('city-location-panel')).toBeHidden();

  // 4) Transição para a Lanchonete da Tia Léa -> pede um café coado.
  await page.getByTestId('city-marker-lanchonete').click();
  await expect(page.getByTestId('city-location-panel')).toBeVisible();
  const cashBeforeSnack = (await diag(page)).cash;
  await page.getByTestId('buy-snack-cafe-coado').click();
  await expect(page.getByTestId('city-panel-notice')).toContainText('Café coado');
  expect((await diag(page)).cash).toBe(cashBeforeSnack - 4_50);
  await page.getByTestId('city-panel-close').click();

  await info.attach('bairro-sao-cristovao', { body: await page.screenshot(), contentType: 'image/png' });
  const perfSnap = await diag(page);
  const cPerf = perfSnap.city!;
  expect(cPerf.visited).toEqual(expect.arrayContaining(['oficina', 'loja-pecas', 'banco', 'ferro-velho', 'lanchonete']));
  expect(cPerf.loadedLocations).toEqual(expect.arrayContaining(['oficina', 'loja-pecas', 'banco', 'ferro-velho', 'lanchonete']));

  // 5) Retorno à oficina (tecla F ou marcador da oficina).
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.city === null);
  await expect(page.getByTestId('city-hud')).toBeHidden();
  const returned = await diag(page);
  expect(returned.state).toBe('playing');
  expect(returned.order.status).toBe(before.order.status);

  const memText = cPerf.memoryMb !== null ? `${cPerf.memoryMb} MB JS heap` : 'memória não exposta pelo navegador';
  info.annotations.push({
    type: 'desempenho-bairro',
    description: `carregado em ${cPerf.loadMs} ms · ${cPerf.fps} FPS · ${perfSnap.renderer.calls} draw calls · ${perfSnap.renderer.triangles} triângulos · ${memText}`,
  });
  expect(errors).toEqual([]);
});
