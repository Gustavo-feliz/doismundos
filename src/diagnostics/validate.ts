import type { Catalogs } from '../vehicles/catalogs';
import { DataValidationError } from '../vehicles/types';
import { testsForCase, type DiagnosticData } from './rules';
import type { DiagnosticCaseDef, Effects, FunctionalTestDef } from './types';

/** Valida exames e casos de diagnóstico contra os catálogos (GDD §21.3). */
export function validateDiagnosticData(cases: readonly DiagnosticCaseDef[], data: DiagnosticData, catalogs: Catalogs): void {
  const p: string[] = [];
  const checkEffects = (where: string, effects: Effects) => {
    for (const [slot, w] of Object.entries(effects)) {
      if (!catalogs.slots.has(slot)) p.push(`${where}: efeito em posição desconhecida "${slot}"`);
      if (!Number.isFinite(w)) p.push(`${where}: peso inválido em "${slot}"`);
    }
  };
  const checkMinutes = (where: string, minutes: number) => {
    if (!Number.isInteger(minutes) || minutes <= 0) p.push(`${where}: tempo deve ser um inteiro de minutos > 0`);
  };

  checkMinutes('scanner', data.scanner.minutes);
  checkEffects('scanner (sem códigos)', data.scanner.noCodesEffects);
  for (const code of data.scanner.codes) {
    if (!catalogs.slots.has(code.when.slot)) p.push(`código ${code.code}: posição desconhecida "${code.when.slot}"`);
    checkEffects(`código ${code.code}`, code.effects);
  }

  const checkFunctional = (t: FunctionalTestDef) => {
    const where = `teste "${t.id}"`;
    checkMinutes(where, t.minutes);
    if (t.outcomes.length === 0) p.push(`${where}: sem resultados`);
    t.outcomes.forEach((o, i) => {
      const last = i === t.outcomes.length - 1;
      if (!o.when && !last) p.push(`${where}: resultado padrão (sem "when") precisa ser o último`);
      if (last && o.when) p.push(`${where}: o último resultado precisa ser o padrão (sem "when")`);
      if (o.when && !catalogs.slots.has(o.when.slot)) p.push(`${where}: posição desconhecida "${o.when.slot}"`);
      checkEffects(where, o.effects);
    });
  };
  for (const t of data.functional.values()) checkFunctional(t);

  const ids = new Set<string>();
  for (const c of cases) {
    const where = `caso "${c.id}"`;
    if (ids.has(c.id)) p.push(`${where}: id duplicado`);
    ids.add(c.id);
    if (!c.complaint?.trim() || !c.summary?.trim() || !c.customerName?.trim()) p.push(`${where}: queixa, resumo e cliente são obrigatórios`);
    const model = catalogs.models.get(c.vehicle.modelId);
    if (!model) {
      p.push(`${where}: modelo desconhecido "${c.vehicle.modelId}"`);
      continue;
    }
    if (c.hypotheses.length < 2) p.push(`${where}: precisa de pelo menos 2 hipóteses (senão não há diagnóstico)`);
    for (const h of c.hypotheses) {
      if (!model.slots.includes(h.slot)) p.push(`${where}: hipótese "${h.slot}" não existe no ${model.model}`);
      if (!(h.prior > 0)) p.push(`${where}: peso inicial de "${h.slot}" deve ser > 0`);
    }
    if (!c.hypotheses.some((h) => h.slot === c.trueCause)) p.push(`${where}: a causa real precisa estar entre as hipóteses`);
    for (const id of c.functionalTests) if (!data.functional.has(id)) p.push(`${where}: teste funcional desconhecido "${id}"`);
    const testIds = new Set(testsForCase(c, catalogs, data).map((t) => t.id));
    for (const hint of c.hints) if (!testIds.has(hint.testId)) p.push(`${where}: dica aponta para exame inexistente "${hint.testId}"`);
  }
  if (cases.length === 0) p.push('nenhum caso de diagnóstico');
  if (p.length) throw new DataValidationError('dados de diagnóstico', p);
}
