import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, watchErrors } from './helpers';

/**
 * Prompt 4 do GDD: o jogador coleta evidências com exames (que gastam tempo),
 * as hipóteses mudam por regra, e a interface não vaza o defeito nem diz se o
 * diagnóstico registrado estava certo.
 */
const panel = (page: Page) => page.getByTestId('inspection-panel');
const tab = (page: Page) => page.getByTestId('diagnosis-tab');
const testItem = (page: Page, id: string) => page.locator(`.test-item[data-test-id="${id}"]`);
const notice = (page: Page) => page.getByTestId('panel-notice');

async function openPanel(page: Page) {
  await aim(page, AIM.carSide);
  await pressInteract(page);
  await expect(panel(page)).toBeVisible();
  await expect(tab(page)).toBeVisible();
}

async function closePanel(page: Page) {
  await page.keyboard.press('KeyE');
  await expect(panel(page)).toBeHidden();
}

async function runTest(page: Page, id: string) {
  await testItem(page, id).getByRole('button').click();
  await expect(testItem(page, id)).toHaveAttribute('data-status', 'feito');
}

async function conclude(page: Page, slot: string) {
  await page.locator(`input[name="hipotese"][value="${slot}"]`).check();
  await page.getByTestId('conclude').click();
  await expect(page.getByTestId('os-result')).toBeVisible();
}

function minutesOf(clock: string): number {
  const [, d, hh, mm] = /Dia (\d+) (\d+):(\d+)/.exec(clock)!;
  return Number(d) * 1440 + Number(hh) * 60 + Number(mm);
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startPlaying(page);
});

test('OS 001: exames geram evidências, gastam tempo e levam à causa — sem vazar nada antes', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openPanel(page);
  await expect(tab(page)).toContainText('OS #001 · 1 de 3');
  await expect(page.getByTestId('complaint')).toContainText('barulho feio quando eu freio');
  await expect(page.getByTestId('conclude')).toBeDisabled();
  await expect(tab(page)).toContainText('Faça pelo menos um exame');

  // Antes dos exames, nenhum resultado aparece.
  const before = (await tab(page).innerText()).toLowerCase();
  expect(before).not.toMatch(/crítica|metálico|t-128|e-562/); // "chiado" aparece na fala do cliente
  await expect(testItem(page, 'visual:suspensao.amortecedores-dianteiros')).toContainText('Requer o carro no alto do elevador');

  // Dica do Seu Zé aponta um exame, não a resposta.
  await page.getByTestId('hint').click();
  await expect(tab(page)).toContainText('Eu começaria olhando as pastilhas');

  // Inspeção visual das pastilhas: evidência + 10 min no relógio.
  const t0 = minutesOf((await diag(page)).clock);
  await runTest(page, 'visual:freios.pastilhas-dianteiras');
  await expect(notice(page)).toContainText('+10 min');
  await expect(page.getByTestId('evidence')).toContainText('crítica');
  await expect.poll(async () => minutesOf((await diag(page)).clock)).toBeGreaterThanOrEqual(t0 + 10);

  // A peça avaliada aparece na aba de peças.
  await page.keyboard.press('Digit4');
  await expect(page.locator('.part-row[data-slot="freios.pastilhas-dianteiras"]')).toContainText('Crítica');
  await page.keyboard.press('Digit1');

  // Scanner deste carro mostra códigos de outros sistemas (não é a queixa).
  await runTest(page, 'scanner');
  await expect(page.getByTestId('evidence')).toContainText('T-128');
  await runTest(page, 'teste-frenagem');
  await expect(page.getByTestId('evidence')).toContainText('Chiado metálico');

  const top = page.locator('.hyp-row').first();
  await expect(top).toHaveAttribute('data-slot', 'freios.pastilhas-dianteiras');
  await expect(top).toContainText('Confiança alta');
  await info.attach('diagnostico', { body: await page.screenshot(), contentType: 'image/png' });

  // Registrar: a interface não diz se acertou.
  await conclude(page, 'freios.pastilhas-dianteiras');
  const result = (await page.getByTestId('os-result').innerText()).toLowerCase();
  expect(result).toContain('diagnóstico registrado: pastilhas');
  expect(result).not.toMatch(/correto|incorreto|errado|acertou/);
  expect((await diag(page)).diagnosis.records).toEqual([{ caseId: 'os-001-freio', chosenSlot: 'freios.pastilhas-dianteiras', correct: true }]);

  // Depois do diagnóstico vem o orçamento; dispensando o cliente, a OS fecha e vem a próxima.
  await page.getByTestId('go-quote').click();
  await expect(page.getByTestId('quote-tab')).toBeVisible();
  await page.getByTestId('dismiss').click();
  await page.getByTestId('next-case').click();
  await page.keyboard.press('Digit1');
  await expect(tab(page)).toContainText('OS #002 · 2 de 3');
  await expect(page.getByTestId('complaint')).toContainText('ferveu duas vezes');
  await closePanel(page);
  await aim(page, AIM.carSide);
  await expect(page.getByTestId('interact-prompt')).toContainText('2011 · 96.400 km');
  await expect(page.getByTestId('hud-objective')).toContainText('OS #002');
  expect(errors).toEqual([]);
});

test('diagnóstico errado é registrado igual; exame que exige capô aberto libera depois de abrir', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = watchErrors(page);
  await openPanel(page);
  await runTest(page, 'scanner');
  await conclude(page, 'freios.discos-dianteiros'); // causa errada
  await expect(page.getByTestId('os-result')).toContainText('Diagnóstico registrado: Discos');
  expect((await diag(page)).diagnosis.records[0]).toMatchObject({ chosenSlot: 'freios.discos-dianteiros', correct: false });

  await page.getByTestId('go-quote').click();
  await page.getByTestId('dismiss').click();
  await page.getByTestId('next-case').click();
  await page.keyboard.press('Digit1');
  await expect(testItem(page, 'teste-temperatura')).toHaveAttribute('data-status', 'bloqueado');
  await expect(testItem(page, 'teste-temperatura')).toContainText('Requer o capô aberto');

  // Fecha o painel, abre o capô, volta.
  await closePanel(page);
  await aim(page, AIM.hood);
  await pressInteract(page);
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.equipment.hood === 'extended', null, { timeout: 5000 });
  await openPanel(page);
  await expect(testItem(page, 'teste-temperatura')).toHaveAttribute('data-status', 'disponivel');
  await runTest(page, 'teste-temperatura');
  await expect(page.getByTestId('evidence')).toContainText('mangueira de cima do radiador continua fria');
  await runTest(page, 'visual:arrefecimento.valvula-termostatica');
  await expect(page.getByTestId('evidence')).toContainText('não conclui');
  expect(errors).toEqual([]);
});

test('sem assistência, não há botão de dica', async ({ page }) => {
  const errors = watchErrors(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.locator('#set-assist').uncheck();
  await startPlaying(page, false);
  await openPanel(page);
  await expect(page.getByTestId('hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});
