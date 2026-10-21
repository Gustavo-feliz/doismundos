# Formato dos dados: veículos e peças

Este guia é para quem vai adicionar ou alterar carros e peças. Todo o conteúdo fica em `src/data/` como TypeScript tipado. Ele é **validado quando o jogo abre**. Se algo estiver errado, o jogo não inicia e mostra na tela a lista de problemas, com o arquivo e o motivo.

## Visão geral

```
partSlots.ts     → posições de peça ("onde encaixa")
vehicles.ts      → modelos de carro (quais posições cada modelo tem)
parts.ts         → catálogo de peças (em qual posição encaixam e em quais modelos/anos servem)
demoVehicles.ts  → carros concretos: placa, km, peças instaladas, histórico, o que o jogador já sabe
```

A validação segue a ordem de dependência: posições → modelos → peças → carros concretos (`src/vehicles/catalogs.ts` e `src/vehicles/factory.ts`).

## IDs estáveis

- Apenas `a-z`, `0-9`, hífen e ponto. Exemplo: `pastilha-freio-diant-ventura-brisa`.
- **Nunca renomeie um ID publicado.** Saves (Prompt 9), pedidos e missões vão guardar esses IDs. Para aposentar uma peça, crie outra com um ID novo.
- Posições usam o formato `sistema.nome`. Exemplo: `freios.pastilhas-dianteiras`. O sistema do ID precisa ser igual ao campo `system`.

## Posição de peça (`SlotDefinition`)

| Campo | Tipo | Exemplo |
| --- | --- | --- |
| `id` | string | `eletrica.bateria` |
| `name` | string | `Bateria` |
| `system` | `PartSystem` | `eletrica` |
| `access` | `capo` \| `elevador` \| `externo` | de onde se alcança a peça (diagnóstico e reparo) |

## Modelo de carro (`VehicleDefinition`)

| Campo | Observação |
| --- | --- |
| `id`, `manufacturer`, `model` | Sempre fictícios (GDD §1.6). |
| `category` | `popular`, `hatch`, `sedan`, `suv`, `picape`. |
| `years` | `[inicial, final]`: anos-modelo fabricados. |
| `slots` | IDs das posições que este modelo tem. Um elétrico, por exemplo, não teria `motor.velas`. |
| `dimensions` | Medidas em metros, usadas pelo modelo 3D temporário. |
| `paintColor` | Cor de fábrica, `#rrggbb`. |

## Peça (`PartDefinition`)

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id`, `name`, `brand` | string | Marca fictícia. |
| `slot` | ID de posição | A posição precisa existir. |
| `system` | `PartSystem` | Precisa ser o mesmo da posição. |
| `quality` | `generica` \| `original` \| `performance` | GDD §10.2 |
| `compatibility` | `[{ modelId, years: [de, até] }]` | Os anos precisam caber na fabricação do modelo, e o modelo precisa ter a posição. |
| `baseCost` | centavos (inteiro) | Maior que zero. `129_00` = R$ 129,00. |
| `scrapValue` | centavos (inteiro) | Não pode passar do custo. |
| `replaceMinutes` | inteiro | Tempo de troca em minutos de jogo. |
| `lifespanKm` | número | Vida útil: rodar `lifespanKm` km leva o desgaste de 0 a 100. |

**Compatibilidade.** Uma peça só entra numa posição se as três condições abaixo forem verdadeiras. Caso contrário, `checkCompatibility` devolve um erro com código.

| Condição | Código do erro |
| --- | --- |
| A peça é daquela posição | `posicao-errada` |
| O modelo do carro está na lista de compatibilidade | `modelo-incompativel` |
| O ano do carro está na faixa da regra | `ano-incompativel` |

## Carro concreto (`VehicleState`)

Fica em `src/vehicles/state.ts`. É criado a partir de um `VehicleSpec` (`src/vehicles/factory.ts`).

| Campo | Observação |
| --- | --- |
| `id`, `modelId`, `year` | `year` dentro de `years` do modelo. |
| `plate` | Padrão Mercosul fictício (`ABC1D23`). |
| `color`, `colorName` | `#rrggbb` e o nome para o jogador. |
| `mileageKm` | km atuais. |
| `parts` | **Condição real.** Uma entrada por posição do modelo: `{ partId, condition, wear, installedAtKm }` ou `null` (sem peça). `condition` = procedência: `nova`, `usada` ou `recondicionada`. `wear` vai de 0 a 100. |
| `knowledge` | **O que o jogador sabe.** Por posição: `desconhecido`, `avaliado` (faixa, origem, km da avaliação, peça) ou `removida`. |
| `history` | Eventos `{ kind, atKm, day, text, disclosed }`. Com `disclosed: false`, o jogador não sabe do evento (ex.: leilão). |

### Real × conhecido

A interface **nunca** lê `parts` nem o histórico oculto. Ela recebe a `InspectionView` (`src/vehicles/inspectionView.ts`), montada só a partir de `knowledge` e do histórico revelado. Uma avaliação revela a **faixa** de desgaste, não o número:

| Desgaste | Faixa |
| --- | --- |
| 0–39 | Boa |
| 40–74 | Gasta |
| 75–99 | Crítica |
| 100 | Falhou |

O conhecimento pode ficar desatualizado. Os pneus do carro de demonstração foram avaliados como "Boa" há 21.020 km e hoje estão gastos, mas o jogador só descobre isso examinando de novo.

## Mudando o estado: funções de domínio

Ficam em `src/vehicles/domain.ts`. São puras: devolvem um estado novo ou `{ ok: false, error: { code, message } }` e nunca alteram o objeto recebido. Na sessão (`GameSession.apply`), uma operação que falha não grava nada.

| Função | O que faz |
| --- | --- |
| `checkCompatibility` | Confere posição, modelo e ano. |
| `installPart` | Exige a posição vazia. A peça nova entra com desgaste 0. Registra no histórico. O jogador passa a saber o estado da peça. |
| `removePart` | Exige uma peça na posição. Registra no histórico. |
| `replacePart` | Faz remover + instalar de forma atômica. |
| `setPartWear` | Ajusta o desgaste real (eventos do jogo). O registro fica oculto. |
| `driveKm` | Soma a quilometragem e desgasta as peças pela vida útil de cada uma. |
| `revealPartCondition` | Atualiza o conhecimento com a faixa atual (para o diagnóstico do Prompt 4). |

## Diagnóstico

Os dados ficam em `src/data/diagnostics.ts` (exames) e `src/data/diagnosticCases.ts` (ordens de serviço). As regras ficam em `src/diagnostics/rules.ts` e são puras e determinísticas. Tudo é validado ao abrir o jogo (`src/diagnostics/validate.ts`).

**Exames.** Os resultados são regras sobre o estado **real** das peças, sem simulação física.

- **Inspeção visual:** gerada automaticamente para cada hipótese do caso.
  - Tempo e exigência dependem de `access` da posição: externo, 10 min; capô, 8 min com o capô aberto; elevador, 12 min com o carro no alto.
  - Se a posição tiver `visual: false`, o resultado é "não conclui".
  - Se não, revela a faixa de desgaste e atualiza o conhecimento do jogador.
  - Peso na hipótese, conforme a faixa: Boa −2, Gasta +1, Crítica +3, Falhou +4.
- **Scanner:** cada `FaultCodeRule` aparece quando `when.slot` está em `when.minBand` ou pior. Sem nenhum código, aplica `noCodesEffects`.
- **Teste funcional (`FunctionalTestDef`):**
  - os `outcomes` são testados em ordem e vale o primeiro cuja condição é verdadeira;
  - o último resultado é o padrão, sem `when`;
  - `requires` lista as exigências de equipamento: `capo-aberto`, `elevador-no-alto` ou `elevador-embaixo`.

**`effects`.** É o peso que o resultado soma ou tira de cada hipótese, por posição. Efeitos sobre peças que não são hipóteses do caso são ignorados.

**Caso (`DiagnosticCaseDef`):**

| Campo | Observação |
| --- | --- |
| `orderNumber`, `customerName` | Identificam a OS. |
| `complaint` | A fala do cliente: o sintoma. |
| `summary` | Resumo curto, usado no HUD. |
| `vehicle` | Um `VehicleSpec` completo. |
| `hypotheses` | Pelo menos 2, cada uma com peso inicial. |
| `trueCause` | Precisa estar entre as hipóteses e **nunca vai para a UI**. |
| `functionalTests` | Testes funcionais disponíveis no caso. |
| `hints` | Cada dica aponta para um exame e só aparece enquanto ele não foi feito. |

**Confiança.** A pontuação de cada hipótese é o peso inicial mais a soma dos efeitos. A confiança é a pontuação dividida pela soma das pontuações (com piso de 0,25):

| Confiança | Faixa |
| --- | --- |
| 60% ou mais | Alta |
| 35% a 59% | Média |
| Abaixo de 35% | Baixa |

Os testes garantem que, em cada caso, nada começa com confiança alta e que todos os exames juntos levam a causa real ao topo com confiança alta.

**Registro.** O `DiagnosisRecord` guarda a escolha e se ela acertou (`correct`). A UI recebe só a `DiagnosisView` (`src/diagnostics/view.ts`), que não tem `trueCause` nem `correct`.

## Clientes, preços e estoque

**Clientes (`src/data/customers.ts` → `CustomerProfile`):**

| Campo | Observação |
| --- | --- |
| `typeLabel`, `persona` | Públicos: o que o jogador vê. |
| `maxBudget` | Centavos. Escondido. |
| `counterRatio` | Até quanto acima do máximo ainda vale contraproposta (≥ 1). |
| `patience` | Quantas contrapropostas o cliente aguenta. |
| `requiresOriginal`, `minWarrantyDays`, `maxDeadlineHours`, `acceptsExtras` | As outras exigências. |

A decisão fica em `src/customers/decision.ts` e é previsível. Ela confere, nesta ordem: extras, qualidade, garantia, prazo, preço. Todas atendidas → aceita. Preço acima de `maxBudget × counterRatio`, ou paciência esgotada → recusa. Nos outros casos → contraproposta.

**Preços (`src/data/pricing.ts` → `PricingRules`):** valor/hora, bloco de mão de obra, ajuste por categoria, taxa de urgência, descarte, filas, opções de margem, desconto e garantia, e o limite e a taxa do sinal. A fórmula fica em `src/economy/quote.ts` e cada multiplicador é aplicado uma única vez. Os testes conferem que a soma das linhas é sempre o total.

**OS (`DiagnosticCaseDef`):** além dos campos do diagnóstico, cada OS tem `customerId` e `finalTest` (`resolved` e `persists`), os textos do teste final com e sem o defeito resolvido.

**Estoque inicial (`src/data/stock.ts`):** lista de `{ partId, qty }`. As peças de cada OS aprovada entram no estoque marcadas com o número da OS.

**Reparo (`src/repairs/rules.ts`):**
- **Acesso por `access` da posição:** `capo` exige o capô aberto; `elevador` e `externo` exigem o carro no alto.
- **Tempo:** remover leva `ceil(replaceMinutes / 2)` e instalar leva o restante.
- **Teste final:** exige o carro no chão e o capô fechado, e leva 10 min.

**Qualidade:**

```
pontos = 100 − 10 × erros (no máximo 3) − 15 × peças diferentes da orçada
defeito não resolvido → retrabalho
senão: 90 ou mais = excelente; 70 ou mais = boa; abaixo disso = regular
```

## Economia, reputação e garantia

**Fornecedores (`src/data/suppliers.ts`):** `{ id, name, priceFactor, deliveryMinutes }`. O preço é `custo-base × priceFactor`.

**Economia (`src/data/economy.ts`):** `startingCash` e `creditLimit`, em centavos. O crédito vem desligado (0).

**Livro-caixa (`src/economy/ledger.ts`):** cada `Transaction` tem `id`, `kind` (receita ou despesa), `category`, `amount` (positivo), `description`, `ref` (OS ou pedido) e o momento.

| Categoria | Quando entra |
| --- | --- |
| `sinal` | Na aprovação de orçamento acima de R$ 1.000. |
| `servico` | Na entrega do carro. |
| `compra-pecas` | Na compra. |
| `estorno-compra` | No cancelamento de um pedido. |

**Estoque:** lotes `{ lotId, partId, qty, unitCost, source }`. O custo da peça instalada vira o custo do serviço, e lucro bruto = receita − custo das peças.

**Avaliação (`src/customers/evaluation.ts`):** cada critério vale pontos. Para chegar às estrelas, some os pontos dos quatro critérios: `estrelas = 3 + piso(soma / 2)`, limitado entre 1 e 5. Com 4★ ou mais o cliente volta; com 2★ ou menos ele reclama.

| Critério | Pontos |
| --- | --- |
| Prazo | +1 no prazo; 0 com até 2 h de atraso; −1 acima disso. |
| Orçamento | +1 se o preço for até 85% do limite do cliente, ou se o serviço estiver na garantia. |
| Qualidade | excelente +2, boa +1, regular 0, retrabalho −2. |
| Comunicação | +1 sem contraproposta, 0 com uma, −1 com duas ou mais. |

**Reputação (`src/customers/reputation.ts`):** a geral e cada especialidade começam em 50, numa escala de 0 a 100. Cada avaliação soma (estrelas − 3) × 4. Um retorno em garantia por falha do reparo tira 10.

**Garantia (`src/orders/warranty.ts`):** registro com validade em dias, posições cobertas e a queixa resolvida. Uma reclamação é coberta se for a **mesma queixa** da OS original ou se a peça diagnosticada for **uma das trocadas**. Garantia vencida ou defeito sem relação não é coberto. Só a reclamação coberta penaliza a oficina.

**Retorno de cliente satisfeito:** o campo opcional `followUp` de uma OS em `src/data/diagnosticCases.ts` é a próxima visita do cliente. Ela só acontece se ele sair satisfeito.

## Save do jogo

O envelope é definido em `src/save/saveFile.ts` e gravado no IndexedDB `simulador-mecanico`, store `saves`. A chave é o slot: `auto`, `slot1`, `slot2`, `slot3`, mais `<slot>.bak` para a cópia de segurança.

```
{ schemaVersion, savedAt (ISO), slot, summary { dia, hora, caixa, OS, reputação },
  checksum (FNV-1a do JSON de "game"),
  game { clockMinutes, player { x, z, yaw, pitch }, equipment { liftUp, hoodOpen, drawerOpen, hallLightsOn, benchLampOn },
         session { caseIds, caseIndex, vehicles, progress, orders, records, lots, purchases, ledger, held, scrap, reputation, warranties, seq, debt, upgrades { <id>: nível }, seed },
         missions { completed, active { id, step } | null, flags, choices, dialogueQueue, tipsEnabled } } }
```

- **OS no save.** As OS são guardadas **pelo ID**. A definição sempre vem do conteúdo do jogo; um retorno em garantia (`<id>-garantia`) é recriado a partir da OS original.
- **Leitura, nesta ordem:** JSON → versão (uma mais nova que o jogo é recusada) → soma de verificação → migrações → validação completa (`src/save/sessionSnapshot.ts`), que confere peças, OS, carros, status, valores e referências.
- **Migrações.** Ao mudar o formato:
  1. aumente `SAVE_SCHEMA_VERSION`;
  2. registre em `MIGRATIONS` a função `versãoAntiga: (envelope) => envelope da versão seguinte`.

  Os saves antigos são migrados passo a passo ao carregar. O arquivo original só muda no próximo save.
- **Versão 2 (Prompt 10):** entraram `session.debt` e `missions`. A migração 1 → 2 cria a dívida com a primeira parcela pelo menos 2 dias depois do dia do save. Ela também cria as missões do zero, com os passos "andar" e "abrir a ficha" já cumpridos.
- **Versão 3 (Prompt 11):** entrou `session.upgrades`. A migração 2 → 3 começa com todos os itens no nível 0.
- **Versão 4 (Prompt 12):** entrou `session.seed`. A migração 3 → 4 usa a semente 1. As OS geradas são salvas pelo ID `gen-<semente>-<n>-t<níveis das ferramentas>`. Ao carregar, o gerador recria a OS a partir do ID; uma OS gerada nunca vem do arquivo.

## Carros e peças (Prompt 12)

- **Modelo (`VehicleDefinition`).** Ganhou os campos `baseValue` (valor de mercado, em centavos) e `blurb` (texto da enciclopédia). A categoria `van` também é nova.
- **Linhas de peças.** Em `src/data/parts.ts`, a tabela `SLOT_BASES` (uma linha por posição) é combinada com `LINE` (leve, média e pesada: fatores de custo, tempo e vida útil) e com `LINE_MODELS` (quais modelos e anos usam cada linha).
  - Para cada posição e linha, saem duas peças: genérica (Brasaço) e original (+35%).
  - Exceções entram à parte: as peças do Brisa e o amortecedor do Jaguara 2019+.
- **Ordem importa.** O orçamento usa a primeira peça compatível do catálogo.
- **Cobertura.** `findCoverageGaps` (em `src/parts/validate.ts`) roda ao abrir o jogo. Se faltar peça para algum modelo e ano, o jogo para com a lista do que falta.

## Serviços e gerador de OS (`src/data/services.ts`, `src/procedural/`)

- **Molde de serviço (`ServiceTemplate`):**
  - `id`, `title`, `complaints[]`;
  - `cause` (a posição que falhou) e `hypotheses[]` (as pistas falsas);
  - `functionalTests[]`;
  - `causeWear` (de 75 a 100);
  - `requiredTools[]`, cada uma com `{ upgradeId, level }`;
  - `categories` (`null` = todas as categorias);
  - `finalTest` e `hints`.
- **Gerador:** `generateCase(semente, n, ferramentas, conteúdo)` é determinístico. Para cada candidata, `caseProblems` lista o que a tornaria impossível; se algo falhar, o gerador tenta outra sub-semente (até 40 vezes).
- **Pistas falsas** ficam com desgaste no máximo 70, para não imitarem o defeito. As outras peças podem estar gastas de verdade e viram oportunidades de serviço extra.
- **Para adicionar um serviço:** acrescente um molde em `SERVICE_TEMPLATES` e rode `npm test`. O teste de geração com 150 sementes acusa um molde que produza OS impossível.

## Ferramentas e upgrades (`src/data/upgrades.ts`)

- **Item (`UpgradeDef`):**
  - `id`, `kind` (`ferramenta` ou `oficina`), `name`, `description`;
  - `effect`: `exame-visual`, `exame-scanner`, `remocao`, `instalacao` ou `pegar-peca`;
  - `exampleMinutes`: só para o antes/depois na tela;
  - `levels`: exatamente 3 níveis, cada um com `{ cost, reductionPct, minReputation }`.
- **Validação** (ao abrir o jogo): cada nível precisa custar e render mais que o anterior.
- **Regras puras:** `src/upgrades/rules.ts`.
- **Onde os efeitos entram:** `testsForCase` (exames), `stepMinutes`/`removeOldPart`/`installHeldPart` (reparo) e `GameSession.takePart` (estoque).
- **Valores:** [balanceamento.md](balanceamento.md).

## Missões e diálogos (`src/data/missions.ts`)

Tipos em `src/missions/types.ts`; validação em `src/missions/validate.ts` (erro `DataValidationError` ao abrir o jogo).

- **Missão (`MissionDef`)** tem os campos `id`, `act`, `title`, `prerequisites`, `steps`, `reward { cash, text }`, `failure` (`null` quando a missão não falha) e `repeatable`. Os campos opcionais são `startDialogue` e `endDialogue`. Um pré-requisito precisa vir **antes** na lista; isso impede ciclos.
- **Passo** tem os campos `id`, `objective`, `tip`, `highlight` (id de `EQUIPMENT_IDS` ou `null`) e `done` (a condição de conclusão). Os opcionais são `dialogue` e `recovery[]`, uma lista de `{ when, objective, tip }` para quando algo sai do roteiro.
- **Condições** olham o **estado** do jogo, não eventos soltos. Por isso salvar e carregar não perde progresso, e uma ação feita antes da hora conta. Tipos de condição:
  - `flag`: algo que o jogador fez, como `andou`, `abriu-painel-carro`, `abriu-computador` ou `viu-caixa`;
  - `orders-reached { stage, count }`;
  - `active-order { status }`;
  - `purchases { count }`;
  - `installments-paid { count }`;
  - `installment-overdue`;
  - `any { of }`.
- **Diálogo** tem `id`, `lines[] { speaker, text }` e, opcionalmente, `choice.options[]` com `{ id, label, reply, effects }`. A escolha tem 2 ou 3 opções. Efeitos:
  - `tips { on }` liga ou desliga as dicas;
  - `postpone-installment { days, fee }` adia a parcela, com tarifa.
- **Marcadores nos textos:** `{cliente}`, `{vencimento}` e `{parcela}`.

## Dívida do banco (`BANK_DEBT` em `src/data/economy.ts`)

- **Campos:** `total`, `installment`, `firstDueDay`, `intervalDays` e `lateFeePct`. As regras puras ficam em `src/economy/debt.ts`.
- **Atraso:** a parcela atrasa a partir do dia seguinte ao vencimento e sai com multa.
- **Caixa:** o pagamento entra no livro-caixa na categoria `banco`; a recompensa de missão, na categoria `missao`.

## Como adicionar

- **Uma peça:** acrescente um item em `parts.ts`. Se a posição for nova, crie-a em `partSlots.ts` e adicione-a aos `slots` dos modelos que a têm.
- **Um modelo:** acrescente um item em `vehicles.ts` e inclua o novo `modelId` na `compatibility` das peças que servem nele. A lógica de domínio não muda.

Rode `npm test`: os testes validam o catálogo inteiro.
