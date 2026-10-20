/**
 * Valores de início de jogo.
 * PROVISÓRIO: números de balanceamento ainda não definidos no GDD;
 * revisar na etapa de economia (Prompt 7).
 */
export const NEW_GAME = {
  /** 08:00 do dia 1 */
  startMinuteOfDay: 8 * 60,
  /** 1 segundo real = 1 minuto de jogo (provisório). */
  minutesPerRealSecond: 1,
  firstObjective: 'Inspecione o carro do box 1',
} as const;
