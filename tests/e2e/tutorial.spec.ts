import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 10 do GDD: tutorial com o Seu Zé. Objetivo sempre visível, dicas
 * dispensáveis, diálogo com escolha registrada, progresso que sobrevive a
 * salvar e carregar, e a dívida do banco no computador.
 */
const dialogue = (page: Page) => page.getByTestId('hud-dialogue');
const mission = async (page: Page) => (await diag(page)).mission;
const slot = (page: Page, id: string) => page.locator(`.save-slot[data-slot="${id}"]`);

/** Pula falas com Enter até aparecerem as opções de resposta. */
async function skipToChoice(page: Page) {
  for (let i = 0; i < 6 && !(await mission(page)).awaitingChoice; i++) {
    await page.keyboard.press('Enter');
    await waitFrames(page, 2);
  }
  await expect(page.getByTestId('dialogue-options')).toBeVisible();
}

test('tutorial: prólogo com escolha, passos guiados, dicas dispensáveis e progresso após salvar/carregar', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);

  // Começo: prólogo na legenda, objetivo do passo 1, dica e destaque no carro.
  await expect(dialogue(page)).toContainText('Primeiro dia na oficina do tio Tonhão');
  await expect(page.getByTestId('hud-objective-label')).toHaveText('Primeiro dia na oficina · passo 1 de 8');
  await expect(page.getByTestId('hud-objective')).toHaveText('Ande até o carro de Marcão no box 1');
  await expect(page.getByTestId('hud-objective-os')).toContainText('OS #001');
  await expect(page.getByTestId('hud-tip')).toBeVisible();
  expect(await mission(page)).toMatchObject({ id: 'tutorial-primeiro-dia', step: 'andar', tips: true, dialogue: 'prologo', highlight: 'carro' });
  await info.attach('tutorial-inicio', { body: await page.screenshot(), contentType: 'image/png' });

  // Escolha "eu me viro": as dicas somem (consequência registrada) e o Seu Zé responde.
  await skipToChoice(page);
  await page.keyboard.press('Digit2');
  await expect(dialogue(page)).toContainText('aperta H');
  await expect(page.getByTestId('hud-tip')).toBeHidden();
  expect(await mission(page)).toMatchObject({ tips: false, highlight: null });
  // H traz as dicas de volta.
  await page.keyboard.press('KeyH');
  await expect(page.getByTestId('hud-tip')).toBeVisible();
  expect((await mission(page)).highlight).toBe('carro');

  // Andar até o carro e abrir a ficha avançam os passos.
  await aim(page, AIM.carSide);
  await expect.poll(async () => (await mission(page)).step).toBe('abrir-ficha');
  await pressInteract(page);
  await expect(page.getByTestId('inspection-panel')).toBeVisible();
  await expect.poll(async () => (await mission(page)).step).toBe('diagnosticar');
  await page.keyboard.press('KeyE');

  // Salvar no slot 2, recarregar a página e carregar: o tutorial continua do mesmo passo.
  await page.keyboard.press('Escape');
  await page.getByTestId('menu-save').click();
  await slot(page, 'slot2').getByRole('button', { name: 'Salvar aqui' }).click();
  await expect(page.locator('.menu-message')).toHaveText('Jogo salvo no slot 2.');
  await page.reload();
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
  await page.evaluate(() => window.__GAME_TEST_HOOKS__!.bypassPointerLock());
  await page.getByTestId('menu-load').click();
  await slot(page, 'slot2').getByRole('button', { name: 'Carregar' }).click();
  await slot(page, 'slot2').locator('[data-confirm="load"]').click();
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');
  await waitFrames(page, 3);
  expect(await mission(page)).toMatchObject({ id: 'tutorial-primeiro-dia', step: 'diagnosticar', tips: true });
  await expect(page.getByTestId('hud-objective')).toContainText('Descubra a causa do defeito');

  // Computador: a dívida do banco aparece na aba Caixa e dá para pagar a parcela.
  await aim(page, AIM.computer);
  await pressInteract(page);
  await expect(page.getByTestId('computer-panel')).toBeVisible();
  await page.keyboard.press('Digit3');
  await expect(page.getByTestId('debt-due')).toContainText('vence no fim do dia 3');
  await expect(page.getByTestId('debt-balance')).toHaveText(/4\.800,00/);
  const cash = (await diag(page)).cash;
  await page.getByTestId('debt-pay').click();
  await expect(page.getByTestId('debt-balance')).toHaveText(/4\.400,00/);
  expect((await diag(page)).cash).toBe(cash - 400_00);
  expect((await diag(page)).debt.paidCount).toBe(1);
  await expect(page.getByTestId('ledger')).toContainText('Parcela 1 do empréstimo');
  await info.attach('banco', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});
