import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, watchErrors } from './helpers';

/**
 * Prompt 9 do GDD: salvar, recarregar a página e continuar; sobrescrever e
 * excluir com confirmação; save corrompido recuperado ou recusado; autosave.
 */
const slot = (page: Page, id: string) => page.locator(`.save-slot[data-slot="${id}"]`);
const menuMessage = (page: Page) => page.locator('.menu-message');

/** Avança a OS 001 até a contraproposta (estado com bastante coisa). */
async function playSomething(page: Page) {
  await aim(page, AIM.carSide);
  await pressInteract(page);
  await page.locator('.test-item[data-test-id="visual:freios.pastilhas-dianteiras"] button').click();
  await page.locator('input[name="hipotese"][value="freios.pastilhas-dianteiras"]').check();
  await page.getByTestId('conclude').click();
  await page.getByTestId('go-quote').click();
  await page.getByTestId('send-quote').click();
  await expect(page.getByTestId('order-status')).toHaveText('Contraproposta do cliente');
  await page.keyboard.press('KeyE');
}

async function openSaves(page: Page, mode: 'save' | 'load') {
  await page.getByTestId(mode === 'save' ? 'menu-save' : 'menu-load').click();
  await expect(page.getByTestId('save-slots')).toBeVisible();
}

/** Escreve direto no IndexedDB (para simular arquivo corrompido). */
async function writeRaw(page: Page, key: string, value: string) {
  await page.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('simulador-mecanico', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('saves');
        open.onsuccess = () => {
          const tx = open.result.transaction('saves', 'readwrite');
          tx.objectStore('saves').put(v, k);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value],
  );
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startPlaying(page);
});

test('salvar no slot 1, recarregar a página e continuar exatamente de onde parou', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await playSomething(page);
  await page.keyboard.press('Escape');
  const before = await diag(page);

  await openSaves(page, 'save');
  await slot(page, 'slot1').getByRole('button', { name: 'Salvar aqui' }).click(); // vazio: sem confirmação
  await expect(menuMessage(page)).toHaveText('Jogo salvo no slot 1.');
  await expect(slot(page, 'slot1')).toHaveAttribute('data-state', 'ok');
  await expect(slot(page, 'slot1')).toContainText('OS #001 · Contraproposta do cliente');

  // Recarrega a página: tudo some da memória.
  await page.reload();
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
  await expect(page.getByTestId('menu-continue')).toBeVisible();
  expect((await diag(page)).order.status).toBe('diagnostico'); // jogo novo na memória

  await page.evaluate(() => window.__GAME_TEST_HOOKS__!.bypassPointerLock());
  await openSaves(page, 'load');
  await slot(page, 'slot1').getByRole('button', { name: 'Carregar' }).click();
  await expect(slot(page, 'slot1')).toContainText('O progresso não salvo será perdido');
  await slot(page, 'slot1').locator('[data-confirm="load"]').click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');

  const after = await diag(page);
  expect(after.order.status).toBe('contraproposta');
  expect(after.cash).toBe(before.cash);
  expect(after.clock).toBe(before.clock);
  expect(after.player.x).toBeCloseTo(before.player.x, 3);
  expect(after.diagnosis.evidence).toBe(before.diagnosis.evidence);
  // E o jogo continua: dá para seguir negociando.
  await aim(page, AIM.carSide);
  await pressInteract(page);
  await page.locator('#quote-urgent').check();
  await page.getByTestId('send-quote').click();
  await expect(page.getByTestId('order-status')).toHaveText('Aprovada: pronta para o reparo');
  expect(errors).toEqual([]);
});

test('sobrescrever e excluir pedem confirmação; autosave só grava quando algo mudou', async ({ page }) => {
  const errors = watchErrors(page);
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.autosaveNow())).toBe(false); // jogo intocado
  await playSomething(page);
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.autosaveNow())).toBe(true);
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.autosaveNow())).toBe(false); // nada mudou

  await page.keyboard.press('Escape');
  await openSaves(page, 'save');
  await expect(slot(page, 'auto')).toHaveAttribute('data-state', 'ok');
  await slot(page, 'slot2').getByRole('button', { name: 'Salvar aqui' }).click();
  await expect(menuMessage(page)).toHaveText('Jogo salvo no slot 2.');

  await slot(page, 'slot2').getByRole('button', { name: 'Sobrescrever' }).click();
  await expect(slot(page, 'slot2')).toContainText('Sobrescrever o slot 2?');
  await slot(page, 'slot2').getByRole('button', { name: 'Cancelar' }).click();
  await slot(page, 'slot2').getByRole('button', { name: 'Sobrescrever' }).click();
  await slot(page, 'slot2').locator('[data-confirm="save"]').click();
  await expect(menuMessage(page)).toHaveText('Jogo salvo no slot 2.');

  await slot(page, 'slot2').getByRole('button', { name: 'Excluir' }).click();
  await expect(slot(page, 'slot2')).toContainText('Não dá para desfazer');
  await slot(page, 'slot2').locator('[data-confirm="delete"]').click();
  await expect(slot(page, 'slot2')).toHaveAttribute('data-state', 'vazio');
  expect(errors).toEqual([]);
});

test('save corrompido: recupera da cópia de segurança; sem cópia, recusa sem quebrar', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await playSomething(page);
  await page.keyboard.press('Escape');
  await openSaves(page, 'save');
  await slot(page, 'slot3').getByRole('button', { name: 'Salvar aqui' }).click();
  await expect(menuMessage(page)).toHaveText('Jogo salvo no slot 3.');
  await slot(page, 'slot3').getByRole('button', { name: 'Sobrescrever' }).click();
  await slot(page, 'slot3').locator('[data-confirm="save"]').click(); // agora existe slot3.bak
  await expect(menuMessage(page)).toHaveText('Jogo salvo no slot 3.');

  await writeRaw(page, 'slot3', '{"schemaVersion":1,"cortado no meio');
  await writeRaw(page, 'slot1', 'lixo total');
  await page.getByRole('button', { name: '← Voltar' }).last().click();
  await openSaves(page, 'load');
  await expect(slot(page, 'slot3')).toHaveAttribute('data-state', 'recuperavel');
  await expect(slot(page, 'slot1')).toHaveAttribute('data-state', 'corrompido');
  await expect(slot(page, 'slot1').getByRole('button', { name: 'Carregar' })).toHaveCount(0);

  await page.evaluate(() => window.__GAME_TEST_HOOKS__!.bypassPointerLock());
  await slot(page, 'slot3').getByRole('button', { name: 'Carregar' }).click();
  await slot(page, 'slot3').locator('[data-confirm="load"]').click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');
  expect((await diag(page)).order.status).toBe('contraproposta');
  await expect(page.getByTestId('hud-saved')).toHaveText('Carregado da cópia de segurança');
  expect(errors).toEqual([]);
});
