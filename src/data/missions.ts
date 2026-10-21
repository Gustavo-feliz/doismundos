import type { DialogueDef, MissionDef } from '../missions/types';

/**
 * Tutorial com o Seu Zé e o começo do Ato 1 (GDD §6, §15.2, Prompt 10).
 * Só usa sistemas que já existem. Textos aceitam marcadores trocados na hora:
 * {cliente} (cliente da OS do box 1), {vencimento} (dia da próxima parcela),
 * {parcela} (valor da próxima parcela) e as teclas escolhidas pelo jogador:
 * {interagir}, {dicas}, {andar}, {correr}.
 * PROVISÓRIO: textos e recompensas serão revisados com o roteiro final do Ato 1.
 */
export const MISSIONS: readonly MissionDef[] = [
  {
    id: 'tutorial-primeiro-dia',
    act: 1,
    title: 'Primeiro dia na oficina',
    prerequisites: [],
    startDialogue: 'prologo',
    endDialogue: 'tutorial-fim',
    reward: { cash: 150_00, text: 'Caixinha do Tonhão, entregue pelo Seu Zé' },
    failure: null,
    repeatable: false,
    steps: [
      {
        id: 'andar',
        objective: 'Ande até o carro de {cliente} no box 1',
        tip: '{andar} para andar, mouse para olhar e {correr} para correr.',
        highlight: 'carro',
        done: { kind: 'flag', flag: 'andou' },
      },
      {
        id: 'abrir-ficha',
        objective: 'Mire no carro e aperte {interagir} para abrir a ficha',
        tip: 'Com a ficha aberta o mouse fica livre. As abas são Inspeção, Diagnóstico, Orçamento e Serviço. Esc fecha.',
        highlight: 'carro',
        done: { kind: 'flag', flag: 'abriu-painel-carro' },
      },
      {
        id: 'diagnosticar',
        objective: 'Descubra a causa do defeito (aba Diagnóstico)',
        tip: 'Faça os exames que combinam com a queixa. Cada exame gasta tempo. Alguns pedem o carro no elevador ou o capô aberto.',
        highlight: 'carro',
        dialogue: 'ze-diagnostico',
        done: { kind: 'orders-reached', stage: 'orcamento', count: 1 },
      },
      {
        id: 'orcar',
        objective: 'Monte o orçamento e feche o serviço com {cliente} (aba Orçamento)',
        tip: 'Margem alta demais e o cliente recusa; baixa demais e a oficina perde dinheiro. Ele pode fazer uma contraproposta.',
        highlight: 'carro',
        done: { kind: 'orders-reached', stage: 'aprovada', count: 1 },
        recovery: [
          {
            when: { kind: 'active-order', status: 'recusada' },
            objective: 'O cliente foi embora: chame a próxima OS na ficha do carro',
            tip: 'Acontece. Ajuste o preço na próxima e siga em frente.',
          },
          {
            when: { kind: 'active-order', status: 'diagnostico' },
            objective: 'Diagnostique o carro de {cliente} e feche o orçamento',
            tip: 'Carro novo no box: comece pelos exames na aba Diagnóstico.',
          },
        ],
      },
      {
        id: 'comprar',
        objective: 'Compre a peça que falta no computador do escritório',
        tip: 'A loja marca a peça que falta para a OS. Fornecedor mais barato demora mais; dá para esperar a entrega.',
        highlight: 'computador',
        dialogue: 'ze-loja',
        done: { kind: 'any', of: [{ kind: 'purchases', count: 1 }, { kind: 'orders-reached', stage: 'concluida', count: 1 }] },
      },
      {
        id: 'reparar',
        objective: 'Pegue a peça na estante e faça o reparo (aba Serviço)',
        tip: 'Na aba Serviço: tire a peça velha, instale a nova e faça o teste final. Se a peça ainda não chegou, espere a entrega pelo computador.',
        highlight: 'estoque',
        done: { kind: 'orders-reached', stage: 'concluida', count: 1 },
      },
      {
        id: 'entregar',
        objective: 'Entregue o carro a {cliente} e receba o pagamento (aba Serviço)',
        tip: 'O cliente paga o restante na entrega e avalia o serviço.',
        highlight: 'carro',
        done: { kind: 'orders-reached', stage: 'entregue', count: 1 },
      },
      {
        id: 'conferir-caixa',
        objective: 'Confira o caixa no computador (aba Caixa)',
        tip: 'O livro-caixa mostra cada entrada e saída. A dívida com o banco também aparece lá.',
        highlight: 'computador',
        done: { kind: 'flag', flag: 'viu-caixa' },
      },
    ],
  },
  {
    id: 'ato1-primeira-parcela',
    act: 1,
    title: 'A primeira parcela',
    prerequisites: ['tutorial-primeiro-dia'],
    startDialogue: 'banco-liga',
    endDialogue: 'parcela-paga',
    reward: { cash: 0, text: 'A oficina segue aberta mais uma semana' },
    failure: 'Pagar depois do vencimento custa 10% de multa; a missão continua até a parcela ser paga.',
    repeatable: false,
    steps: [
      {
        id: 'juntar',
        objective: 'Junte dinheiro para a parcela: entregue mais um carro',
        tip: 'Cada serviço entregue entra no caixa. Se já tiver o valor, pode pagar a parcela direto no computador.',
        highlight: null,
        done: { kind: 'any', of: [{ kind: 'orders-reached', stage: 'entregue', count: 2 }, { kind: 'installments-paid', count: 1 }] },
        recovery: [
          {
            when: { kind: 'installment-overdue' },
            objective: 'Parcela atrasada: pague {parcela} no computador (aba Caixa)',
            tip: 'Atrasada, a parcela sai com multa. Pague assim que tiver o dinheiro.',
          },
          {
            when: { kind: 'active-order', status: 'recusada' },
            objective: 'Chame a próxima OS na ficha do carro e feche um serviço',
            tip: 'Cliente perdido não é o fim: o próximo pode fechar.',
          },
        ],
      },
      {
        id: 'pagar',
        objective: 'Pague a parcela de {parcela} no computador (aba Caixa) até o dia {vencimento}',
        tip: 'No computador, aba Caixa, botão "Pagar parcela".',
        highlight: 'computador',
        done: { kind: 'installments-paid', count: 1 },
        recovery: [
          {
            when: { kind: 'installment-overdue' },
            objective: 'Parcela atrasada: pague {parcela} no computador (aba Caixa)',
            tip: 'Atrasada, a parcela sai com multa de 10%. Pague assim que tiver o dinheiro.',
          },
        ],
      },
    ],
  },
];

export const DIALOGUES: readonly DialogueDef[] = [
  {
    id: 'prologo',
    lines: [
      { speaker: 'narrador', text: 'Primeiro dia na oficina do tio Tonhão. Na parede, a placa: Oficina do Seu Zé.' },
      { speaker: 'seu-ze', text: '{abertura} O {cliente} já tá aí com o carro chiando. Quer que eu vá te soprando o que fazer?' },
    ],
    choice: {
      options: [
        {
          id: 'ensina',
          label: 'Me ensina o caminho, Seu Zé.',
          reply: { speaker: 'seu-ze', text: 'Fechou. Vou te soprando o que fazer, passo a passo.' },
          effects: [{ kind: 'tips', on: true }],
        },
        {
          id: 'sozinho',
          label: 'Pode deixar, eu me viro.',
          reply: { speaker: 'seu-ze', text: 'Gostei! Se apertar, aperta {dicas} que eu volto a dar dica.' },
          effects: [{ kind: 'tips', on: false }],
        },
      ],
    },
  },
  {
    id: 'ze-diagnostico',
    lines: [{ speaker: 'seu-ze', text: 'Sintoma não é diagnóstico. Escuta a queixa, faz o exame e só depois aponta a peça.' }],
  },
  {
    id: 'ze-loja',
    lines: [{ speaker: 'seu-ze', text: 'O que não tem na estante a gente encomenda no computador do escritório.' }],
  },
  {
    id: 'tutorial-fim',
    lines: [
      { speaker: 'seu-ze', text: 'Serviço entregue e dinheiro no caixa. É assim que oficina fica de pé.' },
      { speaker: 'seu-ze', text: 'Toma R$ 150 da caixinha que o Tonhão guardava. Daqui pra frente é com você.' },
    ],
  },
  {
    id: 'banco-liga',
    lines: [
      { speaker: 'narrador', text: 'O telefone do escritório toca.' },
      { speaker: 'gerente-banco', text: 'Boa tarde. Aqui é do banco, sobre o empréstimo da oficina.' },
      { speaker: 'gerente-banco', text: 'A primeira parcela, de {parcela}, vence no fim do dia {vencimento}.' },
    ],
    choice: {
      options: [
        {
          id: 'em-dia',
          label: 'Pode deixar, pago em dia.',
          reply: { speaker: 'gerente-banco', text: 'Ótimo. O pagamento é pelo computador, na aba Caixa.' },
          effects: [],
        },
        {
          id: 'adiar',
          label: 'Preciso de mais uns dias.',
          reply: { speaker: 'gerente-banco', text: 'Adio por 3 dias, com tarifa de R$ 40,00 somada à parcela.' },
          effects: [{ kind: 'postpone-installment', days: 3, fee: 40_00 }],
        },
      ],
    },
  },
  {
    id: 'parcela-paga',
    lines: [
      { speaker: 'seu-ze', text: 'Parcela paga. O Tonhão ia ficar orgulhoso.' },
      { speaker: 'seu-ze', text: 'Daqui pra frente é isso: serviço bem feito, caixa no azul e parcela em dia.' },
      { speaker: 'narrador', text: 'Fim do conteúdo do Ato 1 nesta versão. A oficina continua aberta.' },
    ],
  },
];
