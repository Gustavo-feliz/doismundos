import { SPEAKER_NAME, type DialogueLine } from '../missions/types';
import { DataValidationError, ID_PATTERN } from '../vehicles/types';
import { CHARACTER_ROLES } from '../characters';
import type { CinematicDef, Vec3 } from './types';

const SCENES = new Set(['preto', 'oficina', 'rua']);
const ANIMATIONS = new Set(['idle', 'talking', 'walking', 'pointing']);
const vecOk = (v: Vec3) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

/** Valida as cenas ao abrir o jogo (GDD §21.3), com mensagens úteis. */
export function validateCinematics(defs: readonly CinematicDef[]): void {
  const p: string[] = [];
  const ids = new Set<string>();
  const lineOk = (l: DialogueLine, where: string) => {
    if (!(l.speaker in SPEAKER_NAME)) p.push(`${where}: personagem desconhecido "${l.speaker}"`);
    if (!l.text.trim()) p.push(`${where}: fala vazia`);
  };
  for (const d of defs) {
    const at = `cena "${d.id}"`;
    if (!ID_PATTERN.test(d.id)) p.push(`${at}: ID inválido`);
    if (ids.has(d.id)) p.push(`${at}: ID repetido`);
    ids.add(d.id);
    if (d.shots.length === 0) p.push(`${at}: sem tomadas`);
    const shotIds = new Set<string>();
    for (const s of d.shots) {
      const w = `${at}, tomada "${s.id}"`;
      if (shotIds.has(s.id)) p.push(`${w}: ID repetido`);
      shotIds.add(s.id);
      if (!SCENES.has(s.scene)) p.push(`${w}: cenário desconhecido "${s.scene}"`);
      if (!(s.minSeconds > 0)) p.push(`${w}: duração mínima precisa ser > 0`);
      if (s.scene !== 'preto' && !s.camera) p.push(`${w}: cena 3D precisa de câmera`);
      if (s.camera && ![s.camera.from, s.camera.to, s.camera.lookFrom, s.camera.lookTo].every(vecOk)) p.push(`${w}: câmera com coordenadas inválidas`);
      s.lines.forEach((l, i) => lineOk(l, `${w}, fala ${i + 1}`));
      if (s.timeOfDay !== undefined && !(Number.isInteger(s.timeOfDay) && s.timeOfDay >= 0 && s.timeOfDay < 1440)) p.push(`${w}: hora do dia precisa ser um minuto de 0 a 1439`);
      if (s.weather !== undefined && s.weather !== 'chuva') p.push(`${w}: clima desconhecido "${String(s.weather)}"`);
      const roles = new Set<string>();
      for (const c of s.cast ?? []) {
        if (!CHARACTER_ROLES.includes(c.role)) p.push(`${w}: personagem do elenco desconhecido "${c.role}"`);
        if (roles.has(c.role)) p.push(`${w}: personagem "${c.role}" repetido no elenco`);
        roles.add(c.role);
        if (!vecOk(c.position) || !Number.isFinite(c.yaw)) p.push(`${w}: posição do elenco inválida ("${c.role}")`);
        if (!ANIMATIONS.has(c.animation)) p.push(`${w}: animação desconhecida "${c.animation}"`);
        if (s.scene === 'preto') p.push(`${w}: tomada no escuro não mostra elenco`);
      }
      if (s.choice) {
        const opts = s.choice.options;
        lineOk(s.choice.prompt, `${w}, pergunta`);
        if (opts.length < 2 || opts.length > 3) p.push(`${w}: a escolha precisa de 2 ou 3 opções`);
        if (new Set(opts.map((o) => o.id)).size !== opts.length) p.push(`${w}: opções com ID repetido`);
        opts.forEach((o) => {
          if (!o.label.trim()) p.push(`${w}: opção "${o.id}" sem texto`);
          lineOk(o.reply, `${w}, resposta de "${o.id}"`);
        });
      }
    }
  }
  if (p.length) throw new DataValidationError('cenas de cinema (data/cinematics.ts)', p);
}
