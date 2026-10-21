import type { WarningLight } from '../driving/types';
import { h, setText } from './dom';

export interface DrivingHudData {
  speedKmh: number;
  limitKmh: number;
  rpm: number;
  maxRpm: number;
  gear: string;
  /** 0–1 */
  temperature: number;
  lights: readonly WarningLight[];
  /** Aviso fixo (ex.: "O motor não pega: ..."); null = nenhum. */
  message: string | null;
}

const LIGHT_LABEL: Readonly<Record<WarningLight, string>> = {
  bateria: 'Bateria',
  oleo: 'Óleo',
  temperatura: 'Temperatura',
  freio: 'Freio',
  injecao: 'Injeção',
};
const ALL_LIGHTS = Object.keys(LIGHT_LABEL) as WarningLight[];

/**
 * Painel do test drive (GDD Prompt 13): velocímetro, conta-giros, marcha,
 * temperatura e luzes de alerta essenciais, mais os controles.
 */
export class DrivingHud {
  readonly element: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly rpmBar: HTMLElement;
  private readonly rpmText: HTMLElement;
  private readonly gear: HTMLElement;
  private readonly temp: HTMLElement;
  private readonly message: HTMLElement;
  private readonly lights = new Map<WarningLight, HTMLElement>();

  constructor(parent: HTMLElement) {
    this.speed = h('strong', { class: 'drive-speed', 'data-testid': 'drive-speed', text: '0' });
    this.rpmBar = h('span', { class: 'drive-rpm-fill' });
    this.rpmText = h('span', { class: 'drive-rpm-text', 'data-testid': 'drive-rpm' });
    this.gear = h('strong', { class: 'drive-gear', 'data-testid': 'drive-gear' });
    this.temp = h('span', { class: 'drive-temp-fill' });
    this.message = h('div', { class: 'drive-message', 'data-testid': 'drive-message', role: 'status', hidden: true });
    const lights = h('div', { class: 'drive-lights', 'data-testid': 'drive-lights' });
    for (const l of ALL_LIGHTS) {
      const el = h('span', { class: 'drive-light', 'data-light': l, 'data-on': 'false', text: LIGHT_LABEL[l] });
      this.lights.set(l, el);
      lights.append(el);
    }
    this.element = h(
      'div',
      { class: 'drive-hud', 'data-testid': 'drive-hud', hidden: true },
      h(
        'div',
        { class: 'drive-dash' },
        h('div', { class: 'drive-gauge' }, this.speed, h('span', { class: 'hud-label', text: 'km/h' })),
        h(
          'div',
          { class: 'drive-gauge drive-gauge-wide' },
          h('span', { class: 'hud-label', text: 'Rotação' }),
          h('span', { class: 'drive-rpm' }, this.rpmBar),
          this.rpmText,
          h('span', { class: 'hud-label', text: 'Temperatura' }),
          h('span', { class: 'drive-temp' }, this.temp),
        ),
        h('div', { class: 'drive-gauge' }, this.gear, h('span', { class: 'hud-label', text: 'Marcha' })),
        lights,
      ),
      this.message,
      h(
        'div',
        { class: 'drive-help' },
        'Test drive · ',
        h('kbd', { text: 'W' }),
        ' acelerar · ',
        h('kbd', { text: 'S' }),
        ' frear/ré · ',
        h('kbd', { text: 'A' }),
        h('kbd', { text: 'D' }),
        ' esterçar · ',
        h('kbd', { text: 'Espaço' }),
        ' freio de mão · ',
        h('kbd', { text: 'R' }),
        ' recomeçar · ',
        h('kbd', { text: 'F' }),
        ' voltar à oficina',
      ),
    );
    parent.append(this.element);
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  update(d: DrivingHudData): void {
    setText(this.speed, String(Math.round(d.speedKmh)));
    this.speed.dataset.over = String(d.speedKmh >= d.limitKmh - 0.5);
    this.rpmBar.style.width = `${Math.round(Math.min(1, d.rpm / d.maxRpm) * 100)}%`;
    setText(this.rpmText, `${Math.round(d.rpm / 100) * 100} rpm`);
    setText(this.gear, d.gear);
    this.temp.style.width = `${Math.round(Math.min(1, d.temperature) * 100)}%`;
    this.temp.dataset.hot = String(d.temperature >= 0.8);
    for (const [l, el] of this.lights) {
      const on = String(d.lights.includes(l));
      if (el.dataset.on !== on) el.dataset.on = on;
    }
    this.message.hidden = !d.message;
    if (d.message) setText(this.message, d.message);
  }

  dispose(): void {
    this.element.remove();
  }
}
