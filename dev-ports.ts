import { existsSync, readFileSync } from 'node:fs';

/**
 * Portas do servidor de desenvolvimento e do preview.
 * Cada pasta de trabalho (ex.: a do Gemini, via git worktree) pode ter as
 * suas, num arquivo local `.dev-ports.json` (fora do git):
 *   { "dev": 5288, "preview": 4288 }
 * Sem o arquivo: 5188 e 4188. Variáveis GAME_DEV_PORT/GAME_PREVIEW_PORT têm prioridade.
 * Assim os testes de uma pasta nunca usam o servidor da outra.
 */
const file = new URL('./.dev-ports.json', import.meta.url);
const local: { dev?: number; preview?: number } = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};

export const DEV_PORT = Number(process.env.GAME_DEV_PORT ?? local.dev ?? 5188);
export const PREVIEW_PORT = Number(process.env.GAME_PREVIEW_PORT ?? local.preview ?? 4188);
