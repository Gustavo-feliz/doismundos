import { DEFAULT_SETTINGS, SETTINGS_LIMITS, type GraphicsQuality, type Settings } from '../save/settings';
import { h } from './dom';

/** Formulário de configurações (GDD §20.4, subconjunto inicial). */
export class SettingsPanel {
  readonly element: HTMLElement;
  private settings: Settings;
  private readonly sensitivity: HTMLInputElement;
  private readonly sensitivityOut: HTMLOutputElement;
  private readonly fov: HTMLInputElement;
  private readonly fovOut: HTMLOutputElement;
  private readonly invertY: HTMLInputElement;
  private readonly reduceMotion: HTMLInputElement;
  private readonly quality: HTMLSelectElement;
  private readonly assist: HTMLInputElement;
  private readonly volume: HTMLInputElement;
  private readonly volumeOut: HTMLOutputElement;

  constructor(initial: Settings, private readonly onChange: (settings: Settings) => void) {
    this.settings = { ...initial };
    const { mouseSensitivity: ms, fov } = SETTINGS_LIMITS;

    this.sensitivity = h('input', { type: 'range', id: 'set-sensitivity', min: ms.min, max: ms.max, step: ms.step });
    this.sensitivityOut = h('output', { for: 'set-sensitivity' });
    this.fov = h('input', { type: 'range', id: 'set-fov', min: fov.min, max: fov.max, step: fov.step });
    this.fovOut = h('output', { for: 'set-fov' });
    this.invertY = h('input', { type: 'checkbox', id: 'set-invert' });
    this.reduceMotion = h('input', { type: 'checkbox', id: 'set-motion' });
    this.assist = h('input', { type: 'checkbox', id: 'set-assist' });
    this.volume = h('input', { type: 'range', id: 'set-volume', min: 0, max: 1, step: 0.05 });
    this.volumeOut = h('output', { for: 'set-volume' });
    this.quality = h(
      'select',
      { id: 'set-quality' },
      h('option', { value: 'baixa', text: 'Baixa (sem sombras)' }),
      h('option', { value: 'media', text: 'Média' }),
      h('option', { value: 'alta', text: 'Alta' }),
    );

    const row = (label: string, forId: string, ...controls: Node[]) =>
      h('div', { class: 'settings-row' }, h('label', { for: forId, text: label }), h('div', { class: 'settings-control' }, ...controls));

    const reset = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Restaurar padrão' });
    reset.addEventListener('click', () => {
      this.settings = { ...DEFAULT_SETTINGS };
      this.sync();
      this.onChange({ ...this.settings });
    });

    this.element = h(
      'div',
      { class: 'settings' },
      row('Sensibilidade do mouse', 'set-sensitivity', this.sensitivity, this.sensitivityOut),
      row('Campo de visão', 'set-fov', this.fov, this.fovOut),
      row('Inverter eixo vertical', 'set-invert', this.invertY),
      row('Reduzir movimento da câmera', 'set-motion', this.reduceMotion),
      row('Qualidade gráfica', 'set-quality', this.quality),
      row('Dicas no diagnóstico', 'set-assist', this.assist),
      row('Volume dos efeitos', 'set-volume', this.volume, this.volumeOut),
      h('div', { class: 'settings-actions' }, reset),
    );

    this.sensitivity.addEventListener('input', () => this.commit({ mouseSensitivity: Number(this.sensitivity.value) }));
    this.fov.addEventListener('input', () => this.commit({ fov: Number(this.fov.value) }));
    this.invertY.addEventListener('change', () => this.commit({ invertY: this.invertY.checked }));
    this.reduceMotion.addEventListener('change', () => this.commit({ reduceMotion: this.reduceMotion.checked }));
    this.quality.addEventListener('change', () => this.commit({ quality: this.quality.value as GraphicsQuality }));
    this.assist.addEventListener('change', () => this.commit({ diagnosisAssist: this.assist.checked }));
    this.volume.addEventListener('input', () => this.commit({ sfxVolume: Number(this.volume.value) }));
    this.sync();
  }

  private commit(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.syncOutputs();
    this.onChange({ ...this.settings });
  }

  private sync(): void {
    this.sensitivity.value = String(this.settings.mouseSensitivity);
    this.fov.value = String(this.settings.fov);
    this.invertY.checked = this.settings.invertY;
    this.reduceMotion.checked = this.settings.reduceMotion;
    this.quality.value = this.settings.quality;
    this.assist.checked = this.settings.diagnosisAssist;
    this.volume.value = String(this.settings.sfxVolume);
    this.syncOutputs();
  }

  private syncOutputs(): void {
    this.sensitivityOut.value = `${this.settings.mouseSensitivity.toFixed(2).replace('.', ',')}×`;
    this.fovOut.value = `${this.settings.fov}°`;
    this.volumeOut.value = `${Math.round(this.settings.sfxVolume * 100)}%`;
  }
}
