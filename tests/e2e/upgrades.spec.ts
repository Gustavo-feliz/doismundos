import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 11 do GDD: comprar ferramentas e upgrades no computador, ver o
 * antes/depois, sentir o efeito no jogo e manter tudo depois de salvar/carregar.
 */
const computer = (page: Page) => page.getByTestId('computer-panel');
const card = (page: Page, id: string) => page.locator(`[data-upgrade-card="${id}"]`);
const slot = (page: Page, id: string) => page.locator(`.save-slot[data-slot="${id}"]`);

async function openWorkshopTab(page: Page) {
  await aim(page, AIM.computer);
  await pressInteract(page);
  await expect(computer(page)).toBeVisible();
  await page.keyboard.press('Digit5');
  await expect(page.getByTestId('upgrades')).toBeVisible();
}

test('upgrade: compra com antes/depois, efeito no estoque e persistência no save', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);

  await openWorkshopTab(page);
  await expect(page.getByTestId('upgrade-compare-organizacao-estoque')).toHaveText('Pegar peça na estante: 6 min → 4 min (−35%)');
  // Nível 3 exige reputação: ainda nem dá para ver, porque o nível 1 vem antes.
  await expect(page.getByTestId('upgrade-blocked-organizacao-estoque')).toHaveCount(0);
  await info.attach('oficina', { body: await page.screenshot(), contentType: 'image/png' });

  const cash = (await diag(page)).cash;
  await card(page, 'organizacao-estoque').getByRole('button', { name: /Comprar nível 1/ }).click();
  await expect(card(page, 'organizacao-estoque')).toHaveAttribute('data-level', '1');
  await expect(page.getByTestId('upgrade-compare-organizacao-estoque')).toContainText('4 min → 2 min (−65%)');
  expect((await diag(page)).cash).toBe(cash - 150_00);
  await page.keyboard.press('Digit3');
  await expect(page.getByTestId('ledger')).toContainText('Organização do estoque: nível 1');
  await page.keyboard.press('KeyE');
  await expect(computer(page)).toBeHidden();

  // Efeito no jogo: pegar peça na estante agora leva 4 min, não 6.
  await aim(page, AIM.stockShelf);
  await pressInteract(page);
  await expect(page.getByTestId('stock-panel')).toBeVisible();
  await page.locator('[data-take]').first().click();
  await expect(page.getByTestId('stock-panel')).toContainText('(+4 min)');
  await page.getByTestId('return-part').click();
  await page.keyboard.press('KeyE');

  // Salvar, recarregar e carregar: o nível continua.
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-save').click();
  await slot(page, 'slot3').getByRole('button', { name: 'Salvar aqui' }).click();
  await expect(page.locator('.menu-message')).toHaveText('Jogo salvo no slot 3.');
  await page.reload();
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
  await page.evaluate(() => window.__GAME_TEST_HOOKS__!.bypassPointerLock());
  await page.getByTestId('menu-load').click();
  await slot(page, 'slot3').getByRole('button', { name: 'Carregar' }).click();
  await slot(page, 'slot3').locator('[data-confirm="load"]').click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');
  await waitFrames(page, 3);
  expect((await diag(page)).upgrades).toMatchObject({ 'organizacao-estoque': 1 });
  await openWorkshopTab(page);
  await expect(card(page, 'organizacao-estoque')).toHaveAttribute('data-level', '1');
  expect(errors).toEqual([]);
});
