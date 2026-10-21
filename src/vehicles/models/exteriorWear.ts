/**
 * Regras puras para o desgaste visual EXTERNO dos veículos (Prompt 22 — Parte A).
 *
 * REGRA DE OURO DE ARQUITETURA (#2):
 * O desgaste de peças internas ocultas (velas, bomba de combustível, bobina,
 * válvula termostática etc.) NUNCA pode aparecer por fora antes do diagnóstico.
 * Por isso, este módulo recebe apenas dados publicamente visíveis a olho nu:
 * ano de fabricação, quilometragem do hodômetro e batidas de test drive.
 */

export interface ExteriorWearInput {
  /** Ano de fabricação do modelo (ex.: 1998..2022). */
  modelYear: number;
  /** Ano de referência do jogo (padrão: 2026). */
  currentYear?: number;
  /** Quilometragem total rodada no hodômetro. */
  mileageKm: number;
  /** Batidas acumuladas em test drive (geram amassados visíveis). */
  testDriveCollisions?: number;
}

export interface ExteriorVisualWear {
  /** Nível de poeira/sujeira na pintura (0 = limpo, 1 = muito empoeirado). */
  dirtFactor: number;
  /** Nível de oxidação/ferrugem superficial nas caixas de roda (0..1). */
  rustFactor: number;
  /** Quantidade de marcas de amassado visíveis (0..4). */
  dentCount: number;
  /** Rugosidade resultante da base da pintura (0.35..0.82). */
  paintRoughness: number;
  /** Rugosidade resultante do verniz clearcoat (0.06..0.65). */
  clearcoatRoughness: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Calcula os parâmetros visuais de desgaste externo do carro de forma 100% determinística,
 * sem tocar nem receber qualquer estado de peças internas (`parts`).
 */
export function computeExteriorVisualWear(input: ExteriorWearInput): ExteriorVisualWear {
  const refYear = input.currentYear ?? 2026;
  const ageYears = Math.max(0, refYear - input.modelYear);
  const km = Math.max(0, input.mileageKm);
  const collisions = Math.max(0, Math.floor(input.testDriveCollisions ?? 0));

  const dirtFactor = Number(clamp01((km / 180_000) * 0.65 + (ageYears / 25) * 0.35).toFixed(3));
  const rustFactor = Number(clamp01(ageYears > 10 ? ((ageYears - 10) / 18) * 0.7 + (km / 220_000) * 0.3 : 0).toFixed(3));
  const dentCount = Math.min(4, collisions + (km > 150_000 ? 1 : 0));

  const paintRoughness = Number((0.36 + dirtFactor * 0.34 + rustFactor * 0.12).toFixed(3));
  const clearcoatRoughness = Number((0.08 + dirtFactor * 0.38 + rustFactor * 0.18).toFixed(3));

  return {
    dirtFactor,
    rustFactor,
    dentCount,
    paintRoughness,
    clearcoatRoughness,
  };
}

