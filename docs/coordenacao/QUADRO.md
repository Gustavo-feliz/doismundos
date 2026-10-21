# Quadro de tarefas — Claude × Gemini

Atualize sempre que pegar, terminar ou abandonar uma tarefa. Não edite a linha do outro agente: peça no `MENSAGENS.md`.
Status possíveis: `proposta` · `em andamento` · `bloqueada` · `concluída`.

## Em andamento / propostas

| Tarefa | Agente | Status | Branch | Arquivos reservados (só o dono edita) |
| --- | --- | --- | --- | --- |
| *(nenhuma tarefa em andamento no momento)* | — | — | — | — |

### Por que essa divisão

As duas tarefas quase **não tocam os mesmos arquivos**:
- o Prompt 10 mexe em regras, estado, UI e save;
- o passe de arte e som mexe só na cena 3D e no áudio.

Assim dá para trabalhar em paralelo sem conflito. O passe de arte é o que mais falta para o jogo "ficar muito bom", e o Gemini pode usar geração de imagem e textura nele.

**Contrato que a arte precisa manter.** Os testes no navegador e as interações dependem destes pontos da cena:

| Ponto | Arquivo | O que manter |
| --- | --- | --- |
| Peças interativas | `buildWorkshop()` | Posições e ids (`tagInteractable`, `EQUIPMENT_IDS`) dos objetos interativos. |
| Mira dos testes | `tests/e2e/helpers.ts` → `AIM` | Os pontos de mira usados pelos testes. |
| Partes do carro | `PlaceholderCar.ts` | `group`, `hoodPivot`, `engineBay`, `hoodClosedAngle`, `setLook`. |
| Colisão | colliders | Mudou o tamanho de um objeto? Ajuste o colisor junto. |

Se um objeto mudar de lugar, atualize `AIM` e avise no `MENSAGENS.md`.

**Decisão pendente do Gustavo** (GDD §1.6 e §20.2): a direção visual, **low-poly estilizado** ou **semi-realista otimizado**. O Gemini deve propor as duas com uma imagem de referência cada e esperar a escolha antes de produzir em escala.

## Fila (próximas etapas do roteiro)

| Prompt | Etapa | Sugestão de dono |
| --- | --- | --- |
| 12 | Mais carros, serviços e conteúdo orientado por dados | bom para dividir: um faz dados e modelos, o outro faz regras |
| 13 | Direção e test drive | a definir (física: avaliar Rapier) |
| 18 | QA, desempenho e lançamento | os dois |

## Configuração

- [x] Os dois agentes trabalham na mesma pasta (`jogo mecanico`), na `main`, cada um nos seus arquivos. A pasta separada (worktree) foi descartada: o Antigravity não a abria.
- [x] Direção visual escolhida pelo Gustavo: **Híbrida (A + B)** — geometria limpa e legível da Direção A + materiais PBR, reflexos e atmosfera carioca da Direção B.

## Concluídas

| Tarefa | Agente | Commit |
| --- | --- | --- |
| Prompts 1–9 | Claude | `654a5a3`, `4b8434b`, `a50e205` |
| Prompt 10: tutorial com o Seu Zé e começo do Ato 1 (missões, diálogos, dívida do banco, save v2) | Claude | `9d1f42b` |
| Prompt 11: ferramentas e upgrades (5 itens × 3 níveis, efeitos nas regras, aba Oficina, save v3) | Claude | ver `git log` |
| Passe de arte e som (GDD §20, Direção Híbrida A+B) + destaque do tutorial (`setHighlight`) + som/ambiência no barramento (`Sfx.bindEvents`) + visuais dos 5 upgrades (`setUpgradeLevel`) | Gemini | `e4ede73` + commit final |
