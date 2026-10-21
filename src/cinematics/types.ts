import type { DialogueLine } from '../missions/types';

/** Ponto 3D simples (metros). */
export type Vec3 = readonly [number, number, number];

/**
 * Cena de cinema (Prompt 23), toda em dados. Uma cena é uma lista de tomadas;
 * cada tomada tem cenário, câmera em trilho, letreiro, falas e, às vezes,
 * uma escolha cuja consequência fica registrada.
 * Textos aceitam {nome}, {parente} e {cliente}.
 */
export interface CinematicDef {
  id: string;
  shots: readonly CinematicShot[];
}

export type CinematicScene = 'preto' | 'oficina' | 'rua';

export interface CinematicShot {
  id: string;
  /** 'preto' = só letreiro e falas sobre fundo escuro; 'oficina'/'rua' = a cena 3D. */
  scene: CinematicScene;
  /** Duração mínima (s). Com falas, a tomada dura pelo menos o tempo de leitura delas. */
  minSeconds: number;
  /** Câmera em trilho: vai de `from` a `to` olhando de `lookFrom` a `lookTo`. */
  camera?: { from: Vec3; to: Vec3; lookFrom: Vec3; lookTo: Vec3 };
  /** Letreiro grande (ex.: "São Cristóvão · manhã seguinte"). */
  title?: string;
  lines: readonly DialogueLine[];
  choice?: CinematicChoice;
}

export interface CinematicChoice {
  /** Pergunta mostrada junto das opções. */
  prompt: DialogueLine;
  options: ReadonlyArray<{ id: string; label: string; reply: DialogueLine }>;
}

/** Quem o jogador é na história (Prompt 23). Vai para o save. */
export interface PlayerProfile {
  name: string;
  /** Como o Seu Zé trata o jogador. */
  pronoun: 'ele' | 'ela' | 'neutro';
  /** Escolha da abertura (null = pulou ou ainda não viu). */
  introChoice: string | null;
  introSeen: boolean;
}

export const DEFAULT_PROFILE: PlayerProfile = { name: 'Rafa', pronoun: 'neutro', introChoice: null, introSeen: false };

export const PRONOUN_LABEL: Readonly<Record<PlayerProfile['pronoun'], string>> = {
  ele: 'Sobrinho',
  ela: 'Sobrinha',
  neutro: 'Prefiro só o meu nome',
};

/** Como o Seu Zé chama o jogador ("E aí, {parente}?"). */
export function kinTerm(profile: PlayerProfile): string {
  return profile.pronoun === 'ele' ? 'sobrinho' : profile.pronoun === 'ela' ? 'sobrinha' : profile.name;
}

/** Nome digitado limpo: sem espaços sobrando, até 20 letras; vazio vira o padrão. */
export function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 20);
  return name || DEFAULT_PROFILE.name;
}

export function profileProblems(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return ['perfil do jogador ausente'];
  const p = raw as Partial<PlayerProfile>;
  const out: string[] = [];
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 20) out.push('nome do jogador inválido');
  if (!['ele', 'ela', 'neutro'].includes(String(p.pronoun))) out.push('tratamento do jogador inválido');
  if (p.introChoice !== null && typeof p.introChoice !== 'string') out.push('escolha da abertura inválida');
  if (typeof p.introSeen !== 'boolean') out.push('marcador da abertura inválido');
  return out;
}
