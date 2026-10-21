import { expect, test } from '@playwright/test';
import { diag, openGame, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 23: jogo novo com nome e tratamento, abertura com legenda e
 * escolha, pular segurando Esc, e a escolha mudando a fala do Seu Zé.
 */
test('abertura: nome na história, escolha registrada, Esc pula e o tutorial usa a escolha', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openGame(page);
  await page.evaluate(() => window.__GAME_TEST_HOOKS__!.bypassPointerLock());

  // Novo jogo: nome e tratamento.
  await page.getByTestId('menu-primary').click();
  await page.getByTestId('setup-name').fill('  Bia  ');
  await page.getByTestId('setup-pronoun-ela').check();
  await page.getByTestId('start-story').click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'cutscene');

  // Letreiro, legenda e o nome na fala.
  await expect(page.getByTestId('cine-title')).toHaveText('Rio de Janeiro · 23h');
  await expect(page.getByTestId('cine-text')).toContainText('telefone toca');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cine-text')).toContainText('Bia?');

  // Enter avança até a escolha.
  for (let i = 0; i < 25 && !(await page.getByTestId('cine-options').isVisible()); i++) {
    await page.keyboard.press('Enter');
    await waitFrames(page, 2);
  }
  await expect(page.getByTestId('cine-text')).toContainText('E aí, sobrinha?');
  await page.keyboard.press('Digit1');
  await expect(page.getByTestId('cine-text')).toContainText('Tonhão ia gostar');

  // Segurar Esc 1 s pula o resto.
  await page.keyboard.down('Escape');
  await page.waitForTimeout(1300);
  await page.keyboard.up('Escape');
  await expect(page.getByTestId('intro-end')).toBeVisible();
  await page.getByTestId('intro-start').click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');
  await waitFrames(page, 3);
  expect((await diag(page)).profile).toEqual({ name: 'Bia', pronoun: 'ela', introChoice: 'reabrir', introSeen: true });
  await expect(page.getByTestId('cinematic')).toBeHidden();

  // A escolha muda a fala do Seu Zé no tutorial.
  for (let i = 0; i < 6 && !(await page.getByTestId('hud-dialogue').innerText()).includes('reabrir'); i++) {
    await page.keyboard.press('Enter');
    await waitFrames(page, 2);
  }
  await expect(page.getByTestId('hud-dialogue')).toContainText('Já que é pra reabrir, vamos fazer direito.');
  expect(errors).toEqual([]);
});

test('pular a abertura vai direto ao trabalho; o save guarda o perfil e não repete a abertura', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await page.evaluate(() => window.__GAME_TEST_HOOKS__!.bypassPointerLock());
  await page.getByTestId('menu-primary').click();
  await page.getByTestId('setup-name').fill('Tião');
  await page.getByTestId('skip-story').click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');
  await waitFrames(page, 3);
  expect((await diag(page)).profile).toMatchObject({ name: 'Tião', introSeen: true, introChoice: null }); // pulou: não repete
  expect((await diag(page)).cinematic).toBeNull();

  // Salva, recarrega e carrega: o perfil volta e o jogo cai direto no trabalho.
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-save').click();
  await page.locator('.save-slot[data-slot="slot1"]').getByRole('button', { name: 'Salvar aqui' }).click();
  await expect(page.locator('.menu-message')).toHaveText('Jogo salvo no slot 1.');
  await page.reload();
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
  await page.evaluate(() => window.__GAME_TEST_HOOKS__!.bypassPointerLock());
  await page.getByTestId('menu-load').click();
  await page.locator('.save-slot[data-slot="slot1"]').getByRole('button', { name: 'Carregar' }).click();
  await page.locator('.save-slot[data-slot="slot1"] [data-confirm="load"]').click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');
  await waitFrames(page, 3);
  expect((await diag(page)).profile).toMatchObject({ name: 'Tião' });
  expect((await diag(page)).cinematic).toBeNull();
  expect(errors).toEqual([]);
});
