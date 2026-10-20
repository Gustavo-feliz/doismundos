import type { SlotId } from '../save/saveFile';
import { slotLabel, type SlotInfo } from '../save/SaveService';
import { h } from './dom';

export type SavesMode = 'save' | 'load';

export interface SaveSlotsCallbacks {
  onSave(slot: SlotId): void;
  onLoad(slot: SlotId): void;
  onDelete(slot: SlotId): void;
  onBack(): void;
}

type Pending = { slot: SlotId; action: 'save' | 'load' | 'delete' } | null;

const STATE_LABEL: Record<SlotInfo['state'], string> = {
  vazio: 'Vazio',
  ok: 'OK',
  recuperavel: 'Corrompido · cópia de segurança disponível',
  corrompido: 'Corrompido',
};

const QUESTION = {
  save: (s: SlotId) => `Sobrescrever o ${slotLabel(s)}?`,
  load: (s: SlotId) => `Carregar o ${slotLabel(s)}? O progresso não salvo será perdido.`,
  delete: (s: SlotId) => `Excluir o ${slotLabel(s)}? Não dá para desfazer.`,
};

/**
 * Lista de slots de save (autosave + 3 manuais) com confirmação em linha
 * para carregar, sobrescrever e excluir (GDD Prompt 9).
 */
export class SaveSlotsPanel {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly title: HTMLElement;
  private readonly note: HTMLElement;
  private mode: SavesMode = 'load';
  private slots: SlotInfo[] = [];
  private pending: Pending = null;
  private busy = false;

  constructor(private readonly callbacks: SaveSlotsCallbacks) {
    this.title = h('h2', { text: 'Carregar jogo' });
    this.list = h('ul', { class: 'save-slots', 'data-testid': 'save-slots' });
    this.note = h('p', { class: 'menu-note' });
    const back = h('button', { type: 'button', class: 'btn btn-ghost', text: '← Voltar' });
    back.addEventListener('click', () => this.callbacks.onBack());
    this.element = h('section', { class: 'menu-panel', 'aria-label': 'Saves' }, this.title, this.list, this.note, back);
  }

  render(mode: SavesMode, slots: SlotInfo[], persistent: boolean): void {
    this.mode = mode;
    this.slots = slots;
    this.pending = null;
    this.busy = false;
    this.draw(persistent);
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    for (const b of this.list.querySelectorAll('button')) b.disabled = busy;
  }

  private draw(persistent = true): void {
    this.title.textContent = this.mode === 'save' ? 'Salvar jogo' : 'Carregar jogo';
    this.note.textContent = persistent
      ? 'Os saves ficam neste navegador. O autosave é feito ao pausar e a cada minuto com mudanças.'
      : 'Atenção: este navegador bloqueou o armazenamento; os saves só valem até fechar a página.';
    this.list.replaceChildren(...this.slots.map((s) => this.row(s)));
  }

  private row(s: SlotInfo): HTMLElement {
    const info = s.summary
      ? `Dia ${s.summary.day} · ${s.summary.time} · ${s.summary.cashText} · ${s.summary.orderLabel} · reputação ${s.summary.reputation}`
      : s.state === 'corrompido'
        ? s.problems.slice(0, 2).join('; ')
        : '—';
    const when = s.savedAt ? new Date(s.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const li = h(
      'li',
      { class: 'save-slot', 'data-slot': s.slot, 'data-state': s.state },
      h(
        'div',
        { class: 'test-info' },
        h('strong', {}, s.slot === 'auto' ? 'Autosave' : `Slot ${s.slot.slice(-1)}`, h('span', { class: 'save-state', 'data-state': s.state, text: STATE_LABEL[s.state] })),
        h('span', { class: 'muted', text: info }),
        ...(when ? [h('span', { class: 'muted small', text: `Salvo em ${when}` })] : []),
      ),
    );

    if (this.pending?.slot === s.slot) {
      const action = this.pending.action;
      const yes = h('button', { type: 'button', class: 'btn btn-primary btn-small', 'data-confirm': action }, 'Confirmar');
      const no = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, 'Cancelar');
      yes.addEventListener('click', () => this.run(action, s.slot));
      no.addEventListener('click', () => {
        this.pending = null;
        this.draw();
      });
      li.append(h('div', { class: 'save-confirm', role: 'alertdialog' }, h('span', { text: QUESTION[action](s.slot) }), yes, no));
      requestAnimationFrame(() => yes.focus({ preventScroll: true }));
      return li;
    }

    const actions = h('div', { class: 'save-actions' });
    const button = (label: string, action: 'save' | 'load' | 'delete', needsConfirm: boolean) => {
      const b = h('button', { type: 'button', class: action === 'delete' ? 'btn btn-ghost btn-small' : 'btn btn-small', 'data-action': action }, label);
      b.disabled = this.busy;
      b.addEventListener('click', () => {
        if (!needsConfirm) return this.run(action, s.slot);
        this.pending = { slot: s.slot, action };
        this.draw();
      });
      actions.append(b);
    };
    const loadable = s.state === 'ok' || s.state === 'recuperavel';
    if (this.mode === 'save' && s.slot !== 'auto') button(s.state === 'vazio' ? 'Salvar aqui' : 'Sobrescrever', 'save', s.state !== 'vazio');
    if (this.mode === 'load' && loadable) button('Carregar', 'load', true);
    if (s.state !== 'vazio') button('Excluir', 'delete', true);
    li.append(actions);
    return li;
  }

  private run(action: 'save' | 'load' | 'delete', slot: SlotId): void {
    this.pending = null;
    this.setBusy(true);
    if (action === 'save') this.callbacks.onSave(slot);
    else if (action === 'load') this.callbacks.onLoad(slot);
    else this.callbacks.onDelete(slot);
  }
}
