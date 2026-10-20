import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 3 do GDD: as 15 peças aparecem no painel de inspeção, o estado
 * persiste durante a sessão, peças incompatíveis são rejeitadas por regra de
 * domínio e a interface não mostra o estado real antes de ser descoberto.
 */
const panel = (page: Page) => page.getByTestId('inspection-panel');
const row = (page: Page, slot: string) => page.locator(`.part-row[data-slot="${slot}"]`);

async function openInspection(page: Page) {
  await aim(page, AIM.carSide);
  await expect(page.getByTestId('interact-prompt')).toContainText('Inspecionar veículo');
  await pressInteract(page);
  await expect(panel(page)).toBeVisible();
  expect((await diag(page)).state).toBe('panel');
  // O painel abre no diagnóstico; estes testes são da aba de peças.
  await page.keyboard.press('Digit4');
  await expect(page.getByTestId('parts-section')).toBeVisible();
}

async function op(page: Page, operation: Parameters<NonNullable<Window['__GAME_TEST_HOOKS__']>['vehicleOp']>[0]) {
  return page.evaluate((o) => window.__GAME_TEST_HOOKS__!.vehicleOp(o), operation);
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startPlaying(page);
});

test('painel lista as 15 peças com o que se sabe delas, sem vazar o estado real', async ({ page }, info) => {
  const errors = watchErrors(page);
  await aim(page, AIM.carSide);
  await expect(page.getByTestId('interact-prompt')).toContainText('2009 · 148.320 km');
  await openInspection(page);

  await expect(page.locator('.part-row')).toHaveCount(15);
  await expect(page.getByTestId('panel-progress')).toHaveText('3 de 15 peças com estado conhecido');
  await expect(panel(page)).toContainText('Ventura Brisa 1.6');
  await expect(panel(page)).toContainText('TMP0A01');
  await expect(panel(page)).toContainText('Vinho');
  await expect(panel(page)).toContainText('Revisão na oficina do tio');

  // Desconhecido continua desconhecido; o conhecido mostra a avaliação da época.
  await expect(row(page, 'freios.pastilhas-dianteiras')).toContainText('Não avaliada');
  await expect(row(page, 'motor.correia-dentada')).toContainText('Não avaliada');
  await expect(row(page, 'rodas.pneus')).toContainText('Boa');

  // Nada do estado real nem do histórico oculto aparece na tela.
  const text = (await panel(page).innerText()).toLowerCase();
  expect(text).not.toContain('leilão');
  expect(text).not.toMatch(/crítica|gasta|falhou/);
  expect(text).not.toMatch(/85[.,]9|80[.,]9/);

  // Detalhe de uma peça: catálogo compatível com preço e tempo de troca.
  await row(page, 'freios.pastilhas-dianteiras').click();
  const detail = page.getByTestId('part-detail');
  await expect(detail).toContainText('Pastilhas de freio dianteiras');
  await expect(detail).toContainText('Não identificada');
  await expect(detail).toContainText('R$ 129,00');
  await expect(detail).toContainText('troca em 45 min');
  await expect(detail).toContainText('Por fora');

  // Teclado: seta para baixo vai para a próxima peça.
  await page.keyboard.press('ArrowDown');
  await expect(detail).toContainText('Discos de freio dianteiros');
  await info.attach('painel', { body: await page.screenshot(), contentType: 'image/png' });

  // O relógio não anda com o painel aberto.
  const clock = (await diag(page)).clock;
  await page.waitForTimeout(1500);
  expect((await diag(page)).clock).toBe(clock);

  // E fecha e volta ao jogo — e o mesmo E não reabre o painel.
  await page.keyboard.press('KeyE');
  await expect(panel(page)).toBeHidden();
  await waitFrames(page, 10);
  expect((await diag(page)).state).toBe('playing');
  expect((await diag(page)).panelOpen).toBe(false);
  expect(errors).toEqual([]);
});

test('estado muda só por regra de domínio, persiste na sessão e incompatíveis são rejeitadas', async ({ page }) => {
  const errors = watchErrors(page);
  await openInspection(page);

  // Peça na posição errada, de outro modelo/ano ou por cima de outra: recusada, nada muda.
  const version = (await diag(page)).vehicle.sessionVersion;
  expect(await op(page, { kind: 'install', slot: 'eletrica.bateria', partId: 'pastilha-freio-diant-ventura-brisa' })).toMatchObject({ ok: false, code: 'posicao-errada' });
  expect(await op(page, { kind: 'install', slot: 'eletrica.bateria', partId: 'bateria-60ah-brasaco' })).toMatchObject({ ok: false, code: 'posicao-ocupada' });
  expect(await op(page, { kind: 'install', slot: 'motor.turbo', partId: 'bateria-60ah-brasaco' })).toMatchObject({ ok: false, code: 'posicao-inexistente' });
  expect(await op(page, { kind: 'setWear', slot: 'eletrica.bateria', wear: 140 })).toMatchObject({ ok: false, code: 'desgaste-invalido' });
  expect((await diag(page)).vehicle.sessionVersion).toBe(version);

  // Revelar o estado das pastilhas: o painel aberto se atualiza sozinho.
  expect(await op(page, { kind: 'reveal', slot: 'freios.pastilhas-dianteiras' })).toEqual({ ok: true });
  await expect(row(page, 'freios.pastilhas-dianteiras')).toContainText('Crítica');
  await expect(page.getByTestId('panel-progress')).toHaveText('4 de 15 peças com estado conhecido');

  // Trocar a bateria por uma usada: o mecanico sabe o estado do que instalou.
  expect(await op(page, { kind: 'remove', slot: 'eletrica.bateria' })).toEqual({ ok: true });
  await expect(row(page, 'eletrica.bateria')).toContainText('Removida');
  expect(await op(page, { kind: 'install', slot: 'eletrica.bateria', partId: 'bateria-60ah-brasaco', condition: 'usada', wear: 55 })).toEqual({ ok: true });
  await expect(row(page, 'eletrica.bateria')).toContainText('Gasta');
  await row(page, 'eletrica.bateria').click();
  await expect(page.getByTestId('part-detail')).toContainText('instalada nesta oficina');
  await expect(panel(page)).toContainText('Instalada: Bateria 60 Ah');

  // Fecha, pausa, volta, reabre: tudo continua igual (estado vive na sessão, não na cena).
  await page.keyboard.press('KeyE');
  await expect(panel(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-primary')).toHaveText('Continuar');
  await startPlaying(page, false);
  await openInspection(page);
  await expect(row(page, 'freios.pastilhas-dianteiras')).toContainText('Crítica');
  await expect(row(page, 'eletrica.bateria')).toContainText('Gasta');

  const real = (await page.evaluate(() => window.__GAME_TEST_HOOKS__!.vehicleState())) as { parts: Record<string, { wear: number; condition: string }> };
  expect(real.parts['eletrica.bateria']).toMatchObject({ wear: 55, condition: 'usada' });
  expect(errors).toEqual([]);
});

test('Esc no painel pausa; novo jogo recomeça com o carro de demonstração original', async ({ page }) => {
  const errors = watchErrors(page);
  await openInspection(page);
  await op(page, { kind: 'reveal', slot: 'motor.correia-dentada' });
  await expect(row(page, 'motor.correia-dentada')).toContainText('Crítica');

  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(page.getByTestId('menu-primary')).toHaveText('Continuar');
  expect((await diag(page)).state).toBe('paused');

  await page.getByRole('button', { name: 'Sair para o menu inicial' }).click();
  await startPlaying(page, true);
  await openInspection(page);
  await expect(row(page, 'motor.correia-dentada')).toContainText('Não avaliada');
  await expect(page.getByTestId('panel-progress')).toHaveText('3 de 15 peças com estado conhecido');

  // O botão também fecha o painel.
  await page.getByTestId('panel-close').click();
  await expect(panel(page)).toBeHidden();
  await waitFrames(page, 5);
  expect((await diag(page)).state).toBe('playing');
  expect(errors).toEqual([]);
});
