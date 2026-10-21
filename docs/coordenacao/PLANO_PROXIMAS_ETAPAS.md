# Plano das próximas etapas (Prompts 13 a 18)

Escrito pelo Claude em 2026-10-20 para o **Gemini** executar depois da tarefa das carrocerias por categoria. O Claude vai ficar um tempo sem sessão, porque o limite de uso acabou.

Antes de cada etapa:
1. Leia o trecho do GDD da etapa (§24). Leia só o trecho, nunca o GDD inteiro.
2. Reserve os arquivos no `QUADRO.md`.
3. Faça **uma etapa por vez**.

## Regras enquanto o Claude estiver fora

- **Arquivos do Claude liberados.** Você pode editar `src/game/Game.ts`, `src/game/GameSession.ts`, `src/save/**`, `src/ui/**` e os demais. Reserve no quadro antes.
- **Push.** Você mesmo faz o `git push`, sempre depois de rodar `npm run test:all` e `npm run build` sem erros.
- **Commits.** Pequenos, em pt-BR, só com os arquivos da etapa. Nada de `git add -A`.
- **Princípios do `AGENTS.md` (seção 3), que não podem ser quebrados:**
  - regras puras e testadas;
  - a interface nunca vê segredo (o desgaste real não aparece);
  - dinheiro em centavos;
  - conteúdo em `src/data/` validado;
  - nada de aleatoriedade sem semente.
- **Save.** Se o formato do save mudar, suba `SAVE_SCHEMA_VERSION` (hoje é 4) e registre a migração em `MIGRATIONS` (`src/save/saveFile.ts`), com teste.
- **Testes no navegador:** rode 1 vez, e repita só se houver falha intermitente. Novos testes usam `window.__GAME_TEST_HOOKS__`, porque o navegador headless não captura o mouse.
- **Ao terminar cada etapa:**
  - atualize o estado no `CLAUDE.md` e no `AGENTS.md`, o `README.md` e o `docs/formato-de-dados.md`;
  - marque a etapa no quadro;
  - deixe um recado no `MENSAGENS.md` dizendo o que mudou, os testes rodados e as pendências.
- **Prompt 17 (multiplayer): NÃO comece sem o Gustavo aprovar.** O GDD exige que o modo solo seja aprovado antes.

---

## Prompt 13: direção e test drive (plano detalhado)

### Decisão de física: recomendo física própria e simples, não o Rapier

| Opção | Prós | Contras |
| --- | --- | --- |
| **Modelo próprio "bicicleta" em TS puro** (recomendado) | Determinístico e testável no Vitest. Não aumenta o bundle (hoje ~805 kB). Basta para uma área pequena com paredes e cones. Já existe colisão 2D em `src/world/collision.ts`. | Sem rolagem nem capotamento realistas, o que não é necessário nesta etapa. |
| Rapier (`@dimforge/rapier3d-compat`) | Física completa, com rodas, suspensão e colisão 3D. | WASM de ~1,5 MB a mais, carregado de forma assíncrona. Mais difícil de testar de forma determinística. É exagero para um pátio de teste. |
| cannon-es | Puro JS. | Projeto pouco mantido. Veículo com `RaycastVehicle` dá trabalho para ajustar. |

Registre essa avaliação em `docs/fisica.md`; o GDD pede para avaliar antes de escolher. Se depois a cidade (Prompt 14) exigir mais, o Rapier entra lá.

### Modelo de direção (puro, `src/driving/`)

- **Estado:** posição (x, z), rumo, velocidade, RPM, marcha (automática simples, 1ª a 5ª) e freio de mão.
- **Entrada:** acelerar, frear/ré, esterçar, freio de mão.
- **Atualização com passo fixo** (por exemplo, 1/60 s), para ser determinística:
  - aceleração = torque da marcha ÷ massa;
  - arrasto e rolamento;
  - esterço limitado pela velocidade.
- **Parâmetros vindos de DADOS por modelo/categoria** (`src/data/driving.ts`): massa, potência, entre-eixos (já existe em `dimensions` de `src/data/vehicles.ts`) e velocidade máxima. Valide como os outros dados.
- **Estado REAL do carro afetando a física** (é comportamento, não aparece em número na tela; leia de `VehicleState.parts[slot].wear`):
  - pneus (`rodas.pneus`) gastos: menos aderência, o carro escorrega na curva;
  - pastilhas e discos gastos: frenagem mais longa; disco crítico faz vibrar (efeito de câmera);
  - amortecedores gastos: mais balanço visual e menos estabilidade;
  - bateria ou alternador críticos: luz da bateria; com falha total, o carro não pega;
  - óleo crítico: luz do óleo. Termostática ou radiador críticos: o ponteiro de temperatura sobe com o tempo;
  - velas críticas: falhas de aceleração (torque oscila de forma **determinística**, nunca com `Math.random`).
- **Colisão** com paredes e cones da área: o carro para e "quica" de leve; a velocidade cai.
- **Limite de velocidade da área:** 60 km/h (dado configurável).

### Atividade separada (não pode comprometer a oficina)

- **Novo estado `'driving'`** em `src/core/GameState.ts`, com transições `playing ↔ driving`.
- **Entrada pelo portão.** Hoje o `portao` aparece como "indisponível" e pode virar "Fazer test drive". Requisitos:
  - carro no chão, capô fechado e a OS ativa existir;
  - **nenhuma peça removida e não instalada** (carro sem peça não anda). Use o `RepairState` da OS.
- **Ao entrar:** guarde a posição do jogador e o estado da oficina; carregue a área de teste **sob demanda** (`import()` dinâmico de `src/world/TestTrack.ts`) e esconda a oficina, ou troque de cena.
- **Controles:**
  - W/S: acelerar e frear/ré;
  - A/D: esterçar;
  - Espaço: freio de mão;
  - R: reiniciar a volta no ponto de partida;
  - F: voltar à oficina;
  - Esc: pausar.

  Coloque-os em `src/data/controls.ts` (`CONTROL_HINTS` e tela de controles).
- **Câmera:** atrás do carro, com suavização. Respeite `reduceMotion` (sem balanço nem tremida).
- **HUD de direção** (`src/ui/DrivingHud.ts`):
  - velocímetro (km/h) e conta-giros;
  - luzes de alerta: bateria, óleo, temperatura, freio e injeção;
  - aviso dos controles.
- **Ao sair** (F, colisão forte ou falha): volta à oficina com tudo como estava.
  - Os km rodados entram no carro pela regra de domínio `driveKm` (`src/vehicles/domain.ts`), através da sessão (`session.apply`).
  - **Falhar no test drive não muda nada além disso.**
- **Diagnóstico (opcional, se couber):** o test drive pode virar uma evidência (como os testes funcionais) com textos que dependem do estado real. Exemplo: "o carro puxa ao frear". Se fizer, use o mesmo formato de `FUNCTIONAL_TESTS` e as regras de `src/diagnostics/rules.ts`; nada de lógica paralela.
- **Save:** salvar durante o test drive deve gravar o estado da oficina (de antes de entrar) ou ser bloqueado com aviso. Nunca grave o carro no meio da pista.

### Testes do Prompt 13

- **Unitários (`tests/unit/driving.test.ts`):**
  - acelera até o limite e não passa dele;
  - frenagem mais longa com pastilha gasta do que nova;
  - menos aderência com pneu gasto;
  - colisão para o carro;
  - reiniciar volta ao ponto inicial;
  - o mesmo passo de entrada sempre dá o mesmo resultado.
- **No navegador (`tests/e2e/testdrive.spec.ts`):**
  - entrar pelo portão (ou por um gancho de teste);
  - acelerar segurando W e ver a velocidade subir em `__GAME_DIAGNOSTICS__.driving`;
  - bater na parede, reiniciar com R, voltar com F;
  - a oficina e a OS ficam intactas, os km aumentam;
  - console sem erros.
- **Desempenho:** registre as chamadas de desenho, os triângulos e o tempo de carregamento da área (`__GAME_DIAGNOSTICS__.renderer`) no `README.md`.

### Arquivos prováveis

- **Novos:** `src/driving/**`, `src/data/driving.ts`, `src/world/TestTrack.ts`, `src/ui/DrivingHud.ts`, `docs/fisica.md` e os testes.
- **Alterados:** `src/core/GameState.ts`, `src/data/controls.ts`, `src/game/Game.ts` (ligar o estado), `src/equipment/WorkshopEquipment.ts` e `src/data/equipment.ts` (portão), `src/vite-env.d.ts` (diagnóstico e ganchos), `src/core/events.ts` (`drive:started` e `drive:ended`, se o som precisar), README e docs.

---

## Prompt 14: cidade e novos locais (resumo)

- **Bairro pequeno** com: oficina, loja de peças, ferro-velho, banco e lanchonete. Nada de cidade gigante.
- **Interações com o que já existe:**
  - a loja de peças pode abrir a mesma loja do computador;
  - o banco pode abrir a dívida (`ComputerView.debt`).
- **Mapa e marcadores** claros. Carregamento sob demanda (`import()` por local).
- **Trânsito e pedestres:** mínimos e controlados, com assets marcados como provisórios.
- **Medir FPS, tempo de carregamento e memória.** Se não conseguir medir, diga isso.
- **Testar:** navegação, colisão, voltar à oficina e transições entre locais.

## Prompt 15: funcionários e automação básica (resumo)

- **Funcionários:** 2 cargos (por exemplo, mecânico e ajudante). Cada um tem habilidade, velocidade, salário e estado atual.
- **Fila de tarefas** pura e testada (`src/staff/`):
  - o funcionário escolhe uma tarefa compatível, faz o progresso e avisa ao concluir;
  - **dois funcionários nunca pegam a mesma tarefa**.
- **Representação:** pode ser abstrata (sem navegação física).
- **Gestão:** contratar, pagar a folha (pelo livro-caixa, nova categoria) e pausar ou demitir.
- **Testar:** concorrência entre tarefas, caixa insuficiente, demissão e salvar/carregar (save vai para a versão 5).

## Prompt 16: eventos, fiscalização e pressão local (resumo)

- **Sistema de eventos reutilizável** (`src/events/` ou junto de `src/missions/`), com:
  - gatilho, opções, custo/consequência, mensagem e registro no histórico;
  - semente determinística.
- **Primeiros eventos:**
  - **fiscalização** (licenças, segurança);
  - **encontro ficcional de pressão criminosa**, sem violência gráfica e sem crime realista "operacional".
- **Escolhas sempre legíveis e recuperáveis:** nada de punição inevitável.
- **Reaproveitar:** os diálogos com escolha do Prompt 10 (`DialogueRunner`, `MissionTracker.choose`) e o livro-caixa e a reputação existentes.
- **Testar:** gatilhos, frequência, persistência no save e efeitos no dinheiro e na reputação.

## Prompt 17: multiplayer (NÃO COMEÇAR sem aprovação do Gustavo)

Só depois que o Gustavo aprovar o modo solo. O primeiro passo é **auditar e escrever um plano de rede**, sem código (ASP.NET Core + SignalR, servidor autoritativo).

## Prompt 18: QA e lançamento (os dois juntos, quando o Claude voltar)

- Modo de estabilização, sem funcionalidades novas.
- Auditar contra o GDD e corrigir por severidade, com testes de regressão.
- Fazer o checklist manual de QA e listar as limitações conhecidas.
