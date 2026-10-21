import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { AIM, aim, openGame, pressInteract, startPlaying, waitFrames } from './helpers';

/**
 * Prompt 24: contraste AA (WCAG 2.1) em todo texto da interface, conferido
 * automaticamente com axe-core nas telas principais. O canvas 3D fica de fora
 * (não é texto); os painéis têm fundo próprio.
 */
async function contrastIssues(page: Page, include: string) {
  const r = await new AxeBuilder({ page }).include(include).withRules(['color-contrast']).analyze();
  return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(-1)[0] ?? ''}`));
}

/**
 * Pior caso para texto sobre o 3D (o axe não decide sobre fundo semitransparente):
 * compõe os fundos dos ancestrais (cor e gradiente pelo tom mais claro) sobre BRANCO
 * e exige contraste ≥ 4,5:1. Se passa assim, passa com qualquer cena atrás.
 */
async function worstCaseContrast(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const parse = (c: string): [number, number, number, number] | null => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1]!.split(',').map((x) => parseFloat(x));
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const over = (top: number[], under: number[]) => top.slice(0, 3).map((v, i) => v * top[3]! + under[i]! * (1 - top[3]!));
    // Alfa de um gradiente horizontal (90deg) no ponto x (0–1); outros gradientes: a parada mais transparente.
    const gradientLayer = (img: string, t: number): number[] | null => {
      const stops = [...img.matchAll(/(rgba?\([^)]+\))\s*([\d.]+)%?/g)].map((m) => ({ c: parse(m[1]!)!, at: parseFloat(m[2]!) / 100 }));
      if (!stops.length || !img.startsWith('linear-gradient(90deg')) {
        const all = [...img.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])!);
        return all.length ? all.reduce((a, b) => (b[3] < a[3] ? b : a)) : null;
      }
      let prev = stops[0]!;
      for (const s of stops) {
        if (t <= s.at) {
          const k = s.at === prev.at ? 0 : (t - prev.at) / (s.at - prev.at);
          return prev.c.map((v, i) => v + (s.c[i]! - v) * k);
        }
        prev = s;
      }
      return [...prev.c.slice(0, 3), 0]; // depois da última parada: transparente
    };
    // Camadas de fundo da interface, sem body/html (o canvas 3D cobre esses).
    const layers = (el: Element, rightX: number): number[][] => {
      const out: number[][] = [];
      for (let e: Element | null = el; e && e.tagName !== 'MAIN' && e.tagName !== 'BODY'; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const bg = parse(cs.backgroundColor);
        if (bg && bg[3] > 0) out.push(bg);
        for (const img of cs.backgroundImage.split(/,\s*(?=(?:linear|radial)-gradient)/)) {
          if (!img.startsWith('linear-gradient')) continue; // brilho radial só tinge: ignorado
          const box = e.getBoundingClientRect();
          const layer = gradientLayer(img, box.width ? Math.min(1, Math.max(0, (rightX - box.left) / box.width)) : 0);
          if (layer && layer[3]! > 0) out.push(layer);
        }
      }
      return out;
    };
    const problems: string[] = [];
    const root = document.querySelector(sel);
    if (!root) return [`escopo não encontrado: ${sel}`];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !n.textContent?.trim()) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
      let bg = [255, 255, 255];
      for (const layer of layers(el, r.right).reverse()) bg = over(layer, bg);
      const fg = parse(cs.color)!;
      const fgc = over(fg, bg);
      const [a, b] = [lum(fgc), lum(bg)].sort((x, y) => y - x);
      const ratio = (a! + 0.05) / (b! + 0.05);
      if (ratio < 4.5) problems.push(`${el.className || el.tagName} "${n.textContent.trim().slice(0, 30)}" = ${ratio.toFixed(2)}:1`);
    }
    return problems;
  }, scope);
}

test('contraste AA: menu, configurações, HUD, ficha do carro e computador', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);
  expect(await contrastIssues(page, '#menu')).toEqual([]);
  expect(await worstCaseContrast(page, '#menu')).toEqual([]);

  await page.getByRole('button', { name: 'Configurações' }).click();
  expect(await contrastIssues(page, '#menu')).toEqual([]);
  await page.getByRole('button', { name: '← Voltar' }).first().click();

  await startPlaying(page);
  await waitFrames(page, 5);
  expect(await contrastIssues(page, '#hud')).toEqual([]);
  expect(await worstCaseContrast(page, '#hud')).toEqual([]);

  await aim(page, AIM.carSide);
  await pressInteract(page);
  await expect(page.getByTestId('inspection-panel')).toBeVisible();
  expect(await contrastIssues(page, '[data-testid="inspection-panel"]')).toEqual([]);
  await page.keyboard.press('KeyE');

  await aim(page, AIM.computer);
  await pressInteract(page);
  await expect(page.getByTestId('computer-panel')).toBeVisible();
  for (const tab of ['Digit1', 'Digit3', 'Digit5', 'Digit6', 'Digit7']) {
    await page.keyboard.press(tab);
    await waitFrames(page, 2);
    expect(await contrastIssues(page, '[data-testid="computer-panel"]'), `aba ${tab}`).toEqual([]);
  }
});
