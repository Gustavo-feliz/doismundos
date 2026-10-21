// Fontes da interface (SIL OFL 1.1), servidas pelo próprio jogo (Prompt 24).
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource-variable/inter/wght.css';
import './styles.css';
import './ui/design/theme.css';
import { isWebGL2Available } from './core/Renderer';
import { Game } from './game/Game';
import { showFatalError, showToast } from './ui/ErrorOverlay';

function boot(): Game | null {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  const uiRoot = document.querySelector<HTMLElement>('#ui-root');
  const loading = document.querySelector<HTMLElement>('#loading');
  if (!canvas || !uiRoot) {
    showFatalError('Página incompleta', new Error('Elementos #game-canvas ou #ui-root não encontrados no index.html.'));
    return null;
  }
  if (!isWebGL2Available()) {
    loading?.remove();
    showFatalError(
      'WebGL 2 indisponível',
      new Error('Este navegador ou placa de vídeo não suporta WebGL 2. Use uma versão recente do Chrome, Edge ou Firefox e verifique se a aceleração por hardware está ativada.'),
    );
    return null;
  }
  try {
    const game = new Game(canvas, uiRoot);
    game.start();
    return game;
  } catch (error) {
    showFatalError('Não foi possível iniciar o jogo', error);
    return null;
  } finally {
    loading?.remove();
  }
}

// Erros fora do loop do jogo: avisa sem derrubar tudo (o loop tem seu próprio tratamento).
window.addEventListener('error', (event) => {
  console.error('[jogo] erro não tratado', event.error ?? event.message);
  showToast(`Erro: ${event.message}`);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[jogo] promessa rejeitada', event.reason);
  showToast(`Erro: ${event.reason instanceof Error ? event.reason.message : String(event.reason)}`);
});

const game = boot();

if (import.meta.hot) {
  import.meta.hot.dispose(() => game?.dispose());
}
