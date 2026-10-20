import { ALL_SLOTS, buildEnvelope, parseSave, type ParseFailure, type SaveEnvelope, type SaveGame, type SaveSummary, type SlotId } from './saveFile';
import type { SaveStore } from './SaveStore';

/**
 * Slots de save com segurança (Prompt 9):
 * - antes de gravar, o próprio save é relido e validado (ida e volta); se
 *   falhar, NADA é gravado e o save antigo continua;
 * - ao sobrescrever um save bom, ele vira a cópia de segurança (".bak"), na
 *   mesma transação;
 * - ao carregar um save corrompido, tenta a cópia de segurança.
 */
export type SlotState = 'vazio' | 'ok' | 'recuperavel' | 'corrompido';

export interface SlotInfo {
  slot: SlotId;
  state: SlotState;
  summary: SaveSummary | null;
  savedAt: string | null;
  problems: string[];
}

export type LoadResult = { ok: true; envelope: SaveEnvelope; recovered: boolean; message: string } | { ok: false; message: string };

const backupKey = (slot: SlotId) => `${slot}.bak`;

export class SaveService {
  constructor(
    private readonly store: SaveStore,
    private readonly validateSession: (session: unknown) => string[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  get persistent(): boolean {
    return this.store.persistent;
  }

  private parse(text: string | null): ReturnType<typeof parseSave> | null {
    return text === null ? null : parseSave(text, this.validateSession);
  }

  async inspect(slot: SlotId): Promise<SlotInfo> {
    const main = this.parse(await this.store.get(slot));
    if (main?.ok) return { slot, state: 'ok', summary: main.envelope.summary, savedAt: main.envelope.savedAt, problems: [] };
    const backup = this.parse(await this.store.get(backupKey(slot)));
    if (!main && !backup) return { slot, state: 'vazio', summary: null, savedAt: null, problems: [] };
    const problems = main ? (main as ParseFailure).problems : ['save principal ausente'];
    if (backup?.ok) return { slot, state: 'recuperavel', summary: backup.envelope.summary, savedAt: backup.envelope.savedAt, problems };
    return { slot, state: 'corrompido', summary: null, savedAt: null, problems };
  }

  async list(): Promise<SlotInfo[]> {
    return Promise.all(ALL_SLOTS.map((s) => this.inspect(s)));
  }

  /** Save mais recente que dá para carregar (para "Continuar"). */
  async latest(): Promise<SlotInfo | null> {
    const loadable = (await this.list()).filter((s) => s.state === 'ok' || s.state === 'recuperavel');
    loadable.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
    return loadable[0] ?? null;
  }

  async save(slot: SlotId, game: SaveGame, summary: SaveSummary): Promise<{ ok: boolean; message: string }> {
    let text: string;
    try {
      text = JSON.stringify(buildEnvelope(slot, game, summary, this.now()));
    } catch (error) {
      return { ok: false, message: `Não foi possível montar o save: ${String(error)}` };
    }
    // Confere o que vai ser gravado ANTES de gravar: um estado inválido nunca substitui um save bom.
    const check = parseSave(text, this.validateSession);
    if (!check.ok) return { ok: false, message: `Save não gravado: o estado atual tem problemas (${check.problems.slice(0, 3).join('; ')}). O save anterior foi mantido.` };

    const previous = await this.store.get(slot);
    const entries: Record<string, string> = { [slot]: text };
    if (previous !== null && this.parse(previous)?.ok) entries[backupKey(slot)] = previous;
    try {
      await this.store.putAll(entries);
    } catch (error) {
      return { ok: false, message: `Falha ao gravar no navegador: ${error instanceof Error ? error.message : String(error)}` };
    }
    return { ok: true, message: slot === 'auto' ? 'Salvo automaticamente.' : `Jogo salvo no ${slotLabel(slot)}.` };
  }

  async load(slot: SlotId): Promise<LoadResult> {
    const mainText = await this.store.get(slot);
    const main = this.parse(mainText);
    if (main?.ok) return { ok: true, envelope: main.envelope, recovered: false, message: `${slotLabel(slot)} carregado.` };
    const backup = this.parse(await this.store.get(backupKey(slot)));
    if (backup?.ok) {
      return { ok: true, envelope: backup.envelope, recovered: true, message: `O ${slotLabel(slot)} estava corrompido; carreguei a cópia de segurança anterior.` };
    }
    if (!main) return { ok: false, message: `O ${slotLabel(slot)} está vazio.` };
    return { ok: false, message: `Não dá para carregar o ${slotLabel(slot)}: ${(main as ParseFailure).problems.slice(0, 3).join('; ')}.` };
  }

  async remove(slot: SlotId): Promise<{ ok: boolean; message: string }> {
    try {
      await this.store.delete([slot, backupKey(slot)]);
      return { ok: true, message: `${slotLabel(slot)} excluído.` };
    } catch (error) {
      return { ok: false, message: `Falha ao excluir: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

export function slotLabel(slot: SlotId): string {
  return slot === 'auto' ? 'autosave' : `slot ${slot.slice(-1)}`;
}
