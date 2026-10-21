import { expect, test } from '@playwright/test';
import { AIM, aim, diag, openGame, pressInteract, startPlaying, watchErrors } from './helpers';

test('Prompt 15: contratação, fila concorrente de tarefas, folha salarial, pausa/demissão e persistência', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openGame(page);
  await startPlaying(page);

  const initialCash = (await diag(page)).cash;

  // Abre o computador do escritório e vai para a aba Equipe
  await aim(page, AIM.computer);
  await pressInteract(page);
  await expect(page.getByTestId('computer-panel')).toBeVisible();
  await page.locator('.panel-tab[data-tab="equipe"]').click();
  await expect(page.getByTestId('staff-candidates')).toBeVisible();

  // Contrata 1 ajudante (R$ 90,00) e 1 mecânico (R$ 180,00)
  await page.locator('[data-staff-hire="caio-ajudante"]').click();
  await page.locator('[data-staff-hire="marcos-mecanico"]').click();

  const afterHire = await diag(page);
  expect(afterHire.cash).toBe(initialCash - (90_00 + 180_00));
  expect(afterHire.staff.employees).toHaveLength(2);

  // Coloca 1 tarefa na fila: apenas 1 funcionário assume (sem concorrência duplicada)
  await page.locator('[data-enqueue-task="std-organizar-bancada"]').click();
  const afterTask1 = await diag(page);
  expect(afterTask1.staff.tasks).toHaveLength(1);
  expect(afterTask1.staff.tasks[0]!.assignedTo).toBe('caio-ajudante');
  expect(afterTask1.staff.employees.find((e) => e.id === 'caio-ajudante')!.state).toBe('ocupado');
  expect(afterTask1.staff.employees.find((e) => e.id === 'marcos-mecanico')!.state).toBe('disponivel');

  // Coloca uma 2ª tarefa exclusiva de mecânico: o mecânico livre assume
  await page.locator('[data-enqueue-task="std-revisao-preventiva"]').click();
  const afterTask2 = await diag(page);
  expect(afterTask2.staff.tasks).toHaveLength(2);
  expect(afterTask2.staff.tasks[1]!.assignedTo).toBe('marcos-mecanico');

  // Avança o turno (+15 min duas vezes = 30 min): ambas as tarefas concluem
  await page.getByTestId('staff-advance-work').click();
  await page.getByTestId('staff-advance-work').click();
  const afterAdvance = await diag(page);
  expect(afterAdvance.staff.tasks.every((t) => t.status === 'concluida')).toBe(true);
  expect(afterAdvance.staff.employees.every((e) => e.state === 'disponivel' && e.completedTasks === 1)).toBe(true);

  // Paga a folha salarial do dia (R$ 270,00)
  await page.getByTestId('staff-pay-payroll').click();
  const afterPayroll = await diag(page);
  expect(afterPayroll.cash).toBe(afterHire.cash - 270_00);
  expect(afterPayroll.staff.lastPayrollDay).toBe(1);

  // Pausa o mecânico e demite o ajudante
  await page.locator('[data-staff-pause="marcos-mecanico"]').click();
  await expect(page.locator('[data-employee="marcos-mecanico"]')).toHaveAttribute('data-state', 'pausado');
  await page.locator('[data-staff-fire="caio-ajudante"]').click();
  await expect(page.locator('[data-employee="caio-ajudante"]')).toHaveCount(0);

  // Autosave grava o estado da equipe no save v5
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.autosaveNow())).toBe(true);
  expect(errors).toEqual([]);
});
