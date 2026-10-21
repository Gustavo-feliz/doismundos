# Tabela de balanceamento (para revisão)

Todos os valores são **provisórios** e configurados em dados. Mude-os ali, não no código.

## Ferramentas e upgrades (Prompt 11), em `src/data/upgrades.ts`

Cada nível diz **quanto o tempo cai em relação a não ter o item**. O nível 2, por exemplo, substitui o nível 1; os dois não se somam.

| Item | Tipo | Efeito | Nível 1 | Nível 2 | Nível 3 |
| --- | --- | --- | --- | --- | --- |
| Chave de impacto | ferramenta | Remover peça | R$ 280 · −20% | R$ 750 · −35% | R$ 1.800 · −50% (rep. 60) |
| Scanner automotivo | ferramenta | Exame com scanner (15 min) | R$ 350 · −20% | R$ 900 · −40% | R$ 2.000 · −60% (rep. 60) |
| Iluminação | oficina | Inspeção visual (8–12 min) | R$ 220 · −20% | R$ 600 · −35% | R$ 1.400 · −50% (rep. 55) |
| Armário de ferramentas | oficina | Instalar peça | R$ 300 · −15% | R$ 800 · −30% | R$ 1.700 · −45% (rep. 60) |
| Organização do estoque | oficina | Pegar peça na estante (6 min) | R$ 150 · −35% | R$ 450 · −65% | R$ 1.000 · −85% (rep. 55) |

**Regras:**
- Os níveis são comprados em ordem.
- O nível 3 exige reputação geral mínima.
- A compra usa a mesma regra de gasto das peças: caixa mais crédito com fornecedor, que hoje é 0.
- O tempo reduzido é arredondado e nunca fica abaixo de 1 min.
- Se dois itens acelerarem a mesma coisa, vale o maior.
- No livro-caixa, a compra entra como "Ferramentas e melhorias da oficina".

**Para referência:**
- Caixa inicial: R$ 1.500.
- Parcela do banco: R$ 400 por semana.
- Um serviço de freio rende cerca de R$ 165 de lucro bruto.

Ainda falta medir quanto tempo cada nível economiza num dia de jogo real. Isso depende de telemetria (GDD §5.2).

## Linhas de peças e carros (Prompt 12), em `src/data/parts.ts` e `src/data/vehicles.ts`

| Linha | Modelos | Custo | Tempo de troca | Vida útil |
| --- | --- | --- | --- | --- |
| Leve | Faísca, Pingo, Ripa, Cometa | ×0,8 | ×0,9 | ×1 |
| Média | Vento, Tropa | ×1 | ×1 | ×1 |
| Pesada | Jaguara, Sertão, Carioca Van | ×1,6 | ×1,35 | ×1,15 |

- **Peça original:** custa 35% a mais que a genérica da mesma linha.
- **Mão de obra por categoria** (`src/data/pricing.ts`): popular ×0,9, hatch ×0,95, sedã ×1, SUV ×1,15, picape ×1,2, van ×1,2.
- **Quilometragem das OS geradas:** de 8 a 19 mil km por ano de idade; a van roda ×1,6.
- **Desgaste da peça com defeito:** de 80 a 100, conforme o serviço. As pistas falsas ficam em no máximo 70.

## Economia e campanha (Prompts 7 e 10)

| Valor | Onde | Atual |
| --- | --- | --- |
| Caixa inicial | `src/data/economy.ts` (`ECONOMY`) | R$ 1.500 |
| Dívida do banco | `BANK_DEBT` | R$ 4.800, parcelas de R$ 400 a cada 7 dias; 1ª no fim do dia 3; multa de 10% |
| Adiar parcela (diálogo) | `src/data/missions.ts` | +3 dias, tarifa de R$ 40 |
| Recompensa do tutorial | `src/data/missions.ts` | R$ 150 |
