import type {
  CityLocationDef,
  CityLocationId,
  CityNeighborhoodDef,
  CitySnackDef,
  SalvageOffer,
} from '../city/types';
import { formatBRL } from '../economy/money';
import { h } from './dom';

export interface CityHudCallbacks {
  onSelectMarker(id: CityLocationId): void;
  onSellScrap(): void;
  onBuySalvage(partId: string): void;
  onBuySnack(snack: CitySnackDef): void;
  onClosePanel(reason: 'resume' | 'pause'): void;
}

export interface CityHudUpdate {
  playerX: number;
  playerZ: number;
  nearbyLocation: CityLocationDef | null;
  visited: ReadonlySet<CityLocationId>;
}

export interface CityPanelView {
  mode: 'ferro-velho' | 'lanchonete' | 'mapa';
  cashText: string;
  scrapCount: number;
  scrapTotalText: string;
  salvageOffers: ReadonlyArray<SalvageOffer & { bought: boolean }>;
  snacks: readonly CitySnackDef[];
  locations: readonly CityLocationDef[];
  visited: ReadonlySet<CityLocationId>;
}

/**
 * HUD do Bairro de São Cristóvão (Prompt 14):
 * - minimapa interativo com marcadores clicáveis para os 5 locais;
 * - indicador de proximidade de entrada;
 * - painel modal do Ferro-Velho do Tião, Lanchonete da Tia Léa e Mapa Expandido (M).
 */
export class CityHud {
  readonly hudElement: HTMLElement;
  readonly panelElement: HTMLElement;
  private readonly playerDot: HTMLElement;
  private readonly nearbyText: HTMLElement;
  private readonly markerBtns = new Map<CityLocationId, HTMLButtonElement>();
  private readonly panelTitle: HTMLElement;
  private readonly panelSubtitle: HTMLElement;
  private readonly panelCash: HTMLElement;
  private readonly panelNotice: HTMLElement;
  private readonly panelBody: HTMLElement;
  private noticeTimer = 0;

  constructor(
    parent: HTMLElement,
    private readonly def: CityNeighborhoodDef,
    private readonly callbacks: CityHudCallbacks,
  ) {
    this.playerDot = h('div', {
      class: 'city-map-player',
      'data-testid': 'city-map-player',
      title: 'Você',
    });

    const markers = def.locations.map((loc) => {
      const pctX = ((loc.entrance.x + def.halfX) / (def.halfX * 2)) * 100;
      const pctZ = ((loc.entrance.z + def.halfZ) / (def.halfZ * 2)) * 100;
      const btn = h(
        'button',
        {
          type: 'button',
          class: 'city-map-marker',
          'data-testid': `city-marker-${loc.id}`,
          'data-location': loc.id,
          style: `left:${pctX.toFixed(1)}%;top:${pctZ.toFixed(1)}%;--marker-color:${loc.accentColor}`,
          title: `${loc.name} — ${loc.actionLabel}`,
        },
        h('span', { class: 'city-map-pin' }),
        h('span', { class: 'city-map-label', text: loc.name }),
      );
      btn.addEventListener('click', () => this.callbacks.onSelectMarker(loc.id));
      this.markerBtns.set(loc.id, btn);
      return btn;
    });

    const mapBox = h(
      'div',
      { class: 'city-map-canvas', 'data-testid': 'city-map' },
      h('div', { class: 'city-map-road' }),
      h('div', { class: 'city-map-crosswalk' }),
      ...markers,
      this.playerDot,
    );

    this.nearbyText = h('p', {
      class: 'city-nearby-status',
      'data-testid': 'city-nearby',
      text: 'Caminhe pela calçada ou clique num marcador do mapa.',
    });

    this.hudElement = h(
      'aside',
      {
        class: 'city-hud',
        'data-testid': 'city-hud',
        'aria-label': 'Mapa do bairro',
        hidden: true,
      },
      h(
        'div',
        { class: 'city-hud-header' },
        h('span', { class: 'hud-label', text: 'Mapa do Bairro' }),
        h('strong', { class: 'city-hud-title', text: def.name }),
      ),
      mapBox,
      this.nearbyText,
      h(
        'p',
        { class: 'city-hud-controls' },
        h('kbd', { text: 'W A S D' }),
        ' andar · ',
        h('kbd', { text: 'E' }),
        ' entrar · ',
        h('kbd', { text: 'M' }),
        ' mapa · ',
        h('kbd', { text: 'F' }),
        ' voltar à oficina',
      ),
    );

    // Painel modal (Ferro-Velho, Lanchonete ou Mapa Expandido)
    this.panelSubtitle = h('span', { class: 'hud-label', text: 'Bairro' });
    this.panelTitle = h('h1', { id: 'city-panel-title', class: 'panel-title', text: 'Local do bairro' });
    this.panelCash = h('strong', { 'data-testid': 'city-panel-cash' });
    this.panelNotice = h('p', {
      class: 'panel-notice',
      role: 'status',
      'aria-live': 'polite',
      'data-testid': 'city-panel-notice',
      hidden: true,
    });
    this.panelBody = h('div', { class: 'computer-body', 'data-testid': 'city-panel-body' });

    const closeBtn = h(
      'button',
      { type: 'button', class: 'btn btn-primary panel-close', 'data-testid': 'city-panel-close' },
      h('kbd', { text: 'E' }),
      ' Voltar à rua',
    );
    closeBtn.addEventListener('click', () => this.callbacks.onClosePanel('resume'));

    this.panelElement = h(
      'div',
      {
        class: 'panel-overlay',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'city-panel-title',
        'data-testid': 'city-location-panel',
        hidden: true,
      },
      h(
        'div',
        { class: 'panel-card computer-card' },
        h(
          'div',
          { class: 'panel-top' },
          h(
            'header',
            { class: 'panel-header' },
            this.panelSubtitle,
            this.panelTitle,
            h('p', { class: 'panel-meta' }, 'Caixa da oficina: ', this.panelCash),
          ),
          closeBtn,
        ),
        this.panelNotice,
        this.panelBody,
      ),
    );

    parent.append(this.hudElement, this.panelElement);
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  get isPanelOpen(): boolean {
    return !this.panelElement.hidden;
  }

  setHudVisible(visible: boolean): void {
    this.hudElement.hidden = !visible;
  }

  updateHud(u: CityHudUpdate): void {
    const pctX = Math.max(4, Math.min(96, ((u.playerX + this.def.halfX) / (this.def.halfX * 2)) * 100));
    const pctZ = Math.max(6, Math.min(94, ((u.playerZ + this.def.halfZ) / (this.def.halfZ * 2)) * 100));
    this.playerDot.style.left = `${pctX.toFixed(1)}%`;
    this.playerDot.style.top = `${pctZ.toFixed(1)}%`;

    for (const [id, btn] of this.markerBtns) {
      btn.classList.toggle('is-visited', u.visited.has(id));
      btn.classList.toggle('is-nearby', u.nearbyLocation?.id === id);
    }

    if (u.nearbyLocation) {
      this.nearbyText.textContent = `Perto de: ${u.nearbyLocation.name} (${u.nearbyLocation.actionLabel} [E])`;
    } else {
      this.nearbyText.textContent = 'Na Rua das Oficinas · caminhe até uma porta ou use o mapa [M].';
    }
  }

  openPanel(view: CityPanelView): void {
    this.renderPanel(view);
    this.panelElement.hidden = false;
    this.panelElement.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  refreshPanel(view: CityPanelView): void {
    if (!this.isPanelOpen) return;
    this.renderPanel(view);
  }

  notify(text: string, kind: 'ok' | 'warn' | 'blocked'): void {
    this.panelNotice.textContent = text;
    this.panelNotice.dataset.kind = kind;
    this.panelNotice.hidden = false;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => (this.panelNotice.hidden = true), 4000);
  }

  closePanel(): void {
    this.panelElement.hidden = true;
    this.panelNotice.hidden = true;
  }

  dispose(): void {
    window.clearTimeout(this.noticeTimer);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.hudElement.remove();
    this.panelElement.remove();
  }

  private renderPanel(v: CityPanelView): void {
    this.panelCash.textContent = v.cashText;
    if (v.mode === 'ferro-velho') {
      this.panelSubtitle.textContent = 'Bairro de São Cristóvão · Desmanche Legalizado';
      this.panelTitle.textContent = 'Ferro-Velho do Tião';
      const sellBtn = h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          'data-testid': 'sell-scrap-btn',
          disabled: v.scrapCount === 0,
        },
        v.scrapCount > 0 ? `Vender ${v.scrapCount} sucata(s) por ${v.scrapTotalText}` : 'Nenhuma sucata para vender',
      );
      sellBtn.addEventListener('click', () => this.callbacks.onSellScrap());

      const scrapCard = h(
        'section',
        { class: 'panel-section' },
        h('h2', { class: 'section-title', text: 'Venda de sucata da oficina' }),
        h(
          'p',
          { class: 'muted' },
          v.scrapCount > 0
            ? `Você trouxe ${v.scrapCount} peça(s) velha(s) substituída(s) nos reparos. O Tião paga ${v.scrapTotalText} à vista.`
            : 'Quando você remove peças velhas nos reparos da oficina, elas acumulam como sucata e podem ser vendidas aqui.',
        ),
        sellBtn,
      );

      const offerItems = v.salvageOffers.map((o) => {
        const buyBtn = h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            'data-testid': `buy-salvage-${o.partId}`,
            disabled: o.bought,
          },
          o.bought ? 'Já garimpada hoje' : `Garimpar por ${formatBRL(o.unitPrice)}`,
        );
        buyBtn.addEventListener('click', () => this.callbacks.onBuySalvage(o.partId));
        return h(
          'li',
          { class: 'test-item', 'data-salvage-part': o.partId },
          h(
            'div',
            { class: 'test-info' },
            h('strong', { text: o.partName }),
            h('span', {
              class: 'muted',
              text: `Pronta-entrega · preço de tabela ${formatBRL(o.originalCost)} → no garimpo: ${formatBRL(o.unitPrice)}`,
            }),
          ),
          buyBtn,
        );
      });

      const offersSection = h(
        'section',
        { class: 'panel-section' },
        h('h2', { class: 'section-title', text: 'Garimpo do dia (pronta-entrega)' }),
        h('ul', { class: 'test-list', 'data-testid': 'salvage-list' }, ...offerItems),
      );

      this.panelBody.replaceChildren(scrapCard, offersSection);
      return;
    }

    if (v.mode === 'lanchonete') {
      this.panelSubtitle.textContent = 'Bairro de São Cristóvão · Balcão Carioca';
      this.panelTitle.textContent = 'Lanchonete da Tia Léa';
      const menuRows = v.snacks.map((snack) => {
        const btn = h(
          'button',
          {
            type: 'button',
            class: 'btn btn-small',
            'data-testid': `buy-snack-${snack.id}`,
          },
          `Pedir (${formatBRL(snack.price)})`,
        );
        btn.addEventListener('click', () => this.callbacks.onBuySnack(snack));
        return h(
          'li',
          { class: 'test-item', 'data-snack': snack.id },
          h(
            'div',
            { class: 'test-info' },
            h('strong', { text: `${snack.name} · ${formatBRL(snack.price)}` }),
            h('span', { class: 'muted', text: `${snack.description} (+${snack.minutes} min)` }),
          ),
          btn,
        );
      });
      this.panelBody.replaceChildren(
        h('p', { class: 'muted', text: 'Tia Léa: "Encosta aí no balcão, meu filho! Vai um cafezinho fresco ou um pastel com caldo de cana?"' }),
        h('ul', { class: 'test-list', 'data-testid': 'snack-list' }, ...menuRows),
      );
      return;
    }

    // Modo 'mapa'
    this.panelSubtitle.textContent = 'Navegação Rápida · Prompt 14';
    this.panelTitle.textContent = 'Mapa do Bairro de São Cristóvão';
    const locRows = v.locations.map((loc) => {
      const visited = v.visited.has(loc.id);
      const goBtn = h(
        'button',
        {
          type: 'button',
          class: 'btn btn-small',
          'data-testid': `goto-location-${loc.id}`,
        },
        loc.actionLabel,
      );
      goBtn.addEventListener('click', () => this.callbacks.onSelectMarker(loc.id));
      return h(
        'li',
        { class: 'test-item', 'data-map-location': loc.id },
        h(
          'div',
          { class: 'test-info' },
          h('strong', { text: `${loc.name} · ${loc.subtitle}${visited ? ' (Visitado)' : ''}` }),
          h('span', { class: 'muted', text: loc.description }),
        ),
        goBtn,
      );
    });
    this.panelBody.replaceChildren(
      h('p', { class: 'muted', text: 'Escolha um estabelecimento para caminhar até a porta e interagir, ou feche para andar livremente pela rua.' }),
      h('ul', { class: 'test-list', 'data-testid': 'city-map-list' }, ...locRows),
    );
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isPanelOpen) return;
    if (event.code === 'KeyE' || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) this.callbacks.onClosePanel(event.key === 'Escape' ? 'pause' : 'resume');
    }
  };
}
