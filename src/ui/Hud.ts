import type { InteractionPrompt } from '../interaction/types';
import { h, setText } from './dom';
import { icon } from './icons';
import { kbd } from './keys';

export interface HudData {
  money: string;
  day: number;
  time: string;
  objective: string;
  /** Rótulo acima do objetivo (ex.: "Tutorial · passo 3 de 8"). */
  objectiveLabel: string;
  /** Reputação geral em estrelas (0–5, de meia em meia) ou null sem avaliações. */
  reputationStars?: number | null;
  /** Linha extra com a OS do box (durante uma missão). null esconde. */
  objectiveDetail: string | null;
  tool: string;
}

/** Legenda de diálogo: quem fala, o texto e as opções numeradas. */
export interface HudDialogue {
  speaker: string;
  speakerId: string;
  text: string;
  options: readonly string[] | null;
}

const STATUS_LABEL = { busy: 'Em uso', unavailable: 'Indisponível' } as const;
const NOTIFY_MS = 2600;

/**
 * HUD do GDD §20.3: dinheiro, hora, objetivo e ferramenta ativa; ao mirar,
 * nome, estado conhecido e ação disponível. Mais mira e avisos.
 */
export class Hud {
  readonly element: HTMLElement;
  private readonly money: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objectiveLabel: HTMLElement;
  private readonly objectiveDetail: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly tipText: HTMLElement;
  private readonly dialogue: HTMLElement;
  private dialogueKey = '';
  private readonly tool: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptName: HTMLElement;
  private readonly promptDetail: HTMLElement;
  private readonly promptAction: HTMLElement;
  private readonly notice: HTMLElement;
  private promptKey = '';
  private noticeTimer = 0;
  private savedTimer = 0;
  private readonly saved: HTMLElement;
  private readonly rep: HTMLElement;

  constructor(parent: HTMLElement) {
    this.money = h('strong', { class: 'hud-value', 'data-testid': 'hud-money' });
    this.clock = h('strong', { class: 'hud-value', 'data-testid': 'hud-clock' });
    this.objective = h('span', { class: 'hud-objective-text', 'data-testid': 'hud-objective' });
    this.objectiveLabel = h('span', { class: 'hud-label', 'data-testid': 'hud-objective-label', text: 'Objetivo' });
    this.objectiveDetail = h('span', { class: 'hud-objective-detail', 'data-testid': 'hud-objective-os', hidden: true });
    this.tipText = h('span', { class: 'hud-tip-text' });
    this.tip = h(
      'div',
      { class: 'hud-panel hud-tip', 'data-testid': 'hud-tip', hidden: true },
      h('span', { class: 'hud-label' }, icon('dica', 'hud-label-icon'), 'Dica do Seu Zé'),
      this.tipText,
      h('span', { class: 'hud-tip-hint' }, kbd('toggleTips'), ' ocultar dicas'),
    );
    this.dialogue = h('div', { class: 'hud-dialogue', 'data-testid': 'hud-dialogue', role: 'log', 'aria-live': 'polite', hidden: true });
    this.tool = h('strong', { class: 'hud-value', 'data-testid': 'hud-held' });
    this.crosshair = h('div', { class: 'crosshair', 'aria-hidden': 'true' });

    this.promptName = h('div', { class: 'prompt-name' });
    this.promptDetail = h('div', { class: 'prompt-detail' });
    this.promptAction = h('div', { class: 'prompt-action' });
    this.prompt = h('div', { class: 'interact-prompt', 'data-testid': 'interact-prompt', hidden: true }, this.promptName, this.promptDetail, this.promptAction);

    // Avisos empilhados (até 3), sem cobrir a mira.
    this.notice = h('div', { class: 'hud-notice', role: 'status', 'aria-live': 'polite', 'data-testid': 'hud-notices', hidden: true });
    this.rep = h('strong', { class: 'hud-value', 'data-testid': 'hud-rep' });
    const metric = (name: Parameters<typeof icon>[0], label: string, value: HTMLElement) =>
      h('div', { class: 'hud-metric' }, icon(name, 'hud-icon'), h('span', { class: 'hud-metric-body' }, h('span', { class: 'hud-label', text: label }), value));
    this.saved = h('div', { class: 'hud-saved', 'data-testid': 'hud-saved', hidden: true });

    this.element = h(
      'div',
      { id: 'hud', class: 'hud', hidden: true },
      h(
        'div',
        { class: 'hud-panel hud-top-left' },
        metric('dinheiro', 'Caixa', this.money),
        metric('relogio', 'Hora', this.clock),
      ),
      h(
        'div',
        { class: 'hud-panel hud-objective', role: 'status', 'aria-live': 'polite' },
        h('div', { class: 'hud-objective-head' }, icon('alvo', 'hud-label-icon'), this.objectiveLabel),
        this.objective,
        this.objectiveDetail,
        this.tip,
      ),
      h('div', { class: 'hud-panel hud-bottom-right' }, metric('estrela', 'Reputação', this.rep), metric('chave', 'Em mãos', this.tool)),
      this.crosshair,
      this.prompt,
      this.notice,
      this.dialogue,
      this.saved,
      h('div', { class: 'prototype-badge', text: 'Protótipo · modelos e texturas temporários' }),
    );
    parent.append(this.element);
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  update(data: HudData): void {
    setText(this.money, data.money);
    setText(this.clock, `Dia ${data.day} · ${data.time}`);
    setText(this.objective, data.objective);
    const stars = data.reputationStars ?? null;
    setText(this.rep, stars === null ? '—' : stars.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
    setText(this.objectiveLabel, data.objectiveLabel);
    this.objectiveDetail.hidden = !data.objectiveDetail;
    if (data.objectiveDetail) setText(this.objectiveDetail, data.objectiveDetail);
    setText(this.tool, data.tool);
  }

  /** Mostra o que está na mira (ou esconde, com null). Só mexe no DOM se mudou. */
  setPrompt(prompt: InteractionPrompt | null): void {
    const key = prompt ? `${prompt.name}|${prompt.status}|${prompt.action}|${prompt.reason}|${prompt.detail}` : '';
    if (key === this.promptKey) return;
    this.promptKey = key;

    if (!prompt) {
      this.prompt.hidden = true;
      delete this.crosshair.dataset.status;
      return;
    }
    this.prompt.hidden = false;
    this.prompt.dataset.status = prompt.status;
    this.crosshair.dataset.status = prompt.status;
    this.promptName.textContent = prompt.name;
    this.promptDetail.textContent = prompt.detail ?? '';
    this.promptDetail.hidden = !prompt.detail;
    this.promptAction.replaceChildren(
      ...(prompt.status === 'available'
        ? [kbd('interact'), ` ${prompt.action ?? ''}`]
        : [h('span', { class: 'prompt-status', text: STATUS_LABEL[prompt.status] }), ` · ${prompt.reason ?? ''}`]),
    );
  }

  /** Dica contextual (dispensável). null esconde. */
  setTip(text: string | null): void {
    this.tip.hidden = !text;
    if (text) setText(this.tipText, text);
  }

  /** Legenda de diálogo. Só mexe no DOM se mudou. */
  setDialogue(d: HudDialogue | null): void {
    const key = d ? `${d.speaker}|${d.text}|${d.options?.join('|') ?? ''}` : '';
    if (key === this.dialogueKey) return;
    this.dialogueKey = key;
    this.dialogue.hidden = !d;
    if (!d) return;
    this.dialogue.dataset.speaker = d.speakerId;
    this.dialogue.replaceChildren(
      ...(d.speaker ? [h('div', { class: 'dialogue-speaker', text: d.speaker })] : []),
      h('p', { class: 'dialogue-text', 'data-testid': 'dialogue-text', text: d.text }),
      d.options
        ? h('ol', { class: 'dialogue-options', 'data-testid': 'dialogue-options' }, ...d.options.map((label, i) => h('li', {}, h('kbd', { text: String(i + 1) }), ` ${label}`)))
        : h('div', { class: 'dialogue-skip' }, kbd('skipLine'), ' pular'),
    );
  }

  /** Aviso curto de retorno de uma ação. */
  notify(text: string, kind: 'ok' | 'blocked'): void {
    if (!text) return;
    // Pilha de até 3 avisos: o mais novo embaixo; cada um some sozinho.
    // O aviso mais novo leva o data-testid 'hud-notice' (é o que o jogador acabou de causar).
    for (const old of this.notice.querySelectorAll('[data-testid="hud-notice"]')) old.removeAttribute('data-testid');
    const item = h('div', { class: 'hud-notice-item is-fresh', 'data-kind': kind, 'data-testid': 'hud-notice' }, icon(kind === 'ok' ? 'ok' : 'alerta', 'hud-notice-icon'), h('span', { text }));
    this.notice.dataset.kind = kind;
    this.notice.append(item);
    while (this.notice.childElementCount > 3) this.notice.firstElementChild?.remove();
    this.notice.hidden = false;
    window.setTimeout(() => {
      item.remove();
      if (this.notice.childElementCount === 0) this.notice.hidden = true;
    }, NOTIFY_MS);
  }

  /** Indicador discreto de save (canto da tela). */
  flashSaved(text: string): void {
    this.saved.textContent = text;
    this.saved.hidden = false;
    window.clearTimeout(this.savedTimer);
    this.savedTimer = window.setTimeout(() => (this.saved.hidden = true), 1800);
  }

  dispose(): void {
    window.clearTimeout(this.savedTimer);
    window.clearTimeout(this.noticeTimer);
    this.element.remove();
  }
}
