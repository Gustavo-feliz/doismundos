# Física de direção: avaliação e escolha (Prompt 13)

O GDD pede para avaliar o Rapier e alternativas antes de escolher.

## Opções avaliadas

| Opção | Prós | Contras |
| --- | --- | --- |
| **Modelo próprio "bicicleta" em TypeScript** (escolhido) | Determinístico (passo fixo de 1/60 s) e testável no Vitest. Não aumenta o bundle. Reaproveita a colisão 2D da oficina (`src/world/collision.ts`). Lê o estado real das peças direto das regras. | Sem rolagem, capotamento nem suspensão física. Colisão com dois círculos (frente e traseira), não com a caixa exata do carro. |
| Rapier (`@dimforge/rapier3d-compat`) | Física completa: corpo rígido, rodas e colisão 3D precisa. | Acrescenta ~1,5 MB de WASM, com carregamento assíncrono. A simulação é mais difícil de testar de forma determinística. É exagero para um pátio fechado a 60 km/h. |
| cannon-es | Puro JS e leve. | Projeto com pouca manutenção. O `RaycastVehicle` exige muito ajuste para ficar estável. |

**Decisão:** modelo próprio. Se o Prompt 14 (bairro com ruas) precisar de colisão 3D ou de muitos corpos, o Rapier volta a ser avaliado lá. Ele pode entrar sem trocar a lógica do jogo, porque a física fica isolada em `src/driving/`.

## Como funciona (`src/driving/physics.ts`)

- **Movimento para a frente:** força do motor × acelerador, menos o freio (× condição do freio), o arrasto (v²) e o rolamento.
- **Câmbio:** automático por faixa de velocidade, com 5 marchas.
- **Ré:** até ~11 km/h, segurando o freio com o carro parado.
- **Direção:** modelo bicicleta. O esterço diminui com a velocidade. Se a aceleração lateral passa da aderência (g × 0,9 × condição dos pneus), o carro **escorrega**: o giro fica limitado e o carro perde velocidade.
- **Colisão:** dois círculos (frente e traseira) contra paredes, pilares e cones. Ao bater, o carro quica de leve e perde 80% da velocidade.
- **Limite do pátio:** 60 km/h (`TEST_TRACK.speedLimitKmh`).

## Estado real das peças → comportamento (`src/driving/condition.ts`)

| Peça | Efeito |
| --- | --- |
| Pneus | Aderência cai até 50% (a partir de 40% de desgaste). |
| Pastilhas e discos | Força de freio cai até 55%; disco crítico faz o pedal vibrar. |
| Amortecedores | Balanço da carroceria (visual). |
| Velas | Falha de ignição: em alguns trechos, o torque cai a 25%. É **determinística**, sem sorteio. |
| Termostática e radiador | A temperatura sobe andando, e a luz acende. |
| Bateria (falhou), bomba de combustível (falhou), embreagem (falhou) ou peça faltando | O carro não sai do lugar, e a tela explica o motivo. |
| Luzes do painel | Bateria, óleo, temperatura, freio e injeção, conforme as peças críticas. |

O jogador **sente** o estado das peças, mas a tela nunca mostra o desgaste em número (princípio do `AGENTS.md`).

## Valores (provisórios)

Ficam em `src/data/driving.ts`:
- por categoria: massa, força do motor, força de freio, rotação, marchas, arrasto e esterço;
- o pátio de teste: tamanho, cones, pilares e ponto de partida.
