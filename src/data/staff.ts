import type { StaffCandidateDef, StaffTaskKind } from '../staff/types';

/**
 * Candidatos a funcionário da oficina em São Cristóvão (GDD §17.1 e §24 Prompt 15).
 * Dois cargos (`ajudante` e `mecanico`), cada um com habilidade, velocidade e salário diário em centavos.
 */
export const STAFF_CANDIDATES: readonly StaffCandidateDef[] = [
  {
    id: 'caio-ajudante',
    name: 'Caio "Mão-Rápida" Souza',
    role: 'ajudante',
    skill: 35,
    speed: 1.2,
    salary: 90_00,
    blurb: 'Ajudante ágil do bairro. Ótimo para inspeções visuais iniciais e manter a bancada organizada.',
  },
  {
    id: 'bianca-ajudante',
    name: 'Bianca Rocha',
    role: 'ajudante',
    skill: 50,
    speed: 1.0,
    salary: 110_00,
    blurb: 'Estudante de curso técnico automotivo. Faz triagem visual caprichada e separa ferramentas sem erro.',
  },
  {
    id: 'marcos-mecanico',
    name: 'Marcos "Para-Choque" Silva',
    role: 'mecanico',
    skill: 70,
    speed: 1.1,
    salary: 180_00,
    blurb: 'Mecânico experiente em freios, suspensão e motor. Assume desmontagens e revisões técnicas.',
  },
  {
    id: 'renata-mecanica',
    name: 'Renata Lima',
    role: 'mecanico',
    skill: 88,
    speed: 1.3,
    salary: 240_00,
    blurb: 'Mecânica plena de mão cheia e ritmo forte. Executa qualquer tarefa técnica da fila com rapidez.',
  },
];

/** Tarefas padrão de oficina que o jogador pode colocar na fila da equipe pelo computador. */
export interface StandardStaffTaskDef {
  id: string;
  kind: StaffTaskKind;
  title: string;
  minSkill: number;
  baseMinutes: number;
  description: string;
}

export const STANDARD_STAFF_TASKS: readonly StandardStaffTaskDef[] = [
  {
    id: 'std-inspecao-box',
    kind: 'inspecao-visual',
    title: 'Inspeção visual no carro do box',
    minSkill: 25,
    baseMinutes: 15,
    description: 'Avalia visualmente uma peça ainda não inspecionada do veículo ativo na OS.',
  },
  {
    id: 'std-organizar-bancada',
    kind: 'organizar-bancada',
    title: 'Organizar bancada e ferramentas do box',
    minSkill: 20,
    baseMinutes: 12,
    description: 'Limpa a bancada, confere torquímetro e deixa o posto pronto para o próximo serviço.',
  },
  {
    id: 'std-desmontagem-os',
    kind: 'desmontagem-auxiliar',
    title: 'Desmontagem auxiliar na OS ativa',
    minSkill: 60,
    baseMinutes: 22,
    description: 'Exige Mecânico (hab. 60+): adianta a preparação ou remoção técnica de componente.',
  },
  {
    id: 'std-revisao-preventiva',
    kind: 'revisao-preventiva',
    title: 'Revisão preventiva de segurança',
    minSkill: 70,
    baseMinutes: 25,
    description: 'Exige Mecânico (hab. 70+): confere aperto, fluidos e folgas gerais do veículo no box.',
  },
];
