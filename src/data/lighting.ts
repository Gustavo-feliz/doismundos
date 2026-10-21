/**
 * Presets e interpolação de iluminação por hora do dia (Prompt 19 — Direção Híbrida A+B).
 * Usado pela oficina (luz entrando pelo portão), pelo bairro de São Cristóvão e pelo sandbox `?arte`.
 */

export type TimeOfDayPresetId = 'manha' | 'meio-dia' | 'fim-de-tarde' | 'noite';

export interface LightingPreset {
  id: TimeOfDayPresetId;
  label: string;
  /** Minuto do dia de referência (0..1439). */
  minuteOfDay: number;
  sunColor: number;
  sunIntensity: number;
  /** Direção normalizada ou posição de referência do sol [x, y, z]. */
  sunPosition: readonly [number, number, number];
  skyColor: number;
  groundColor: number;
  hemiIntensity: number;
  fogColor: number;
  fogDensity: number;
  /** Exposição para ACESFilmicToneMapping. */
  exposure: number;
  /** Indica se os postes da rua e vitrines noturnas devem acender. */
  streetLightsOn: boolean;
}

export const LIGHTING_PRESETS: Readonly<Record<TimeOfDayPresetId, LightingPreset>> = {
  manha: {
    id: 'manha',
    label: 'Manhã (08:00)',
    minuteOfDay: 8 * 60,
    sunColor: 0xffe8c2,
    sunIntensity: 2.3,
    sunPosition: [14, 14, 24],
    skyColor: 0xd8ecff,
    groundColor: 0x52483e,
    hemiIntensity: 0.45,
    fogColor: 0xcfe2f3,
    fogDensity: 0.0045,
    exposure: 1.02,
    streetLightsOn: false,
  },
  'meio-dia': {
    id: 'meio-dia',
    label: 'Meio-dia (12:30)',
    minuteOfDay: 12 * 60 + 30,
    sunColor: 0xfff8eb,
    sunIntensity: 3.0,
    sunPosition: [5, 28, 20],
    skyColor: 0xe8f4ff,
    groundColor: 0x5c5346,
    hemiIntensity: 0.55,
    fogColor: 0xdbeaf7,
    fogDensity: 0.0032,
    exposure: 1.08,
    streetLightsOn: false,
  },
  'fim-de-tarde': {
    id: 'fim-de-tarde',
    label: 'Fim de tarde (17:15)',
    minuteOfDay: 17 * 60 + 15,
    sunColor: 0xffb870,
    sunIntensity: 2.1,
    sunPosition: [-16, 10, 26],
    skyColor: 0xffd8b8,
    groundColor: 0x473930,
    hemiIntensity: 0.42,
    fogColor: 0xf0c9a8,
    fogDensity: 0.0058,
    exposure: 0.98,
    streetLightsOn: false,
  },
  noite: {
    id: 'noite',
    label: 'Noite (20:30)',
    minuteOfDay: 20 * 60 + 30,
    sunColor: 0x6b88b8,
    sunIntensity: 0.35,
    sunPosition: [-10, 18, -14],
    skyColor: 0x1e293b,
    groundColor: 0x141619,
    hemiIntensity: 0.22,
    fogColor: 0x151c28,
    fogDensity: 0.0075,
    exposure: 0.86,
    streetLightsOn: true,
  },
};

const ORDERED_PRESETS: readonly LightingPreset[] = [
  LIGHTING_PRESETS.manha,
  LIGHTING_PRESETS['meio-dia'],
  LIGHTING_PRESETS['fim-de-tarde'],
  LIGHTING_PRESETS.noite,
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColorHex(hexA: number, hexB: number, t: number): number {
  const rA = (hexA >> 16) & 0xff;
  const gA = (hexA >> 8) & 0xff;
  const bA = hexA & 0xff;
  const rB = (hexB >> 16) & 0xff;
  const gB = (hexB >> 8) & 0xff;
  const bB = hexB & 0xff;
  const r = Math.round(lerp(rA, rB, t));
  const g = Math.round(lerp(gA, gB, t));
  const b = Math.round(lerp(bA, bB, t));
  return (r << 16) | (g << 8) | b;
}

/** Determina o identificador do período do dia mais próximo para `minuteOfDay`. */
export function resolveTimeOfDayId(minuteOfDay: number): TimeOfDayPresetId {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  if (m >= 5 * 60 + 30 && m < 10 * 60 + 30) return 'manha';
  if (m >= 10 * 60 + 30 && m < 15 * 60 + 30) return 'meio-dia';
  if (m >= 15 * 60 + 30 && m < 18 * 60 + 45) return 'fim-de-tarde';
  return 'noite';
}

/**
 * Calcula o estado de iluminação interpolado para qualquer minuto do relógio (`0..1439`).
 * Função pura e determinística.
 */
export function lightingAtMinute(minuteOfDay: number): LightingPreset {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const id = resolveTimeOfDayId(m);

  // Encontra o par de presets adjacentes no ciclo de 24h (1440 min).
  let prev = ORDERED_PRESETS[ORDERED_PRESETS.length - 1]!;
  let next = ORDERED_PRESETS[0]!;
  let span = 1440 - prev.minuteOfDay + next.minuteOfDay;
  let elapsed = m >= prev.minuteOfDay ? m - prev.minuteOfDay : m + (1440 - prev.minuteOfDay);

  for (let i = 0; i < ORDERED_PRESETS.length - 1; i++) {
    const a = ORDERED_PRESETS[i]!;
    const b = ORDERED_PRESETS[i + 1]!;
    if (m >= a.minuteOfDay && m <= b.minuteOfDay) {
      prev = a;
      next = b;
      span = b.minuteOfDay - a.minuteOfDay;
      elapsed = m - a.minuteOfDay;
      break;
    }
  }

  const t = span > 0 ? Math.max(0, Math.min(1, elapsed / span)) : 0;
  return {
    id,
    label: LIGHTING_PRESETS[id].label,
    minuteOfDay: m,
    sunColor: lerpColorHex(prev.sunColor, next.sunColor, t),
    sunIntensity: Number(lerp(prev.sunIntensity, next.sunIntensity, t).toFixed(3)),
    sunPosition: [
      Number(lerp(prev.sunPosition[0], next.sunPosition[0], t).toFixed(2)),
      Number(lerp(prev.sunPosition[1], next.sunPosition[1], t).toFixed(2)),
      Number(lerp(prev.sunPosition[2], next.sunPosition[2], t).toFixed(2)),
    ],
    skyColor: lerpColorHex(prev.skyColor, next.skyColor, t),
    groundColor: lerpColorHex(prev.groundColor, next.groundColor, t),
    hemiIntensity: Number(lerp(prev.hemiIntensity, next.hemiIntensity, t).toFixed(3)),
    fogColor: lerpColorHex(prev.fogColor, next.fogColor, t),
    fogDensity: Number(lerp(prev.fogDensity, next.fogDensity, t).toFixed(5)),
    exposure: Number(lerp(prev.exposure, next.exposure, t).toFixed(3)),
    streetLightsOn: m >= 18 * 60 + 15 || m < 6 * 60,
  };
}

