import { describe, expect, it } from 'vitest';
import { CinematicPlayer, cameraAt } from '../../src/cinematics/CinematicPlayer';
import { cleanName, DEFAULT_PROFILE, kinTerm, profileProblems, type CinematicDef } from '../../src/cinematics/types';
import { validateCinematics } from '../../src/cinematics/validate';
import { CINEMATICS, OPENING_ID } from '../../src/data/cinematics';
import { lineSeconds } from '../../src/missions/DialogueRunner';
import { DataValidationError } from '../../src/vehicles/types';

const opening = CINEMATICS.find((c) => c.id === OPENING_ID)!;

/** Avança até a cena pedir uma escolha (ou acabar), com teto de segurança. */
function runUntilChoice(p: CinematicPlayer) {
  for (let i = 0; i < 2000 && !p.frame().options && !p.done; i++) p.update(0.1);
}

describe('abertura (Prompt 23)', () => {
  it('os dados da abertura são válidos', () => {
    expect(() => validateCinematics(CINEMATICS)).not.toThrow();
    expect(opening.shots.map((s) => s.id)).toEqual(['ligacao', 'rua', 'seu-ze', 'portao', 'bancada', 'escolha', 'buzina']);
  });

  it('erros de dados viram mensagens úteis', () => {
    const bad: CinematicDef = { id: 'X', shots: [{ id: 'a', scene: 'oficina', minSeconds: 0, lines: [{ speaker: 'seu-ze', text: '' }] }] };
    try {
      validateCinematics([bad]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataValidationError);
      const m = (e as Error).message;
      expect(m).toContain('ID inválido');
      expect(m).toContain('cena 3D precisa de câmera');
      expect(m).toContain('duração mínima');
      expect(m).toContain('fala vazia');
    }
  });

  it('toca as falas no tempo de leitura, e a escolha espera o jogador', () => {
    const p = new CinematicPlayer(opening);
    expect(p.frame()).toMatchObject({ shotIndex: 0, line: { speaker: 'narrador' } });
    p.update(lineSeconds(opening.shots[0]!.lines[0]!.text));
    expect(p.frame().line?.text).toContain('tia Neide');
    runUntilChoice(p);
    const f = p.frame();
    expect(f.shot.id).toBe('escolha');
    expect(f.options?.map((o) => o.id)).toEqual(['reabrir', 'avaliar']);
    p.update(999); // esperando: o tempo não pula a escolha
    expect(p.frame().options).not.toBeNull();
    p.skipLine(); // Enter não pula escolha
    expect(p.frame().options).not.toBeNull();
    expect(p.choose(3)).toBeNull();
    expect(p.choose(1)).toBe('reabrir');
    expect(p.frame().line?.text).toMatch(/Tonhão ia gostar/);
    expect(p.choice).toBe('reabrir');
    for (let i = 0; i < 2000 && !p.done; i++) p.update(0.1);
    expect(p.done).toBe(true);
  });

  it('Enter pula fala por fala; segurar Esc pula tudo', () => {
    const p = new CinematicPlayer(opening);
    p.skipLine();
    expect(p.frame().line?.text).toContain('tia Neide');
    p.skipAll();
    expect(p.done).toBe(true);
    expect(p.choice).toBeNull();
  });

  it('câmera em trilho suave; com "reduzir movimento" vai direto ao fim (sem deslizar)', () => {
    const shot = opening.shots[1]!;
    const start = cameraAt(shot, 0, false)!;
    const mid = cameraAt(shot, 0.5, false)!;
    const calm = cameraAt(shot, 0, true)!;
    expect(start.position).toEqual(shot.camera!.from);
    expect(mid.position[2]).toBeLessThan(shot.camera!.from[2]);
    expect(calm.position).toEqual(shot.camera!.to);
    expect(cameraAt(opening.shots[0]!, 0.5, false)).toBeNull(); // tomada no escuro
  });
});

describe('perfil do jogador', () => {
  it('nome limpo e tratamento usado nas falas', () => {
    expect(cleanName('   Gustavo   Feliz  ')).toBe('Gustavo Feliz');
    expect(cleanName('')).toBe(DEFAULT_PROFILE.name);
    expect(cleanName('x'.repeat(40))).toHaveLength(20);
    expect(kinTerm({ ...DEFAULT_PROFILE, pronoun: 'ele' })).toBe('sobrinho');
    expect(kinTerm({ ...DEFAULT_PROFILE, pronoun: 'ela' })).toBe('sobrinha');
    expect(kinTerm({ ...DEFAULT_PROFILE, name: 'Bia', pronoun: 'neutro' })).toBe('Bia');
  });

  it('perfil vindo do save é conferido', () => {
    expect(profileProblems(DEFAULT_PROFILE)).toEqual([]);
    expect(profileProblems({ ...DEFAULT_PROFILE, pronoun: 'outro' })).toEqual(['tratamento do jogador inválido']);
    expect(profileProblems(null)).toEqual(['perfil do jogador ausente']);
  });
});

describe('abertura: elenco, hora e clima por tomada (Prompt 22 ligado ao 23)', () => {
  it('o Seu Zé aparece quando fala com você e a ligação é à noite, com chuva', () => {
    const shot = (id: string) => opening.shots.find((s) => s.id === id)!;
    expect(shot('ligacao')).toMatchObject({ timeOfDay: 23 * 60, weather: 'chuva' });
    expect(shot('rua').timeOfDay).toBe(7 * 60);
    for (const id of ['seu-ze', 'escolha']) expect(shot(id).cast?.map((c) => c.role)).toContain('seu-ze');
    expect(shot('seu-ze').cast?.[0]?.animation).toBe('talking');
  });

  it('a validação recusa elenco desconhecido, repetido, no escuro e hora inválida', () => {
    const base = opening.shots.find((s) => s.id === 'seu-ze')!;
    const bad: CinematicDef = {
      id: 'teste',
      shots: [
        { ...base, id: 'a', cast: [{ role: 'fantasma' as never, position: [0, 0, 0], yaw: 0, animation: 'idle' }] },
        { ...base, id: 'b', cast: [base.cast![0]!, base.cast![0]!] },
        { ...base, id: 'c', scene: 'preto', camera: undefined, cast: [base.cast![0]!] },
        { ...base, id: 'd', timeOfDay: 1440 },
        { ...base, id: 'e', cast: [{ ...base.cast![0]!, animation: 'dancing' as never }] },
      ],
    };
    try {
      validateCinematics([bad]);
      expect.unreachable();
    } catch (e) {
      const msg = (e as DataValidationError).message;
      expect(msg).toContain('desconhecido "fantasma"');
      expect(msg).toContain('repetido no elenco');
      expect(msg).toContain('no escuro não mostra elenco');
      expect(msg).toContain('minuto de 0 a 1439');
      expect(msg).toContain('animação desconhecida');
    }
  });
});
