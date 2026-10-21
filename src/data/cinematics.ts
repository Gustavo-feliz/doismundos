import type { CinematicDef } from '../cinematics/types';

/**
 * Abertura do jogo (Prompt 23): quem é o jogador, quem era o tio Tonhão, a
 * dívida, o Seu Zé e o primeiro cliente. Pulável. Textos aceitam {nome} e
 * {parente} (como o Seu Zé chama o jogador).
 *
 * Coordenadas na cena da oficina: x de -7 a 7, z de -9 a 9; o portão fica em
 * z = 9 (x de -2,5 a 2,5) e a rua vai de z = 9 até as fachadas (z ≈ 30).
 * PROVISÓRIO: sem modelos de personagem ainda (Prompt 22); as falas vêm em
 * legenda e a câmera conta a história. Quando o Seu Zé tiver modelo, ele
 * entra nas tomadas "seu-ze" e "escolha".
 */
export const OPENING_ID = 'abertura';

export const CINEMATICS: readonly CinematicDef[] = [
  {
    id: OPENING_ID,
    shots: [
      {
        id: 'ligacao',
        scene: 'preto',
        minSeconds: 3,
        title: 'Rio de Janeiro · 23h',
        lines: [
          { speaker: 'narrador', text: 'Chuva fina na janela. O telefone toca no meio da noite.' },
          { speaker: 'narrador', text: '— {nome}? É a tia Neide. O seu tio Tonhão… ele se foi hoje à tarde.' },
          { speaker: 'narrador', text: '— Ele deixou a oficina pra você. Amanhã cedo o Seu Zé te espera lá em São Cristóvão.' },
        ],
      },
      {
        id: 'rua',
        scene: 'rua',
        minSeconds: 5,
        title: 'São Cristóvão · manhã seguinte',
        camera: { from: [7, 2.6, 24], to: [3.5, 2, 17], lookFrom: [0, 2.6, 9], lookTo: [0, 2.2, 9] },
        lines: [{ speaker: 'narrador', text: 'Rua das Oficinas. O portão de aço meio enferrujado, a placa da oficina apagada.' }],
      },
      {
        id: 'seu-ze',
        scene: 'rua',
        minSeconds: 4,
        camera: { from: [2.2, 1.7, 14], to: [1, 1.65, 12.5], lookFrom: [0, 1.7, 9], lookTo: [-0.4, 1.6, 9] },
        lines: [
          { speaker: 'seu-ze', text: '{nome}! Sou o Zé. Trabalhei trinta anos aqui com o teu tio.' },
          { speaker: 'seu-ze', text: 'O Tonhão era o melhor mecânico de São Cristóvão. Mas os últimos anos foram duros.' },
          { speaker: 'seu-ze', text: 'A oficina foi perdendo cliente e ficou uma dívida no banco. Se ninguém tocar, o banco leva.' },
          { speaker: 'seu-ze', text: 'Ele queria que ficasse com a família. Toma: as chaves agora são tuas.' },
        ],
      },
      {
        id: 'portao',
        scene: 'oficina',
        minSeconds: 5,
        camera: { from: [0, 1.7, 13], to: [0.4, 1.7, 5.5], lookFrom: [0, 1.6, 0], lookTo: [-1.4, 1.1, -1.2] },
        lines: [{ speaker: 'narrador', text: 'O portão sobe rangendo. Lá dentro, poeira no ar e tudo do jeito que o Tonhão deixou.' }],
      },
      {
        id: 'bancada',
        scene: 'oficina',
        minSeconds: 4,
        camera: { from: [-1.5, 1.8, -3.5], to: [-2.8, 1.6, -5], lookFrom: [-4.1, 1.1, -7.6], lookTo: [-4.1, 1, -7.8] },
        lines: [{ speaker: 'seu-ze', text: 'Cada ferramenta aqui tem história. O Tonhão nunca jogou nada fora.' }],
      },
      {
        id: 'escolha',
        scene: 'oficina',
        minSeconds: 3,
        camera: { from: [4.5, 2.4, 5.5], to: [4, 2.2, 4.5], lookFrom: [-1.6, 1, -1.2], lookTo: [-1.6, 0.9, -1.2] },
        lines: [],
        choice: {
          prompt: { speaker: 'seu-ze', text: 'E aí, {parente}? O que você vai fazer com isso aqui?' },
          options: [
            { id: 'reabrir', label: 'Vou reabrir a oficina.', reply: { speaker: 'seu-ze', text: 'É assim que se fala! O Tonhão ia gostar de ouvir isso.' } },
            { id: 'avaliar', label: 'Só vou ver se dá pra salvar.', reply: { speaker: 'seu-ze', text: 'Justo. Mas olha: oficina parada não paga banco.' } },
          ],
        },
      },
      {
        id: 'buzina',
        scene: 'oficina',
        minSeconds: 4,
        camera: { from: [3.5, 2, 4], to: [1.6, 1.6, 2.6], lookFrom: [-1.6, 0.9, -1.2], lookTo: [-1.6, 0.8, -1.2] },
        lines: [
          { speaker: 'narrador', text: 'Bi-bi! Um carro buzina no portão, chiando a cada freada.' },
          { speaker: 'seu-ze', text: 'Olha o Marcão aí. Teu primeiro cliente. Bora?' },
        ],
      },
    ],
  },
];
