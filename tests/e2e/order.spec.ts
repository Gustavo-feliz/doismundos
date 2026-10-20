import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, setLift, startPlaying, watchErrors } from './helpers';

/**
 * Prompts 5 e 6 do GDD — demonstração completa de uma OS pela interface:
 * cliente → sintoma → diagnóstico → orçamento → decisão do cliente → peça no
 * estoque → reparo com dependências → teste final → conclusão.
 */
const panel = (page: Page) => page.getByTestId('inspection-panel');
const stock = (page: Page) => page.getByTestId('stock-panel');
const notice = (page: Page) => page.getByTestId('panel-notice').first();
const brl = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

async function openCar(page: Page, lifted = false) {
  await aim(page, lifted ? AIM.carSideLifted : AIM.carSide);
  await expect(page.getByTestId('interact-prompt')).toContainText('Inspecionar veículo');
  await pressInteract(page);
  await expect(panel(page)).toBeVisible();
}

async function closeAny(page: Page) {
  await page.keyboard.press('KeyE');
  await expect(panel(page)).toBeHidden();
  await expect(stock(page)).toBeHidden();
}

async function openStock(page: Page) {
  await aim(page, AIM.stockShelf);
  await expect(page.getByTestId('interact-prompt')).toContainText('Estoque de peças');
  await pressInteract(page);
  await expect(stock(page)).toBeVisible();
}

async function diagnoseAndQuote(page: Page, tests: string[], slot: string) {
  for (const id of tests) {
    await page.locator(`.test-item[data-test-id="${id}"] button`).click();
    await expect(page.locator(`.test-item[data-test-id="${id}"]`)).toHaveAttribute('data-status', 'feito');
  }
  await page.locator(`input[name="hipotese"][value="${slot}"]`).check();
  await page.getByTestId('conclude').click();
  await page.getByTestId('go-quote').click();
  await expect(page.getByTestId('quote-tab')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startPlaying(page);
});

test('OS 001 de ponta a ponta: negociação de prazo, peça errada tratada, reparo e conclusão', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openCar(page);
  await diagnoseAndQuote(page, ['visual:freios.pastilhas-dianteiras', 'teste-frenagem'], 'freios.pastilhas-dianteiras');

  // Orçamento padrão: valores da UI = fórmula (peças 167,70 + mão de obra 90,00 + descarte 10,00).
  await expect(page.getByTestId('quote-total')).toHaveText(brl(267_70));
  await expect(page.getByTestId('quote-deadline')).toContainText('Pronto em até 5 h');
  await expect(page.getByTestId('quote-tab')).toContainText('Motorista de aplicativo');
  await page.getByTestId('send-quote').click();
  await expect(page.getByTestId('proposals')).toContainText('Contraproposta');
  await expect(page.getByTestId('proposals')).toContainText('Preciso dele em até 4 h');
  await expect(page.getByTestId('order-status')).toHaveText('Contraproposta do cliente');
  await expect(page.getByTestId('accept-counter')).toHaveCount(0); // não é só preço

  // Urgente: +30% sobre a mão de obra, prazo menor.
  await page.locator('#quote-urgent').check();
  await expect(page.getByTestId('quote-lines')).toContainText('Taxa de urgência');
  await expect(page.getByTestId('quote-total')).toHaveText(brl(294_70));
  await page.getByTestId('send-quote').click();
  await expect(page.getByTestId('proposals').locator('li').first()).toContainText('Aceitou');
  const order = (await diag(page)).order;
  expect(order).toMatchObject({ status: 'aprovada', approvedTotal: 294_70 });
  await info.attach('orcamento', { body: await page.screenshot(), contentType: 'image/png' });

  // Serviço: precisa do carro no alto para tirar a roda.
  await page.keyboard.press('Digit3');
  await expect(page.getByTestId('service-tab')).toContainText('Requer o carro no alto do elevador');
  await closeAny(page);
  await setLift(page, 'extended');

  // Pega a peça ERRADA no estoque (bateria) e tenta instalar.
  await openStock(page);
  await expect(page.getByTestId('stock-list')).toContainText('Comprada para a OS #001');
  await page.locator('[data-take="bateria-60ah-brasaco"]').click();
  await expect(page.getByTestId('stock-held')).toHaveText('Bateria 60 Ah');
  await closeAny(page);
  await expect(page.getByTestId('hud-held')).toHaveText('Bateria 60 Ah');

  await openCar(page, true);
  await page.keyboard.press('Digit3');
  await page.locator('[data-action="remove"][data-slot="freios.pastilhas-dianteiras"]').click();
  await expect(page.locator('.repair-item[data-slot="freios.pastilhas-dianteiras"]')).toContainText('✓ Feito');
  await page.locator('[data-action="install"][data-slot="freios.pastilhas-dianteiras"]').click();
  await expect(notice(page)).toContainText('Peça errada');
  expect((await diag(page)).order.invalidAttempts).toBe(1);
  await closeAny(page);

  // Devolve a bateria, pega as pastilhas da OS.
  await openStock(page);
  await page.getByTestId('return-part').click();
  await page.locator('[data-take="pastilha-freio-diant-ventura-brisa"][data-order="001"]').click();
  await expect(page.getByTestId('stock-held')).toHaveText('Pastilhas de freio dianteiras');
  await closeAny(page);

  await openCar(page, true);
  await page.keyboard.press('Digit3');
  await page.locator('[data-action="install"][data-slot="freios.pastilhas-dianteiras"]').click();
  await expect(page.locator('.repair-item[data-slot="freios.pastilhas-dianteiras"]')).toContainText('✓ Pastilhas de freio dianteiras');
  await expect(page.getByTestId('complete')).toBeDisabled(); // falta o teste final

  // Teste final exige o carro no chão: tentar antes só avisa (sem penalidade).
  await page.getByTestId('final-test-btn').click();
  await expect(notice(page)).toContainText('carro no chão');
  expect((await diag(page)).order.invalidAttempts).toBe(1);
  await closeAny(page);
  await setLift(page, 'retracted');

  await openCar(page);
  await page.keyboard.press('Digit3');
  await page.getByTestId('final-test-btn').click();
  await expect(page.getByTestId('final-test')).toContainText('o chiado sumiu');
  await page.getByTestId('complete').click();
  await expect(page.getByTestId('completion')).toContainText('Qualidade: Excelente (90/100)');
  expect((await diag(page)).order).toMatchObject({ status: 'concluida', quality: 'excelente' });
  await info.attach('servico-concluido', { body: await page.screenshot(), contentType: 'image/png' });
  await expect(page.getByTestId('next-case')).toBeVisible();
  await closeAny(page);
  await expect(page.getByTestId('hud-objective')).toContainText('OS #001 encerrada');
  expect(errors).toEqual([]);
});

test('OS 002: contraproposta de preço aceita vira desconto negociado na mesma fórmula', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openCar(page);
  await diagnoseAndQuote(page, ['scanner'], 'freios.pastilhas-dianteiras');
  await page.getByTestId('dismiss').click();
  await expect(page.getByTestId('order-status')).toHaveText('Encerrada sem serviço');
  await page.getByTestId('next-case').click();
  await page.keyboard.press('Digit1');

  await diagnoseAndQuote(page, ['scanner'], 'arrefecimento.valvula-termostatica');
  await expect(page.getByTestId('quote-total')).toHaveText(brl(197_37));
  await page.getByTestId('send-quote').click();
  await expect(page.getByTestId('proposals')).toContainText('Consigo pagar R$');
  await page.getByTestId('accept-counter').click();
  await expect(page.getByTestId('quote-lines')).toContainText('Desconto negociado');
  await expect(page.getByTestId('quote-total')).toHaveText(brl(180_00));
  expect((await diag(page)).order).toMatchObject({ status: 'aprovada', approvedTotal: 180_00 });
  expect(errors).toEqual([]);
});
