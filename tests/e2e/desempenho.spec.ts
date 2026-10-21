import { expect, test, type Page } from '@playwright/test';
import { openGame, startPlaying, waitFrames } from './helpers';

/**
 * Orçamento de desempenho (GDD §22). Os TETOS barram regressão: se uma
 * mudança piorar além deles, este teste falha. As METAS ficam em docs/QA.md;
 * hoje a oficina passa da meta (458 chamadas) e está registrada lá.
 */
const BUDGET = {
  oficina: { calls: 500, triangles: 60_000 },
  patio: { calls: 200, triangles: 30_000 },
  bairro: { calls: 150, triangles: 30_000 },
  heapMb: 150,
  loadMs: 10_000,
};

async function measure(page: Page) {
  await waitFrames(page, 30);
  return page.evaluate(() => {
    const d = window.__GAME_DIAGNOSTICS__!;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return { calls: d.renderer.calls, triangles: d.renderer.triangles, heapMb: mem ? mem.usedJSHeapSize / 1e6 : 0 };
  });
}

test('orçamento de desempenho: oficina, pátio e bairro dentro dos tetos', async ({ page }, info) => {
  test.setTimeout(60_000);
  const t0 = Date.now();
  await openGame(page);
  const loadMs = Date.now() - t0;
  await startPlaying(page);

  const oficina = await measure(page);
  expect(await page.evaluate(() => window.__GAME_TEST_HOOKS__!.startTestDrive())).toBe('driving');
  const patio = await measure(page);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.state === 'playing');
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => window.__GAME_DIAGNOSTICS__?.city?.active === true);
  const bairro = await measure(page);

  info.annotations.push({
    type: 'desempenho',
    description: `carga ${loadMs} ms · oficina ${oficina.calls}/${oficina.triangles} · pátio ${patio.calls}/${patio.triangles} · bairro ${bairro.calls}/${bairro.triangles} · heap ${Math.round(Math.max(oficina.heapMb, patio.heapMb, bairro.heapMb))} MB`,
  });
  expect(loadMs).toBeLessThan(BUDGET.loadMs);
  expect(oficina.calls).toBeLessThanOrEqual(BUDGET.oficina.calls);
  expect(oficina.triangles).toBeLessThanOrEqual(BUDGET.oficina.triangles);
  expect(patio.calls).toBeLessThanOrEqual(BUDGET.patio.calls);
  expect(patio.triangles).toBeLessThanOrEqual(BUDGET.patio.triangles);
  expect(bairro.calls).toBeLessThanOrEqual(BUDGET.bairro.calls);
  expect(bairro.triangles).toBeLessThanOrEqual(BUDGET.bairro.triangles);
  expect(Math.max(oficina.heapMb, patio.heapMb, bairro.heapMb)).toBeLessThan(BUDGET.heapMb);
});
