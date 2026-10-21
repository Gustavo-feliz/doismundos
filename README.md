# Simulador de Mecânico

Simulador de oficina mecânica para navegador, em primeira pessoa, ambientado num bairro fictício inspirado no Rio de Janeiro.
O design completo está em [GDD_Simulador_de_Mecanico_Claude_Code.md](GDD_Simulador_de_Mecanico_Claude_Code.md).

**Etapas concluídas** (roadmap do GDD §24):
1. Fundação executável.
2. Interação em primeira pessoa e vertical slice da oficina.
3. Veículo, peças e condição: 15 peças, estado do carro e painel de inspeção.
4. Diagnóstico: 3 ordens de serviço, exames, evidências e hipóteses.
5. Orçamento, cliente e negociação.
6. Reparo e conclusão do serviço.
7. Loja, estoque, pagamento e economia básica.
8. Reputação, garantia e retorno de clientes.
9. Save e carregamento confiáveis.
10. Tutorial com o Seu Zé e começo do Ato 1 (missões, diálogos e dívida do banco).

Ainda **não** existem cidade, upgrades nem multiplayer.

## Pré-requisitos

- Node.js 20 ou mais novo (testado com 24 LTS) e npm.
- Navegador desktop com WebGL 2 (Chrome, Edge ou Firefox recentes).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | Instala as dependências (uma vez). |
| `npm run dev` | Abre o jogo em modo de desenvolvimento: http://127.0.0.1:5188 |
| `npm run build` | Checa os tipos e gera o build de produção em `dist/`. |
| `npm run preview` | Serve o build de produção: http://127.0.0.1:4188 |
| `npm test` | Testes unitários (Vitest). |
| `npm run test:e2e` | Testes no navegador (Playwright). Na primeira vez, rode `npx playwright install chromium`. |
| `npm run test:all` | Tipos + unitários + navegador. |

Para ajustar valores ao vivo (velocidade, exposição etc.), abra com `?debug` na URL.

## Controles

| Tecla | Ação |
| --- | --- |
| W A S D / setas | Andar |
| Shift | Correr |
| Mouse | Olhar ao redor |
| E ou clique esquerdo | Interagir com o que está na mira |
| Esc | Pausar e liberar o mouse |

Clique em **Iniciar jogo** para capturar o mouse. Sensibilidade, inversão do eixo Y, campo de visão, redução de movimento e qualidade gráfica ficam em **Configurações** e são salvos no navegador.

## Estrutura

```
src/
  core/       ciclo de vida: loop, renderer, entrada, eventos tipados, estados, relógio do jogo
  player/     controle em primeira pessoa (matemática pura em movement.ts)
  interaction/ mira por raycast e contrato de interativos (disponível / em uso / indisponível)
  equipment/  elevador, capô, gaveta e luzes: peças móveis (Actuator) e regras puras (bayRules.ts)
  diagnostics/ exames, evidências e hipóteses (rules.ts, puro) e a visão segura para a UI (view.ts)
  customers/  perfis, decisão (decision.ts), avaliação na entrega (evaluation.ts) e reputação (reputation.ts)
  orders/     estados da OS, garantia (warranty.ts) e visões das abas e do computador
  repairs/    regras do reparo: acesso → remover → instalar → teste final; qualidade
  inventory/  fornecedores, pedidos de compra e lotes de estoque (tipos)
  audio/      sons de retorno provisórios (Web Audio, gerados por código)
  world/      oficina temporária e colisão 2D simples
  parts/      tipos e validação do catálogo de peças
  vehicles/   modelos, estado de cada carro, regras de domínio (domain.ts), visão de inspeção; modelo 3D temporário
  economy/    dinheiro em centavos; fórmula ÚNICA do orçamento (quote.ts); livro-caixa (ledger.ts)
  save/       preferências (localStorage) e saves do jogo (IndexedDB): formato, validação, slots e migrações
  ui/         HUD, menu inicial/pausa, configurações, tela de erro
  data/       conteúdo em dados: veículos, peças, carro de demonstração, teclas, equipamentos, valores de início
  game/       Game.ts liga os módulos e define a ordem de atualização; GameSession.ts guarda o estado da sessão
docs/
  formato-de-dados.md   formato de veículos, peças e estado (como adicionar conteúdo)
tests/
  unit/       regras puras (relógio, estados, colisão, movimento, dinheiro, configurações, dados, interação)
  e2e/        navegador: fundação e interações
```

Regras de arquitetura: módulos conversam por eventos e interfaces tipadas, sem dependências circulares. O conteúdo fica em `src/data/` e é validado ao iniciar. O dinheiro é sempre um número inteiro de centavos.

## Assets temporários

Não há arquivos de arte no projeto. Tudo é gerado por código e marcado com o prefixo `PLACEHOLDER_` e `userData.placeholder = true`. O próprio jogo mostra o aviso "Protótipo · modelos e texturas temporários".

- Carro "Ventura Brisa 1.6" (fabricante fictício) montado com formas simples, com placa fictícia `TMP0A01`.
- Oficina, elevador, bancada, armário, estantes, pneus, tambores e escritório feitos com caixas e cilindros.
- Texturas de piso, parede, portão, painel de ferramentas e letreiro desenhadas em canvas.
- A rua vista pelo portão é só cenário. A corrente no portão impede sair, porque a cidade é P2 no GDD.
- Valores de início em `src/data/newGame.ts` (caixa de R$ 1.500,00, 1 s real = 1 min de jogo) são **provisórios**. Revisar no Prompt 7.

## Interações da oficina (Prompt 2)

Mire com a bolinha central. O aviso abaixo dela mostra o nome do objeto, o estado atual e uma destas três situações:
- **disponível**: tecla `E` e a ação;
- **em uso**: algo está se movendo;
- **indisponível**: aparece o motivo.

Só o primeiro objeto na linha da mira é selecionado, então não dá para interagir através de outro objeto. O alcance é de 2,4 m.

| Objeto | Ação | Regras |
| --- | --- | --- |
| Elevador (colunas ou botoeira) | Subir / descer | Não sobe com o capô aberto. Não desce com o jogador embaixo do carro. Fica "em uso" enquanto se move. |
| Capô do carro | Abrir / fechar | Só com o elevador parado embaixo. |
| Carro | Ver / fechar ficha | A ficha fecha sozinha se você se afastar. |
| Armário de ferramentas | Abrir / fechar gaveta | |
| Bancada | Acender / apagar luminária | |
| Interruptor (ao lado do portão) | Acender / apagar luzes do galpão | |
| Portão, computador | Indisponível | Etapas futuras do GDD. |

Com o carro no alto dá para passar por baixo dele. Pausar congela as animações. "Iniciar jogo" no menu inicial volta tudo ao estado de fábrica.

## Veículo e peças (Prompt 3)

O carro do box 1 é um **Ventura Brisa 1.6 2009** de demonstração: placa TMP0A01, 148.320 km, 15 peças. Os dados são sempre iguais.

Mire no carro e aperte **E** para abrir o painel de inspeção. O painel lista as peças por sistema e mostra só o que o jogador já sabe. No começo, isso é a troca de óleo e filtro e os pneus, conhecidos pelas notas de serviço. O resto aparece como "Não avaliada". O estado real existe, mas a interface não tem acesso a ele.

No painel, use as setas para navegar e clique para ver o detalhe de uma peça: peças compatíveis do catálogo, preço e tempo de troca. **E** ou o botão "Voltar ao trabalho" voltam ao jogo, e **Esc** pausa. O relógio do jogo fica parado com o painel aberto.

O formato dos dados e as regras estão em [docs/formato-de-dados.md](docs/formato-de-dados.md).

## Diagnóstico (Prompt 4)

O jogo traz 3 ordens de serviço (OS), sempre as mesmas e na mesma ordem. Cada uma tem um carro, um cliente e uma queixa:

| OS | Cliente | Queixa |
| --- | --- | --- |
| #001 | Marcão | barulho ao frear |
| #002 | Seu Jorge | esquentando no trânsito |
| #003 | Dona Cida | não pega de manhã |

A causa real nunca aparece na tela. Para descobri-la, use a aba **Diagnóstico** do painel do carro.

**Exames.** Cada exame gasta tempo de jogo, entre 8 e 20 minutos, e não pode ser repetido.

| Exame | O que faz | Exige |
| --- | --- | --- |
| Inspeção visual | Avalia uma peça. Peças internas (termostática, alternador...) não revelam nada só de olhar. | Peças do cofre: capô aberto. Peças de baixo: carro no alto do elevador. |
| Scanner | Lê os códigos de falha da central. Pode acusar defeitos fora da queixa. | — |
| Teste funcional | Frenagem, temperatura ou carga elétrica, conforme o caso. | Varia: carro no chão ou capô aberto. |

**Hipóteses.** Cada evidência soma ou tira peso das hipóteses, e a barra de confiança se atualiza (baixa, média ou alta).

**Dicas.** Com a opção ligada nas configurações, o **Seu Zé** sugere um exame, nunca a resposta.

**Registrar o diagnóstico.** Escolha a causa e registre (é preciso pelo menos 1 exame). A interface **não diz se você acertou**: o diagnóstico errado fica registrado e vai gerar retrabalho no reparo (Prompt 6). Depois, "Próxima ordem de serviço" traz outro carro para o box.

## Orçamento e negociação (Prompt 5)

Depois de registrar o diagnóstico, a aba **Orçamento** (tecla 2) monta a proposta.

**Fórmula.** Uma só (`src/economy/quote.ts`), e o detalhamento na tela é exatamente o que ela calcula:

```
peças        = custo × (1 + margem)
mão de obra  = horas (em blocos de 30 min) × R$ 90/h × ajuste da categoria
urgência     = +30% sobre a mão de obra, cobrada uma vez só
descarte     = R$ 10 por item
desconto     = % sobre peças e serviço (não sobre taxas)
total, prazo (horas de serviço + fila de 4 h, ou 1 h se urgente), garantia (90 ou 180 dias),
sinal (30% acima de R$ 1.000) e validade
```

**Extras.** Você pode sugerir peças extras, mas só as que já avaliou como gastas ou piores.

**Clientes.** Cada um tem limites escondidos de preço, prazo, garantia, qualidade e paciência. O jogador vê só o tipo e o jeito do cliente.

| Cliente | Perfil |
| --- | --- |
| Marcão | Motorista de aplicativo: tem pressa e não aceita extras. |
| Seu Jorge | Econômico: pechincha. |
| Dona Cida | Exigente: quer peça original e garantia longa. |

**Resposta do cliente.** Segue regras fixas e explica o motivo:

| Resposta | Quando |
| --- | --- |
| Aceita | Todas as condições atendidas. |
| Contraproposta | Diz o que quer. Se for só preço, dá para aceitar direto e vira um "desconto negociado". |
| Recusa | Muito acima do que pode pagar, ou a paciência acabou. |

"Dispensar cliente" encerra a OS sem serviço. Tudo fica registrado na negociação e no histórico do carro.

## Reparo (Prompt 6)

Aprovado o orçamento, as peças chegam às **estantes** (estoque). Mire numa estante e aperte E para ver o estoque. Pegue uma peça por vez: o HUD mostra **"Em mãos"**.

Na aba **Serviço** (tecla 3), cada item segue esta ordem:

1. **Acesso.** Peças do cofre pedem o capô aberto. Rodas, freios e peças de baixo pedem o carro no alto do elevador.
2. **Remover a peça antiga.**
3. **Instalar a peça em mãos.**

Depois de todos os itens, faça o **teste final**, com o carro no chão e o capô fechado. Por fim, **conclua**: não dá para concluir com tarefas pendentes.

**Erros tratados:** peça errada, instalar antes de remover e repetir uma ação. Cada um tira 10 pontos de qualidade, no máximo 3 vezes. Faltar equipamento só avisa, sem penalidade.

**Qualidade final.** Depende de duas coisas, sem sorteio:
- **o diagnóstico:** se a peça trocada não era a causa, o teste final mostra que o defeito continua e o serviço sai como **retrabalho**;
- **a execução:** os erros acima e a troca da peça orçada por outra.

Concluído o serviço, entregue o carro na aba Serviço (veja abaixo).

## Loja, estoque e caixa (Prompt 7)

O **computador do escritório** é a gestão da oficina. Ele tem quatro abas:

| Aba | O que faz |
| --- | --- |
| **Loja** | Lista as peças, com dois fornecedores fictícios. A Autopeças do Bairro tem preço cheio e entrega em 30 min. A Distribuidora Rio Peças é 18% mais barata e entrega em 180 min. As peças que a OS atual precisa aparecem no topo. |
| **Pedidos** | A compra sai do caixa **na hora**, mas a peça só entra no estoque **quando chega**. Pedidos a caminho podem ser cancelados com estorno integral. "Esperar a entrega" avança o relógio até a próxima chegada. |
| **Caixa** | Caixa atual, receita de serviços, compras líquidas e lucro bruto das OS entregues (receita − custo das peças usadas). Também o livro-caixa: cada transação com id, data, categoria, descrição, referência (OS ou pedido) e valor. |
| **Reputação** | Veja a seção seguinte. |

**Limites de gasto.** Não dá para gastar mais do que o caixa. A exceção é uma regra de crédito, que vem desligada (`creditLimit` em `src/data/economy.ts`). Só existe o caixa da oficina: nada de dinheiro pessoal.

**Pagamento.** Um orçamento acima de R$ 1.000 cobra 30% de sinal na aprovação. O restante é pago na **entrega**, sempre conforme o orçamento aprovado. As peças herdadas do tio custam zero.

## Reputação, garantia e retorno (Prompt 8)

**Avaliação.** Na entrega, o cliente dá de 1 a 5 estrelas, com um motivo legível para cada um destes critérios:

| Critério | Como conta |
| --- | --- |
| Prazo | Compara com o prometido. Até 2 h de atraso é tolerado; acima disso, conta contra. |
| Orçamento | Preço justo conta a favor. Serviço na garantia também. |
| Qualidade | Vem do reparo. |
| Comunicação | Quantas contrapropostas foram precisas. |

Cada critério ruim custa estrela.

**Reputação.** Guardada em duas formas, separadas: **geral** e **por especialidade** (mecânica e elétrica). Cada avaliação soma (estrelas − 3) × 4 pontos.

**Garantia.** Cada entrega registra uma garantia de 90 ou 180 dias, conforme o orçamento, que cobre as peças trocadas e a queixa resolvida.

**Retorno do cliente:**
- **Reparo com retrabalho:** o cliente **volta em garantia**. Abre uma OS vinculada à original, sem custo para ele. A oficina paga a peça e perde 10 pontos de reputação.
- **Cliente satisfeito (4★ ou mais):** pode voltar com outro problema. A Dona Cida volta com o freio trepidando. O mecânico confere a garantia: se o defeito **não tem relação** com o serviço anterior, a OS é cobrada normalmente e **não há penalidade**.

## Save e carregamento (Prompt 9)

Use **Salvar jogo** (no menu de pausa) e **Carregar jogo** (no menu inicial e na pausa). Na tela inicial, **Continuar jogo salvo** abre o save mais recente.

**Slots.** São três manuais e um **autosave**. O autosave grava ao pausar, ao sair da aba e a cada minuto de jogo, só se algo mudou. Um jogo novo ainda intocado não grava por cima do autosave anterior.

**Confirmação.** Carregar, sobrescrever e excluir pedem confirmação na própria linha do slot.

**O que é salvo:**
- carros, todas as OS (inclusive retornos em garantia) e diagnósticos;
- estoque, pedidos, peça em mãos e livro-caixa (o caixa é recalculado a partir dele);
- reputação e garantias;
- relógio, posição do jogador e estado do elevador, capô, gaveta e luzes.

- missões: passo atual, missões concluídas, escolhas de diálogo, diálogos pendentes e a preferência de dicas;
- dívida do banco (saldo, vencimento, parcelas pagas).

Saves da versão 1 (antes do Prompt 10) são migrados ao carregar: a primeira parcela vence pelo menos 2 dias depois do dia do save.

**Segurança contra corrupção:**
- Cada save tem `schemaVersion`, data e hora, e uma **soma de verificação**: um arquivo cortado ou editado é detectado.
- Antes de gravar, o próprio save é relido e validado. Um estado inválido **nunca** substitui um save bom.
- Ao sobrescrever, o save anterior vira **cópia de segurança**. Se o principal corromper, o jogo carrega a cópia e avisa.

Os saves ficam no navegador (IndexedDB). Se o navegador bloquear o armazenamento, o jogo avisa que os saves só valem até fechar a página.

## Tutorial e Ato 1 (Prompt 10)

**História.** O tio Tonhão morreu e deixou a oficina com uma dívida no banco. O Seu Zé, mecânico antigo da casa, ensina o caminho.

**Missões.** Ficam em `src/data/missions.ts` e são validadas ao abrir o jogo.
- **Primeiro dia na oficina** (8 passos): andar, abrir a ficha, diagnosticar, orçar, comprar a peça, reparar, entregar e conferir o caixa. Recompensa: R$ 150 da caixinha do Tonhão.
- **A primeira parcela:** o gerente do banco liga; entregue mais um carro e pague a parcela de R$ 400 no computador (aba Caixa) até o fim do dia 3.

**Objetivo sempre visível.** O HUD mostra a missão, o passo ("passo 3 de 8"), o objetivo e a OS do box.

**Fora do roteiro.** Os passos olham o estado do jogo, então algo feito antes da hora já conta. A campanha nunca trava:
- se o cliente recusar o orçamento, o objetivo passa a orientar a próxima OS;
- se a parcela atrasar, ela sai com multa de 10% e a missão continua.

**Dicas e diálogos.**
- A dica do Seu Zé aparece sob o objetivo; **H** oculta ou mostra.
- O objeto do passo é destacado na cena pelo evento `tutorial:highlight`. O efeito visual é feito pelo passe de arte.
- Os diálogos aparecem como legenda, sem pausar o jogo. **Enter** pula a fala; **1, 2, 3** escolhem a resposta.
- As escolhas ficam registradas no save. No prólogo, a escolha liga ou desliga as dicas. Na ligação do banco, dá para adiar a parcela em 3 dias com tarifa de R$ 40.

**Eventos** (`src/core/events.ts`), para cena e áudio:
- `tutorial:highlight`
- `mission:step`
- `mission:completed`
- `dialogue:line`

PROVISÓRIO: textos, valores da dívida e recompensas serão revistos com o roteiro final do Ato 1.

## Roteiro de teste manual

Os testes automáticos não conseguem capturar o mouse (Pointer Lock) no navegador headless, então confira à mão:

1. `npm run dev` e abra http://127.0.0.1:5188. A oficina aparece atrás do menu, com a câmera girando devagar.
2. **Iniciar jogo**: o cursor some e o mouse gira a câmera. O olhar vertical para antes de virar de cabeça para baixo.
3. Ande com WASD e corra com Shift. Encoste nas paredes, no carro, nas colunas do elevador e na corrente do portão: o jogador para e desliza, sem atravessar.
4. O relógio do HUD avança 1 minuto por segundo.
5. **Esc**: o jogo pausa, o mouse é liberado e o relógio para. **Continuar**: o mouse é capturado de novo, na mesma posição.
   Se clicar em Continuar logo depois do Esc, o Chrome pode recusar por ~1 s. Aparece uma mensagem pedindo para tentar de novo.
6. Troque de janela (Alt+Tab) durante o jogo: ele pausa sozinho.
7. **Configurações**: mude a sensibilidade, o campo de visão e a qualidade (Baixa desliga as sombras). Recarregue a página: os valores continuam.
8. Redimensione a janela: a imagem acompanha, sem distorcer.
9. Mire no elevador e aperte E: o carro sobe. Enquanto sobe, o aviso diz "Em uso". Passe por baixo do carro e tente descer o elevador: aparece "Saia de baixo do carro".
10. Desça o elevador, abra o capô e tente subir o elevador: aparece "Feche o capô". Com o capô aberto, mirar no motor oferece "Fechar capô".
11. Abra a ficha do carro e se afaste: ela fecha sozinha.
12. Apague as luzes do galpão no interruptor e acenda a luminária da bancada: a diferença de iluminação é visível.
13. Mire no chão e aperte E: nada acontece e nenhum aviso aparece.
14. Mire no carro e aperte E: o painel mostra 15 peças, "3 de 15 peças com estado conhecido" e nenhuma menção a leilão.
15. No painel, navegue com as setas e feche com E: o jogo volta com o mouse capturado e o painel não reabre sozinho.
16. Na aba Diagnóstico: o botão "Registrar" fica desativado até você fazer um exame. A inspeção dos amortecedores pede o carro no alto do elevador. Faça a inspeção das pastilhas: o relógio avança 10 min e a peça aparece como "Crítica" na aba Peças.
17. Registre um diagnóstico e passe para a OS #002. O teste de temperatura pede o capô aberto: feche o painel, abra o capô e volte.
18. **OS completa (Marcão):**
    - Inspecione as pastilhas e registre "Pastilhas".
    - Na aba Orçamento, confira o total de R$ 267,70 e envie: ele pede prazo de 4 h.
    - Marque "urgente": o total passa a R$ 294,70. Envie: ele aceita.
19. Feche o painel, suba o elevador e pegue a **bateria** na estante. Na aba Serviço, remova as pastilhas e tente instalar a bateria: aparece "Peça errada".
20. Devolva a bateria, pegue as pastilhas da OS #001 e instale. Tente o teste final com o carro no alto: ele pede o carro no chão. Desça o elevador, faça o teste ("o chiado sumiu") e conclua: qualidade Excelente (90).
21. **OS #002 (Seu Jorge):** envie o orçamento padrão (R$ 197,37). Ele contrapropõe R$ 180,00. "Aceitar R$ 180,00" cria a linha "Desconto negociado".
22. **Pagamento:**
    - Na OS #001 aprovada, a aba Serviço mostra "Falta comprar".
    - No computador, compre as pastilhas na Autopeças do Bairro (o caixa cai R$ 129,00).
    - Em Pedidos, clique em "Esperar a entrega".
    - Faça o reparo e entregue: o caixa sobe R$ 294,70, o lucro bruto é R$ 165,70 e aparecem as estrelas com os motivos.
23. No computador, aba Reputação: confira a avaliação do Marcão e a garantia GAR-001.
24. **Garantia:** em um jogo novo, registre "Discos" na OS #001, troque os discos e entregue. Ele volta em garantia (OS 001-G), com orçamento zerado e −10 de reputação.
25. **Save:**
    - Avance a OS #001 até a contraproposta e pause.
    - Em "Salvar jogo", use "Salvar aqui" no slot 1.
    - **Recarregue a página (F5).** A tela inicial mostra "Continuar jogo salvo".
    - Em "Carregar jogo", carregue o slot 1 e confirme: a OS, o caixa, a hora e a posição voltam iguais.
26. Sobrescrever e excluir um slot pedem confirmação.
27. Console do navegador (F12): sem erros vermelhos.
