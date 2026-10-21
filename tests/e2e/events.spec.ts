import { expect, test } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, watchErrors } from './helpers';

test('Prompt 16: eventos de fiscalização e pressão local, escolhas recuperáveis, histórico e efeitos', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);

  const initial = await diag(page);

  // Abre o computador do escritório e vai para a aba Oficina
  await aim(page, AIM.computer);
  await pressInteract(page);
  await expect(page.getByTestId('computer-panel')).toBeVisible();
  await page.locator('.panel-tab[data-tab="oficina"]').click();
  await expect(page.getByTestId('event-catalog')).toBeVisible();

  // 1) Atende à fiscalização municipal (alvará e descarte de óleo)
  // No dia 1 o evento ainda não está liberado para o jogador: o gancho de teste força.
  await expect(page.locator('[data-trigger-event="fiscalizacao-alvara-seguranca"]')).toBeDisabled();
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.forceEvent('fiscalizacao-alvara-seguranca'))).toBe(true);
  await expect(page.getByTestId('active-event')).toBeVisible();
  await expect(page.getByTestId('active-event')).toHaveAttribute('data-event-category', 'fiscalizacao');

  // Escolhe quitar a taxa e renovar o selo na hora (R$ 160,00, +3 reputação)
  await page.locator('[data-event-option="regularizar-na-hora"]').click();
  await expect(page.getByTestId('active-event')).toHaveCount(0);

  const afterInspection = await diag(page);
  expect(afterInspection.cash).toBe(initial.cash - 160_00);
  expect(afterInspection.reputation).toBe(initial.reputation + 3);
  expect(afterInspection.events.historyCount).toBe(1);

  // 2) Atende ao encontro narrativo de pressão local no bairro
  // No dia 1 o evento ainda não está liberado para o jogador: o gancho de teste força.
  await expect(page.locator('[data-trigger-event="pressao-vigilancia-rua"]')).toBeDisabled();
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.forceEvent('pressao-vigilancia-rua'))).toBe(true);
  await expect(page.getByTestId('active-event')).toBeVisible();
  await expect(page.getByTestId('active-event')).toHaveAttribute('data-event-category', 'pressao-local');

  // Escolhe a alternativa comunitária sem gasto financeiro (R$ 0,00, +2 reputação)
  await page.locator('[data-event-option="mobilizar-comerciantes-seu-ze"]').click();
  await expect(page.getByTestId('active-event')).toHaveCount(0);

  const afterPressure = await diag(page);
  expect(afterPressure.cash).toBe(afterInspection.cash);
  expect(afterPressure.reputation).toBe(afterInspection.reputation + 2);
  expect(afterPressure.events.historyCount).toBe(2);
  expect(afterPressure.events.historyIds).toEqual([
    'fiscalizacao-alvara-seguranca',
    'pressao-vigilancia-rua',
  ]);

  // Confere que o histórico exibe os dois registros
  await expect(page.getByTestId('event-history').locator('li')).toHaveCount(2);

  // Persiste no save v5
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.autosaveNow())).toBe(true);
  expect(errors).toEqual([]);
});

