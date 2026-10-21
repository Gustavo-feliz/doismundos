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
  upgrades: Record<string, number>;
  cinematic: null | { shot: string; done: boolean; choice: string | null };
  profile: { name: string; pronoun: string; introChoice: string | null; introSeen: boolean };
  /** Prompt 25: balanço/inclinação da câmera e o retorno visual na tela. */
  feel: { bob: number; roll: number; action: string | null; phase: string | null; reward: boolean; stamp: boolean };
  staff: {
    employees: Array<{
      id: string;
      role: string;
      state: string;
      currentTaskId: string | null;
      completedTasks: number;
    }>;
    tasks: Array<{
      id: string;
      status: string;
      assignedTo: string | null;
      progressMinutes: number;
      totalMinutes: number;
    }>;
    lastPayrollDay: number;
  };
  events: {
    activeEventId: string | null;
    lastTriggeredDay: number;
    historyCount: number;
    historyIds: string[];
  };
  driving: null | {
    speedKmh: number;
    rpm: number;
    gear: number;
    x: number;
    z: number;
    collisions: number;
    distance: number;
    lights: string[];
    cannotStart: string | null;
  };
  city: null | {
    active: boolean;
    nearbyLocation: string | null;
    visited: string[];
    loadedLocations: string[];
    trafficCount: number;
    pedestrianCount: number;
    trafficStopped: boolean;
    loadMs: number;
    fps: number;
    memoryMb: number | null;
  };
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
  /** Começa o test drive (como sair pelo portão) e devolve o estado. */
  startTestDrive(): Promise<string>;
  /** Motivo de o test drive estar bloqueado (null = pode). */
  testDriveBlocked(): string | null;
  /** Jogo novo vendo a abertura (sem capturar o mouse). */
  startIntro(name?: string, pronoun?: string): string;
  /** Malhas visíveis da oficina por grupo (diagnóstico de desempenho). */
  sceneStats(): { total: number; groups: Record<string, number> };
  /** Dispara um evento ignorando as regras de gatilho (só testes). */
  forceEvent(eventId: string): boolean;
  /** Prompt 25: mostra os efeitos de retorno (ação, recompensa ou carimbo) para conferir o visual. */
  previewFeedback(which: 'acao' | 'erro' | 'recompensa' | 'carimbo'): void;
  /** Sai para o bairro (Prompt 14), carregando a cena sob demanda. */
  enterNeighborhood(): Promise<boolean>;
  /** Visita um dos 5 locais do bairro (ou volta à oficina se for 'oficina'). */
  visitCityLocation(id: string): Promise<boolean>;
  /** Volta imediatamente do bairro para a oficina. */
  exitNeighborhood(): boolean;
}

interface Window {
  __GAME_DIAGNOSTICS__?: GameDiagnostics;
  __GAME_TEST_HOOKS__?: GameTestHooks;
}
