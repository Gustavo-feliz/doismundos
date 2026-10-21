import { expect, test } from '@playwright/test';
import { AIM, aim, openGame, pressInteract, startPlaying, watchErrors } from './helpers';

/** Prompt 12 do GDD: enciclopédia simples com os 10 carros, peças por modelo/ano e serviços. */
test('catálogo: 10 modelos, peças por ano e serviços com ferramenta exigida', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);
  await aim(page, AIM.computer);
  await pressInteract(page);
  await expect(page.getByTestId('computer-panel')).toBeVisible();
  await page.keyboard.press('Digit6');

  await expect(page.locator('.catalog-model')).toHaveCount(10);
  await expect(page.getByTestId('catalog-detail')).toContainText('Ventura Brisa 1.6');

  // Compatibilidade por ano: o Jaguara tem amortecedor diferente a partir de 2019.
  await page.locator('[data-model="tupa-jaguara-20"]').click();
  await expect(page.getByTestId('catalog-detail')).toContainText('SUV · 2015–2022');
  await expect(page.getByTestId('catalog-parts')).toContainText('Amortecedores dianteiros Jaguara 2019+ (par)');
  await expect(page.getByTestId('catalog-parts')).toContainText('2015–2018');

  await expect(page.getByTestId('catalog-services')).toContainText('Frente afunda ao frear');
  await expect(page.getByTestId('catalog-services')).toContainText('exige Chave de impacto nível 1');
  await info.attach('catalogo', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});
