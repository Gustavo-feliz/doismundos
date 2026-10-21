import { expect, test } from '@playwright/test';
import { AIM, aim, diag, openGame, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 24 (GDD §20.4): remapeamento de teclas, tamanho do texto e modo
 * daltônico valem na hora, aparecem na tela e sobrevivem ao recarregar.
 */
test('remapear "interagir" para Q, texto maior e modo daltônico — e tudo continua depois de recarregar', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await page.getByRole('button', { name: 'Configurações' }).click();

  // Remapeia: clica na ação, aperta Q.
  await page.locator('[data-rebind="interact"]').click();
  await expect(page.locator('[data-rebind="interact"]')).toHaveText('Aperte uma tecla…');
  await page.keyboard.press('KeyQ');
  await expect(page.locator('[data-rebind="interact"]')).toHaveText('Q');
  await expect(page.getByTestId('rebind-message')).toContainText('Interagir: Q');

  // Tecla que já é de outra ação: troca as duas.
  await page.locator('[data-rebind="openMap"]').click();
  await page.keyboard.press('KeyQ');
  await expect(page.locator('[data-rebind="openMap"]')).toHaveText('Q');
  await expect(page.locator('[data-rebind="interact"]')).toHaveText('M');
  // Desfaz e deixa "interagir" no Q de novo.
  await page.locator('[data-rebind="interact"]').click();
  await page.keyboard.press('KeyQ');
  await expect(page.locator('[data-rebind="interact"]')).toHaveText('Q');
  await expect(page.locator('[data-rebind="openMap"]')).toHaveText('M');

  // Reservada: Esc cancela, número é recusado.
  await page.locator('[data-rebind="run"]').click();
  await page.keyboard.press('Digit3');
  await expect(page.getByTestId('rebind-message')).toContainText('reservada');

  // Texto maior e modo daltônico.
  const before = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await page.locator('#set-text').fill('1.3');
  await page.locator('#set-text').dispatchEvent('change');
  await page.locator('#set-color').selectOption('deuteranopia');
  const after = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(after).toBeGreaterThan(before * 1.25);
  await expect(page.locator('html')).toHaveAttribute('data-color-vision', 'deuteranopia');
  // A cor de "ok" muda para azul (sem vermelho × verde).
  const ok = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ok').trim());
  expect(ok).toBe('#3a9ad9');

  // Recarrega: tudo continua.
  await page.reload();
  await page.waitForFunction(() => (window.__GAME_DIAGNOSTICS__?.frame ?? 0) > 5);
  await expect(page.locator('html')).toHaveAttribute('data-color-vision', 'deuteranopia');
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeCloseTo(after, 0);

  // No jogo: a mira mostra Q e o Q abre a ficha do carro (o E não abre mais).
  await startPlaying(page);
  await aim(page, AIM.carSide);
  await expect(page.getByTestId('interact-prompt')).toContainText('Q');
  await page.keyboard.press('KeyE');
  await waitFrames(page, 3);
  expect((await diag(page)).panelOpen).toBe(false);
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('inspection-panel')).toBeVisible();
  // O botão de fechar mostra a tecla certa e o Q fecha o painel.
  await expect(page.getByTestId('panel-close')).toContainText('Q');
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('inspection-panel')).toBeHidden();
  expect(errors).toEqual([]);
});
