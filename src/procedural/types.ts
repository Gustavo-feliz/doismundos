import type { CaseHint, HypothesisPrior, ToolRequirement } from '../diagnostics/types';
import type { VehicleCategory } from '../vehicles/types';

/** Molde de serviço para o gerador de OS (Prompt 12). */
export interface ServiceTemplate {
  id: string;
  /** Resumo curto (HUD). */
  title: string;
  /** Falas possíveis do cliente (sintoma, nunca o diagnóstico). */
  complaints: readonly string[];
  /** Posição que realmente falhou. */
  cause: string;
  hypotheses: readonly HypothesisPrior[];
  functionalTests: readonly string[];
  /** Faixa de desgaste da peça com defeito (precisa ser crítica: ≥ 75). */
  causeWear: readonly [number, number];
  requiredTools: readonly ToolRequirement[];
  /** Categorias de carro em que o serviço aparece (null = todas). */
  categories: readonly VehicleCategory[] | null;
  finalTest: { resolved: string; persists: string };
  hints: readonly CaseHint[];
}
