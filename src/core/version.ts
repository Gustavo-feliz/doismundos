/** Versão do jogo mostrada no menu. Mantenha igual ao "version" do package.json (há teste). */
export const GAME_VERSION = '0.2.0';

/** "0.2.0" → "0.2" (o menu mostra só maior.menor). */
export function shortVersion(version: string = GAME_VERSION): string {
  return version.split('.').slice(0, 2).join('.');
}
