# Quadro de tarefas — Claude × Gemini

Atualize sempre que pegar, terminar ou abandonar uma tarefa. Não edite a linha do outro agente: peça no `MENSAGENS.md`.
Status possíveis: `proposta` · `em andamento` · `bloqueada` · `concluída`.

## Em andamento / propostas

| Tarefa | Agente | Status | Branch | Arquivos reservados (só o dono edita) |
| --- | --- | --- | --- | --- |
| Prompt 23: abertura cinematográfica e história curta (sistema de cenas em dados, personalização, save) | Claude | em andamento | `main` | `src/cinematics/**` (novo), `src/data/cinematics.ts` (novo), `src/game/**`, `src/ui/**`, `src/save/**`, `src/missions/**`, `src/data/missions.ts`, `src/core/**`, `src/styles.css`, `src/ui/design/**`, `tests/**` (exceto os seus) |
| Prompts 19 → 20 → 21 → 22 → 25 (áudio): arte, oficina, bairro, carros e personagens, som | Gemini | em andamento | `main` | `src/world/**` (incl. novos `materials/`, `assets.ts`, `ArtSandbox.ts`, `workshop/`, `city/`), `src/vehicles/PlaceholderCar.ts` e `src/vehicles/models/**`, `src/characters/**` (novo), `src/utils/canvasTextures.ts`, `src/utils/mergeStatic.ts`, `src/audio/**`, `src/data/lighting.ts` (novo), `public/` (exceto `public/fonts/`), `docs/arte/**` |

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

Roteiro de polimento (Prompts 19–26, pedido do Gustavo): `docs/roadmap-polimento.md`.

| Prompt | Etapa | Dono sugerido |
| --- | --- | --- |
| 17 | Multiplayer (técnico) | Claude, **só com aprovação do Gustavo** |
| 19 | Direção de arte final e pipeline de assets | Gemini (Claude revisa o pipeline) |
| 20 | Oficina nível Steam | Gemini |
| 21 | Bairro vivo de São Cristóvão | Gemini |
| 22 | Carros e personagens com vida | Gemini (+ Claude na ligação com o estado do carro) |
| 23 | Abertura cinematográfica e história curta | Claude (sistema) + Gemini (cenas e personagens) |
| 24 | UI e UX de produto | Claude |
| 25 | Som, música e sensação de jogo | Gemini (áudio) + Claude (game feel) |
| 26 | Multiplayer: os irmãos e a oficina compartilhada | Claude, depois do 17 |

## Configuração

- [x] Os dois agentes trabalham na mesma pasta (`jogo mecanico`), na `main`, cada um nos seus arquivos. A pasta separada (worktree) foi descartada: o Antigravity não a abria.
- [x] Direção visual escolhida pelo Gustavo: **Híbrida (A + B)** — geometria limpa e legível da Direção A + materiais PBR, reflexos e atmosfera carioca da Direção B.

## Concluídas

| Tarefa | Agente | Commit |
| --- | --- | --- |
| Prompt 24: UI e UX de produto (tema, fontes, ícones, HUD, configurações, remapeamento, acessibilidade, comprar o que falta, carregamento, contraste AA) | Claude | ver `git log` |
| Prompts 1–9 | Claude | `654a5a3`, `4b8434b`, `a50e205` |
| Prompt 10: tutorial com o Seu Zé e começo do Ato 1 (missões, diálogos, dívida do banco, save v2) | Claude | `9d1f42b` |
| Prompt 11: ferramentas e upgrades (5 itens × 3 níveis, efeitos nas regras, aba Oficina, save v3) | Claude | ver `git log` |
| Prompt 12: 10 carros, peças por linha e ano, OS geradas por semente, enciclopédia, save v4; ligados no `Game.ts` os `bindEvents` da cena e do som | Claude | ver `git log` |
| Prompt 13: test drive (física própria, estado `driving`, pátio sob demanda, painel do carro) | Claude | ver `git log` |
| Passe de arte e som (GDD §20, Direção Híbrida A+B) + destaque do tutorial (`setHighlight`) + som/ambiência no barramento (`Sfx.bindEvents`) + visuais dos 5 upgrades (`setUpgradeLevel`) | Gemini | `e4ede73`, `4a3c499` |
| Carroceria 3D por categoria (`popular`, `hatch`, `sedan`, `suv`, `picape`, `van`) e dimensões por modelo (`VEHICLES`) escutando `vehicle:changed` | Gemini | `5f3e9b5` |
| Prompt 13 (passe de arte e som): carroceria 3D por categoria e visual Híbrido A+B em `src/world/TestTrack.ts` + partida/ronco de motor em `src/audio/Sfx.ts` | Gemini | `11df490` |
| Prompt 14: cidade e novos locais (bairro com oficina, loja de peças, ferro-velho, banco e lanchonete; mapa com marcadores; carregamento sob demanda; trânsito e pedestres controlados) | Gemini | `9fde993` |
| Prompt 15: funcionários e automação básica (2 cargos: `mecanico` e `ajudante`, fila de tarefas concorrente-segura, contratação, folha salarial, pausa/demissão, save v5) | Gemini | ver `git log` |
| Prompt 16: eventos, fiscalização e pressão local (sistema de eventos reutilizável, gatilhos determinísticos, escolhas recuperáveis, histórico e efeitos no caixa/reputação) | Gemini | ver `git log` |
