import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, waitFrames, watchErrors } from './helpers';

/**
 * Prompt 2 do GDD: mira por raycast, ação por tecla, estados explícitos
 * (disponível / em uso / indisponível) e ações incompatíveis bloqueadas.
 */
const prompt = (page: Page) => page.getByTestId('interact-prompt');
const notice = (page: Page) => page.getByTestId('hud-notice');

async function waitEquipment(page: Page, key: 'lift' | 'hood' | 'drawer', phase: string, timeout = 8000) {
  await page.waitForFunction(([k, p]) => window.__GAME_DIAGNOSTICS__?.equipment[k as 'lift'] === p, [key, phase], { timeout });
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startPlaying(page);
});

test('elevador: sobe levando o carro, fica "em uso" enquanto move e não desce com o jogador embaixo', async ({ page }, info) => {
  test.setTimeout(45_000);
  const errors = watchErrors(page);

  await aim(page, AIM.liftControl);
  await expect(prompt(page)).toBeVisible();
  await expect(prompt(page)).toContainText('Elevador de 2 colunas');
  await expect(prompt(page)).toContainText('Abaixado');
  await expect(prompt(page)).toContainText('Subir elevador');
  await expect(prompt(page)).toHaveAttribute('data-status', 'available');

  await pressInteract(page);
  await expect(notice(page)).toHaveText('Elevador subindo');
  await expect(prompt(page)).toHaveAttribute('data-status', 'busy');
  await expect(prompt(page)).toContainText('Em uso');

  // Apertar de novo enquanto move não faz nada além de avisar.
  await pressInteract(page);
  await expect(notice(page)).toHaveText('Elevador em movimento');
  expect((await diag(page)).equipment.lift).toBe('extending');

  await waitEquipment(page, 'lift', 'extended');
  expect((await diag(page)).equipment.liftHeight).toBeCloseTo(1.75, 2);
  await info.attach('elevador-no-alto', { body: await page.screenshot(), contentType: 'image/png' });

  // Com o carro no alto dá para ficar embaixo dele, e aí o elevador não desce.
  await aim(page, AIM.underCarToLift);
  await expect.poll(async () => (await diag(page)).equipment.playerUnderCar).toBe(true);
  await expect(prompt(page)).toHaveAttribute('data-status', 'unavailable');
  await expect(prompt(page)).toContainText('Saia de baixo do carro');
  await pressInteract(page);
  await expect(notice(page)).toContainText('Saia de baixo do carro');
  expect((await diag(page)).equipment.lift).toBe('extended');

  // Saindo de baixo, desce normalmente.
  await aim(page, AIM.liftControl);
  await expect(prompt(page)).toContainText('Descer elevador');
  await pressInteract(page);
  await expect(notice(page)).toHaveText('Elevador descendo');
  await waitEquipment(page, 'lift', 'retracted');
  expect((await diag(page)).equipment.liftHeight).toBe(0);
  expect(errors).toEqual([]);
});

test('capô e elevador são incompatíveis: um bloqueia o outro', async ({ page }, info) => {
  test.setTimeout(45_000);
  const errors = watchErrors(page);

  await aim(page, AIM.hood);
  await expect(prompt(page)).toContainText('Capô');
  await expect(prompt(page)).toContainText('Abrir capô');
  await pressInteract(page);
  await waitEquipment(page, 'hood', 'extended');
  await info.attach('capo-aberto', { body: await page.screenshot(), contentType: 'image/png' });

  // Capô aberto: o elevador fica indisponível e o aviso explica por quê.
  await aim(page, AIM.liftControl);
  await expect(prompt(page)).toHaveAttribute('data-status', 'unavailable');
  await expect(prompt(page)).toContainText('Feche o capô');
  await pressInteract(page);
  await expect(notice(page)).toContainText('Feche o capô');
  await waitFrames(page, 10);
  expect((await diag(page)).equipment.lift).toBe('retracted');

  // Fecha o capô, sobe o elevador: agora o capô é que fica fora de alcance.
  await aim(page, AIM.hood);
  await pressInteract(page);
  await waitEquipment(page, 'hood', 'retracted');
  await aim(page, AIM.liftControl);
  await pressInteract(page);
  await waitEquipment(page, 'lift', 'extended');
  // O carro subiu: do mesmo ponto, a mira não alcança mais o capô.
  await aim(page, AIM.hood);
  expect((await diag(page)).interaction.focus).not.toBe('capo');
  expect(errors).toEqual([]);
});

test('luzes, luminária e gaveta alternam; segurar a tecla não repete a ação; clique também interage', async ({ page }) => {
  const errors = watchErrors(page);

  await aim(page, AIM.lightSwitch);
  await expect(prompt(page)).toContainText('Apagar luzes do galpão');
  await pressInteract(page);
  expect((await diag(page)).equipment.hallLightsOn).toBe(false);
  await expect(prompt(page)).toContainText('Acender luzes do galpão');
  await pressInteract(page);
  expect((await diag(page)).equipment.hallLightsOn).toBe(true);

  await aim(page, AIM.bench);
  await expect(prompt(page)).toContainText('Bancada de trabalho');
  await expect(prompt(page)).toContainText('Acender luminária');
  // Clique esquerdo no jogo também interage.
  await page.mouse.click(640, 360);
  await waitFrames(page, 2);
  expect((await diag(page)).equipment.benchLampOn).toBe(true);

  await aim(page, AIM.drawer);
  await expect(prompt(page)).toContainText('Armário de ferramentas');
  // Segurar E (com repetição automática do teclado) abre a gaveta uma vez só.
  await page.keyboard.down('KeyE');
  await waitFrames(page, 2);
  await page.keyboard.down('KeyE'); // repeat = true
  await page.keyboard.down('KeyE');
  await waitFrames(page, 2);
  await page.keyboard.up('KeyE');
  await waitEquipment(page, 'drawer', 'extended');
  await waitFrames(page, 5);
  expect((await diag(page)).equipment.drawer).toBe('extended');
  expect(errors).toEqual([]);
});

test('portão aparece como indisponível com o motivo; computador abre a gestão', async ({ page }) => {
  const errors = watchErrors(page);
  await aim(page, AIM.gate);
  await expect(prompt(page)).toContainText('Portão');
  await expect(prompt(page)).toHaveAttribute('data-status', 'unavailable');
  await expect(prompt(page)).toContainText('etapa futura');
  await pressInteract(page);
  await expect(notice(page)).toContainText('etapa futura');

  await aim(page, AIM.computer);
  await expect(prompt(page)).toContainText('Computador do escritório');
  await expect(prompt(page)).toContainText('Abrir computador de gestão');
  expect(errors).toEqual([]);
});

test('sem alvo na mira não há aviso; pausar esconde o aviso e congela o elevador', async ({ page }) => {
  const errors = watchErrors(page);
  await aim(page, AIM.floor);
  await expect(prompt(page)).toBeHidden();
  expect((await diag(page)).interaction.focus).toBeNull();
  await pressInteract(page);
  await expect(notice(page)).toBeHidden();

  await aim(page, AIM.liftControl);
  await pressInteract(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu-primary')).toHaveText('Continuar');
  const frozen = (await diag(page)).equipment.liftHeight;
  await page.waitForTimeout(800);
  expect((await diag(page)).equipment.liftHeight).toBe(frozen);
  await expect(prompt(page)).toBeHidden();

  // Novo jogo volta tudo ao estado inicial.
  await page.getByRole('button', { name: 'Sair para o menu inicial' }).click();
  await startPlaying(page, true);
  const fresh = (await diag(page)).equipment;
  expect(fresh.lift).toBe('retracted');
  expect(fresh.liftHeight).toBe(0);
  expect(errors).toEqual([]);
});
