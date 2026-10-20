import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { diag, openGame, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Smoke test da fundação (Prompt 1 do GDD): a cena abre, dá para iniciar,
 * andar, olhar, pausar, voltar e sair sem erros no console.
 *
 * O navegador headless não captura o mouse (Pointer Lock), então o teste
 * entra no jogo pelo gancho __GAME_TEST_HOOKS__ (só existe em dev/?debug).
 * A captura real do mouse precisa ser verificada à mão — ver README.
 */

/** Confere que o canvas tem imagem de verdade (não está preto/vazio). */
async function canvasHasContent(page: Page) {
  const png = PNG.sync.read(await page.locator('#game-canvas').screenshot());
  const buckets = new Set<string>();
  let min = 255;
  let max = 0;
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let i = 0; i < png.width * png.height; i += stride) {
    const o = i * 4;
    const r = png.data[o]!;
    const g = png.data[o + 1]!;
    const b = png.data[o + 2]!;
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  return { variance: max - min, colors: buckets.size };
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

test('abre na tela inicial com a cena renderizada e sem erros', async ({ page }, info) => {
  const errors = watchErrors(page);
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('menu-primary')).toHaveText('Iniciar jogo');
  await expect(page.locator('#hud')).toBeHidden();
  expect((await diag(page)).state).toBe('menu');

  const sample = await canvasHasContent(page);
  expect(sample.variance, JSON.stringify(sample)).toBeGreaterThan(40);
  expect(sample.colors).toBeGreaterThan(20);

  // Instruções acessíveis pelo menu
  await page.getByRole('button', { name: 'Controles' }).click();
  await expect(page.getByRole('region', { name: 'Controles' })).toContainText('Pausar');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-primary')).toBeVisible();

  await info.attach('menu', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('anda, olha, colide com as paredes e o relógio avança', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startPlaying(page);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.getByTestId('hud-money')).toContainText('R$');
  await expect(page.getByTestId('hud-clock')).toContainText('Dia 1 · 08:0');

  const before = await diag(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  await waitFrames(page, 10);
  const after = await diag(page);
  // Spawn olha para o fundo da oficina (-Z).
  expect(after.player.z).toBeLessThan(before.player.z - 0.5);

  // Mouse gira a câmera.
  await page.mouse.move(640, 360);
  await page.mouse.move(740, 360, { steps: 5 });
  await waitFrames(page, 3);
  expect((await diag(page)).player.yaw).not.toBeCloseTo(after.player.yaw, 2);

  // Correndo para a direita por 3 s: a parede segura o jogador dentro da oficina.
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ShiftLeft');
  const wall = await diag(page);
  expect(wall.player.x).toBeLessThan(7);
  expect(wall.player.x).toBeGreaterThan(-7);
  expect(wall.player.z).toBeLessThan(9);
  expect(wall.player.z).toBeGreaterThan(-9);

  // 1 s real = 1 min de jogo: depois de ~4 s, não pode mais ser 08:00.
  expect(wall.clock).not.toBe('Dia 1 08:00');

  await info.attach('jogando', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('Esc pausa, o tempo para, continuar mantém a posição e dá para sair ao menu', async ({ page }) => {
  const errors = watchErrors(page);
  await startPlaying(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  await waitFrames(page, 10);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-primary')).toHaveText('Continuar');
  const paused = await diag(page);
  expect(paused.state).toBe('paused');

  // Teclas não movem o jogador e o relógio não anda enquanto pausado.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const stillPaused = await diag(page);
  expect(stillPaused.player.z).toBeCloseTo(paused.player.z, 5);
  expect(stillPaused.clock).toBe(paused.clock);

  await startPlaying(page, false);
  expect((await diag(page)).player.z).toBeCloseTo(paused.player.z, 5);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sair para o menu inicial' }).click();
  await expect(page.getByTestId('menu-primary')).toHaveText('Iniciar jogo');
  expect((await diag(page)).state).toBe('menu');

  // Novo jogo recomeça do início.
  await startPlaying(page, true);
  const fresh = await diag(page);
  expect(fresh.clock).toBe('Dia 1 08:00');
  expect(fresh.player.z).toBeGreaterThan(paused.player.z);
  expect(errors).toEqual([]);
});

test('configurações são salvas e sobrevivem ao recarregar', async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole('button', { name: 'Configurações' }).click();
  const fov = page.locator('#set-fov');
  await fov.fill('90');
  await expect(page.locator('output[for="set-fov"]')).toHaveText('90°');
  await page.locator('#set-quality').selectOption('baixa');

  await page.reload();
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
  await page.getByRole('button', { name: 'Configurações' }).click();
  await expect(page.locator('#set-fov')).toHaveValue('90');
  await expect(page.locator('#set-quality')).toHaveValue('baixa');

  await page.getByRole('button', { name: 'Restaurar padrão' }).click();
  await expect(page.locator('#set-fov')).toHaveValue('75');
  expect(errors).toEqual([]);
});

test('acompanha o redimensionamento da janela', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await waitFrames(page, 5);
  const small = (await diag(page)).canvas;
  expect(small.clientWidth).toBe(900);
  expect(small.clientHeight).toBe(600);
  await page.setViewportSize({ width: 1400, height: 800 });
  await waitFrames(page, 5);
  const big = (await diag(page)).canvas;
  expect(big.clientWidth).toBe(1400);
  expect(big.width).toBeGreaterThanOrEqual(1400);
  expect(errors).toEqual([]);
});
