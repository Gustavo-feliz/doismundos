import { h } from './dom';

/**
 * Erros visíveis na tela (não só no console). Não depende do resto do jogo,
 * para funcionar mesmo se a inicialização falhar no meio.
 */
let current: HTMLElement | null = null;

export function showFatalError(title: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[jogo] ${title}`, error);
  current?.remove();

  const reload = h('button', { type: 'button', class: 'btn btn-primary', text: 'Recarregar' });
  reload.addEventListener('click', () => window.location.reload());

  current = h(
    'div',
    { class: 'error-overlay', role: 'alertdialog', 'aria-labelledby': 'error-title', 'data-testid': 'error-overlay' },
    h(
      'div',
      { class: 'error-card' },
      h('h1', { id: 'error-title', text: title }),
      h('pre', { class: 'error-message', text: message }),
      h('p', { class: 'menu-note', text: 'Detalhes técnicos no console do navegador (F12).' }),
      reload,
    ),
  );
  document.body.append(current);
  reload.focus();
}

let toastTimer = 0;

/** Aviso discreto para erros que não impedem o jogo de continuar. */
export function showToast(text: string): void {
  let toast = document.querySelector<HTMLElement>('.toast');
  if (!toast) {
    toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(toast);
  }
  toast.textContent = text;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toast) toast.hidden = true;
  }, 5000);
}
