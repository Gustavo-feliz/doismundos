import { expect, test } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, waitFrames, watchErrors } from './helpers';

/** Prompt 24: com a OS aprovada, o computador compra tudo o que falta em 1 clique. */
test('comprar o que falta: um clique encomenda as peças da OS no fornecedor escolhido', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);

  // Diagnóstico e orçamento da OS 001 (urgente, para o Marcão aceitar).
  await aim(page, AIM.carSide);
  await pressInteract(page);
  await page.locator('.test-item[data-test-id="visual:freios.pastilhas-dianteiras"] button').click();
  await page.locator('input[name="hipotese"][value="freios.pastilhas-dianteiras"]').check();
  await page.getByTestId('conclude').click();
  await page.getByTestId('go-quote').click();
  await page.locator('#quote-urgent').check();
  await page.getByTestId('send-quote').click();
  await expect(page.getByTestId('order-status')).toHaveText('Aprovada: pronta para o reparo');
  await page.keyboard.press('KeyE');

  // Computador: o cartão mostra o que falta e as duas opções.
  await aim(page, AIM.computer);
  await pressInteract(page);
  const card = page.getByTestId('buy-missing');
  await expect(card).toContainText('Falta para a OS #001: 1 peça(s)');
  await expect(card).toContainText('Pastilhas de freio dianteiras');
  await expect(card.locator('[data-buy-missing]')).toHaveCount(2);
  const cash = (await diag(page)).cash;
  await card.locator('[data-buy-missing="autopecas-bairro"]').click();

  // Encomendado: o caixa baixou, o cartão some e o pedido aparece a caminho.
  await expect(card).toHaveCount(0);
  await waitFrames(page, 3);
  expect((await diag(page)).cash).toBeLessThan(cash);
  await page.keyboard.press('Digit2');
  await expect(page.getByTestId('computer-panel')).toContainText('A caminho');
  expect(errors).toEqual([]);
});
