import type { GameEventDef } from '../events/types';

/**
 * Catálogo de eventos de fiscalização e pressão local no bairro (GDD §16.4, §16.5 e §24 Prompt 16).
 *
 * Princípios de design:
 * - Cada evento explica riscos e custos antes da decisão.
 * - Sempre há pelo menos uma alternativa recuperável sem custo em dinheiro (`cost: 0`),
 *   evitando punição inevitável caso o jogador esteja com pouco caixa.
 * - O encontro de pressão local é ficcional, sem violência gráfica e sem crime operacional.
 */
export const GAME_EVENTS: readonly GameEventDef[] = [
  {
    id: 'fiscalizacao-alvara-seguranca',
    category: 'fiscalizacao',
    title: 'Vistoria Municipal: Alvará e Descarte de Óleo',
    speaker: 'Fiscal Azevedo (Prefeitura)',
    message:
      '“Bom dia! Vistoria de rotina nas oficinas de São Cristóvão. Estamos conferindo o selo do separador de óleo e a renovação da taxa anual de funcionamento do box.”',
    trigger: {
      minDay: 2,
      minDeliveredOrders: 1,
      cooldownDays: 3,
      repeatable: true,
    },
    options: [
      {
        id: 'regularizar-na-hora',
        label: 'Quitar taxa ambiental e renovar selo na hora',
        description: 'Custo: R$ 160,00 · Tempo: 15 min · Reputação: +3 (oficina certificada no bairro).',
        cost: 160_00,
        requireCash: true,
        reputationDelta: 3,
        timeMinutes: 15,
        outcomeText:
          'O fiscal emitiu o selo verde de conformidade na hora. Os clientes do bairro elogiaram a transparência da oficina.',
      },
      {
        id: 'mutirao-adequacao-patio',
        label: 'Acompanhar vistoria e fazer limpeza técnica do tambor de óleo',
        description: 'Custo: R$ 0,00 (sem gasto) · Tempo: 40 min · Reputação: +1 (adequação imediata sem multa).',
        cost: 0,
        requireCash: false,
        reputationDelta: 1,
        timeMinutes: 40,
        outcomeText:
          'Você reorganizou os tambores de descarte e os extintores junto ao fiscal. Tudo aprovado sem multa, custando apenas tempo de trabalho.',
      },
      {
        id: 'assinar-termo-prazo',
        label: 'Assinar termo de advertência leve para não parar o serviço',
        description: 'Custo: R$ 0,00 · Tempo: 5 min · Reputação: −2 (aviso fixado no mural).',
        cost: 0,
        requireCash: false,
        reputationDelta: -2,
        timeMinutes: 5,
        outcomeText:
          'A vistoria foi encerrada rapidamente com um termo de adequação futura. Você economizou tempo e caixa, mas perdeu alguns pontos de imagem.',
      },
    ],
  },
  {
    id: 'pressao-vigilancia-rua',
    category: 'pressao-local',
    title: 'Encontro no Portão: Cobrança de “Taxa de Tranquilidade”',
    speaker: 'Peçanha (Associação Paralela da Rua)',
    message:
      '“E aí, chefia. O movimento na oficina do teu tio voltou a crescer, né? A gente cuida da iluminação e da vigia noturna aqui da quadra. Como é que a oficina vai colaborar com a nossa caixinha?”',
    trigger: {
      minDay: 3,
      minDeliveredOrders: 1,
      cooldownDays: 4,
      repeatable: true,
    },
    options: [
      {
        id: 'mobilizar-comerciantes-seu-ze',
        label: 'Recusar com apoio do Seu Zé e da Associação Comercial do Bairro',
        description: 'Custo: R$ 0,00 (sem gasto) · Tempo: 35 min · Reputação: +2 (respeito na vizinhança).',
        cost: 0,
        requireCash: false,
        reputationDelta: 2,
        timeMinutes: 35,
        outcomeText:
          'Seu Zé e os donos das lojas vizinhas vieram até a calçada apoiar você. Diante da união do quarteirão, Peçanha recuou sem insistir.',
      },
      {
        id: 'reforcar-portao-alarme',
        label: 'Instalar trava reforçada e holofote próprio na fachada',
        description: 'Custo: R$ 120,00 · Tempo: 20 min · Reputação: +1 (oficina mais protegida).',
        cost: 120_00,
        requireCash: true,
        reputationDelta: 1,
        timeMinutes: 20,
        outcomeText:
          'Você investiu na iluminação e nas travas próprias da oficina, deixando claro que não depende de vigia paralela.',
      },
      {
        id: 'pagar-contribuicao-avulsa',
        label: 'Pagar contribuição avulsa para encerrar a conversa rápido',
        description: 'Custo: R$ 180,00 · Tempo: 5 min · Reputação: −3 (vizinhos desaprovaram a concessão).',
        cost: 180_00,
        requireCash: true,
        reputationDelta: -3,
        timeMinutes: 5,
        outcomeText:
          'Peçanha foi embora rápido, mas a notícia correu na lanchonete e alguns clientes fiéis acharam ruim ceder à pressão.',
      },
    ],
  },
  {
    id: 'fiscalizacao-epi-ruido',
    category: 'fiscalizacao',
    title: 'Inspeção do Trabalho: Bancada, EPIs e Ruído',
    speaker: 'Inspetora Helena (Segurança do Trabalho)',
    message:
      '“Olá! Estamos verificando protetores auriculares, óculos de proteção na bancada e o isolamento acústico do compressor de ar.”',
    trigger: {
      minDay: 5,
      minDeliveredOrders: 2,
      cooldownDays: 3,
      repeatable: true,
    },
    options: [
      {
        id: 'comprar-kit-epi-completo',
        label: 'Adquirir kit novo de EPIs e coxins de borracha para o compressor',
        description: 'Custo: R$ 110,00 · Tempo: 10 min · Reputação: +2 (referência em segurança).',
        cost: 110_00,
        requireCash: true,
        reputationDelta: 2,
        timeMinutes: 10,
        outcomeText:
          'Com o kit novo instalado e os coxins amortecendo o compressor, a oficina recebeu nota máxima na vistoria.',
      },
      {
        id: 'revisar-bancada-manualmente',
        label: 'Ajustar correia do compressor e higienizar EPIs atuais',
        description: 'Custo: R$ 0,00 (sem gasto) · Tempo: 30 min · Reputação: 0 (vistoria regular).',
        cost: 0,
        requireCash: false,
        reputationDelta: 0,
        timeMinutes: 30,
        outcomeText:
          'Você regulou o compressor e apresentou os equipamentos limpos. A inspetora aprovou a oficina sem custos.',
      },
    ],
  },
];

