/// <reference types="vite/client" />

/** Diagnóstico exposto em dev ou com ?debug (usado pelos testes e2e). */
interface GameDiagnostics {
  frame: number;
  state: string;
  clock: string;
  player: { x: number; z: number; yaw: number; pitch: number; speed: number };
  renderer: { calls: number; triangles: number; geometries: number; textures: number };
  interaction: { focus: string | null };
  equipment: {
    lift: string;
    liftHeight: number;
    hood: string;
    drawer: string;
    hallLightsOn: boolean;
    benchLampOn: boolean;
    playerUnderCar: boolean;
  };
  vehicle: { plate: string; mileageKm: number; historyEntries: number; sessionVersion: number };
  panelOpen: boolean;
  stockOpen: boolean;
  held: string | null;
  cash: number;
  reputation: number;
  computerOpen: boolean;
  order: { status: string | null; approvedTotal: number | null; quality: string | null; invalidAttempts: number };
  diagnosis: {
    caseId: string | null;
    caseNumber: number;
    evidence: number;
    concluded: boolean;
    records: Array<{ caseId: string; chosenSlot: string; correct: boolean }>;
  };
  mission: {
    id: string | null;
    step: string | null;
    recovering: boolean;
    completed: string[];
    tips: boolean;
    dialogue: string | null;
    awaitingChoice: boolean;
    highlight: string | null;
  };
  debt: { balance: number; paidCount: number; nextDueDay: number };
  canvas: { width: number; height: number; clientWidth: number; clientHeight: number };
}

/** Ganchos para testes automatizados (só em dev ou com ?debug). */
interface GameTestHooks {
  /** Entra no jogo sem capturar o mouse (navegador headless não captura). */
  startWithoutPointerLock(fresh?: boolean): string;
  pause(): string;
  getState(): string;
  /** Cópia do estado REAL do carro de demonstração (só para testes). */
  vehicleState(): unknown;
  /** Executa uma operação de domínio no carro de demonstração. */
  vehicleOp(op: {
    kind: 'install' | 'remove' | 'setWear' | 'reveal' | 'drive';
    slot?: string;
    partId?: string;
    condition?: 'nova' | 'usada' | 'recondicionada';
    wear?: number;
    km?: number;
  }): { ok: boolean; code?: string; message?: string };
  /** Força um autosave agora (true = gravou). */
  autosaveNow(): Promise<boolean>;
  /** Faz o jogo aceitar entrar sem capturar o mouse (headless). */
  bypassPointerLock(): void;
  /** Posiciona o jogador (para mirar em algo de forma determinística). */
  teleport(x: number, z: number, yaw: number, pitch?: number): string;
  /** Escolhe a opção n (1, 2, 3) do diálogo na tela. */
  dialogueChoose(n: number): boolean;
  /** Pula a fala atual do diálogo. */
  skipDialogueLine(): void;
}

interface Window {
  __GAME_DIAGNOSTICS__?: GameDiagnostics;
  __GAME_TEST_HOOKS__?: GameTestHooks;
}
