# Guia para agentes de IA — Simulador de Mecânico

> **Para o agente Gemini (Antigravity):** este arquivo é o seu ponto de partida. Dois agentes trabalham neste projeto ao mesmo tempo: você (Gemini) e o Claude (Claude Code). Leia este guia inteiro e depois `docs/coordenacao/QUADRO.md` e `docs/coordenacao/MENSAGENS.md` antes de começar qualquer tarefa.

## 1. O projeto

**O jogo.** Simulador de oficina mecânica em primeira pessoa para navegador (PC), em português do Brasil, num bairro fictício inspirado no Rio de Janeiro.
- **Dono do projeto:** Gustavo. Ele é quem decide prioridades e aprova mudanças grandes.
- **Fonte de verdade:** `GDD_Simulador_de_Mecanico_Claude_Code.md`, com cerca de 1300 linhas. **Não leia o arquivo inteiro.** Busque a seção do assunto (§2 escopo, §11 diagnóstico, §14 orçamento, §20 arte/HUD, §21 arquitetura/save, §23 aceite, §24 roteiro de Prompts 0–18) e leia só ela.
- **Regra de ouro do GDD:** implemente **só o escopo da etapa atual** e não simule funcionalidade futura como se estivesse pronta.

**Stack:** Three.js + Vite + TypeScript (modo estrito), Vitest para os testes de regras e Playwright para os testes no navegador. Node 24 está em `C:\Program Files\nodejs`.

**Repositório:** https://github.com/Gustavo-feliz/doismundos, branch `main`.

**Comandos:**

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Jogo em desenvolvimento, porta 5188. |
| `npm run build` | Checa os tipos e gera o build de produção. |
| `npm test` | Testes de regras (Vitest). |
| `npm run test:e2e` | Testes no navegador (Playwright). |
| `npm run test:all` | Tipos + regras + navegador. |

## 2. Estado atual: Prompts 1 a 16 e 18 (QA) concluídos

| Prompt | Entrega |
| --- | --- |
| 1 | Fundação: cena 3D, primeira pessoa, menu, HUD, configurações. |
| 2 | Interação por raycast (elevador, capô, gaveta, luzes) com estados disponível / em uso / indisponível. |
| 3 | Veículo com 15 peças, **estado real separado do que o jogador sabe**, painel de inspeção. |
| 4 | Diagnóstico: 3 OS, exames que gastam tempo, evidências, hipóteses com confiança. |
| 5 | Orçamento com fórmula única e negociação com 3 perfis de cliente. |
| 6 | Reparo (acesso → remover → instalar → teste final), qualidade sem sorteio. |
| 7 | Loja com 2 fornecedores e prazo de entrega, estoque em lotes, livro-caixa, pagamento na entrega. |
| 8 | Avaliação do cliente, reputação geral e por especialidade, garantia, retornos. |
| 9 | Save no IndexedDB: 3 slots + autosave, `schemaVersion`, soma de verificação, cópia de segurança, migrações. |
| 10 | Tutorial com o Seu Zé e começo do Ato 1: missões por dados (`src/missions/`, `src/data/missions.ts`), diálogos com escolha, dicas (H), dívida do banco. Save versão 2. |
| 11 | Ferramentas e upgrades (`src/upgrades/`, `src/data/upgrades.ts`): 5 itens × 3 níveis, efeito em tempo aplicado nas regras, aba Oficina no computador, evento `upgrade:changed`. Save versão 3. |
| 12 | 10 carros fictícios (6 categorias), peças em linhas com compatibilidade por modelo/ano e checagem de cobertura, 9 serviços, OS geradas por semente que nunca saem impossíveis (`src/procedural/`), enciclopédia (aba Catálogo), evento `vehicle:changed`. Save versão 4. |
| 13 | Test drive pelo portão: física própria em `src/driving/` (avaliação em `docs/fisica.md`), estado real das peças muda a direção, estado de jogo `driving`, pátio carregado sob demanda (`src/world/TestTrack.ts`), painel com velocímetro, conta-giros e luzes. |
| 14 | Cidade e novos locais (`src/city/`, `src/data/city.ts`, `src/world/CityNeighborhood.ts`, `src/world/CityLocationDetails.ts`, `src/ui/CityHud.ts`): bairro com oficina, loja de peças, ferro-velho (venda de sucata e garimpo diário por semente), banco e lanchonete; mapa com marcadores; carregamento sob demanda; trânsito e pedestres mínimos controlados. |
| 15 | Funcionários e automação básica (`src/staff/`, `src/data/staff.ts`, aba Equipe no `ComputerPanel`): 2 cargos (`mecanico` e `ajudante`), fila de tarefas com proteção de concorrência, contratação, folha salarial, pausa/demissão. Save versão 5. |
| 16 | Eventos, fiscalização e pressão local (`src/events/`, `src/data/events.ts`, seção na aba Oficina do `ComputerPanel`): sistema de eventos reutilizável com gatilho, cooldown, escolhas sempre recuperáveis, histórico e efeitos no caixa e reputação. |

| 18 | QA (Claude): auditoria contra o GDD, 3 problemas graves corrigidos (garimpo ilimitado, folha opcional, eventos repetíveis), falha de carregamento tratada, three.js em arquivo separado, `npm run test:prod`, teste de longo prazo. Relatório em `docs/QA.md`. Save versão 6. |
| 23 | Abertura (Claude): sistema de cenas em dados (`src/cinematics/`, `src/data/cinematics.ts`), novo jogo com nome e tratamento, abertura de 7 tomadas com escolha, estado `cutscene`, save versão 7 com o perfil. |
| 24 | UI/UX (Claude): tema e fontes, ícones, HUD com avisos empilhados, configurações em seções com remapeamento de teclas, tamanho de texto, modo daltônico, limite de FPS, velocidade do tempo; "comprar o que falta"; tela de carregamento; contraste AA testado. |

**Testes atuais:** 242 testes de regras, 31 no navegador e 1 no build de produção, todos passando. **O modo solo está concluído e auditado; o Prompt 17 (multiplayer) exige aprovação do Gustavo. O plano de rede está em `docs/plano-multiplayer.md`.**

Detalhes: `README.md` (estrutura, controles, roteiro de teste manual) e `docs/formato-de-dados.md` (formato de todos os dados).

## 3. Arquitetura: como o código está organizado

```
src/core/        loop, renderer, entrada, eventos, estados do jogo, relógio
src/data/        TODO o conteúdo (carros, peças, clientes, casos, preços, fornecedores)
src/vehicles/    estado do carro e regras de domínio (domain.ts: funções puras)
src/diagnostics/ exames e hipóteses (rules.ts puro; view.ts = o que a UI pode ver)
src/customers/   decisão, avaliação e reputação (puras)
src/missions/    missões, condições, diálogos (puros; o Game traduz em HUD, som e destaque)
src/economy/     dinheiro em centavos, fórmula do orçamento, livro-caixa
src/orders/      estados da OS, garantia, visões das abas
src/repairs/     regras do reparo
src/inventory/   tipos de estoque, pedidos e fornecedores
src/save/        preferências e saves (formato, validação, slots, migrações)
src/game/        Game.ts (liga tudo, ordem de atualização) e GameSession.ts (estado da sessão)
src/world/       oficina 3D (provisória) e colisão
src/ui/          HUD, menu, painéis (sem framework; helper h() em ui/dom.ts)
tests/unit/      Vitest   ·   tests/e2e/   Playwright (helpers.ts tem pontos de mira prontos)
```

**Princípios que não podem ser quebrados:**
1. **Regras de jogo são funções puras e testadas.** A cena 3D só lê o estado e nunca guarda estado de jogo.
2. **A interface nunca vê segredo.** A UI recebe "visões" (`*View`) montadas só com o que o jogador sabe. O desgaste real, a causa verdadeira do defeito e o fato de o diagnóstico ter acertado nunca chegam à tela antes da hora.
3. **Dinheiro é sempre um número inteiro de centavos.** O orçamento sai de **uma** fórmula só (`src/economy/quote.ts`).
4. **Conteúdo fica em `src/data/`, tipado e validado ao abrir o jogo,** com mensagens de erro úteis.
5. **Nada de aleatoriedade injusta.** Os resultados são determinísticos e testáveis.
6. **Textos do jogo e comentários ficam em pt-BR.** Marcas e modelos de carro são fictícios.
7. **Assets provisórios** são marcados como temporários (prefixo `PLACEHOLDER_`, `userData.placeholder`).

## 4. Forma de trabalhar (combinada com o Gustavo)

- Etapas pequenas e com escopo definido. Edite trechos localizados; não reescreva arquivos inteiros sem necessidade.
- Leia só o necessário e economize tokens, **sem pular verificações**: build, console sem erros, fluxo testado.
- Rode os testes no navegador **uma vez** por verificação. Repita só se houver falha intermitente.
- **Pronto** = o jogo inicia, sem erros no console, demonstrável no navegador, fluxo testado de ponta a ponta, estados inválidos tratados, testes passando, docs atualizadas.
- Ao terminar, informe ao Gustavo em poucas linhas: arquivos alterados, testes executados e pendências.

## 5. Colaboração entre os dois agentes

**Os agentes não conversam diretamente.** A comunicação acontece por arquivos, e o Gustavo avisa cada um quando há novidade.

**Os dois trabalham na MESMA pasta** (`C:\Users\Gustavo\Desktop\jogo mecanico`), na branch `main`. A pasta separada por git worktree foi descartada porque o Antigravity não a abria. Não há conflito porque cada agente só edita os **seus** arquivos reservados.

| Arquivo | Para que serve |
| --- | --- |
| `docs/coordenacao/QUADRO.md` | Quem está fazendo o quê, e quais arquivos estão reservados. |
| `docs/coordenacao/MENSAGENS.md` | Recados entre os agentes. Só se acrescenta no fim; nunca se apaga. |

### Regras para não atrapalhar um ao outro

1. **Reserve antes de começar.** Coloque a tarefa no quadro com o seu nome e os arquivos que vai alterar. **Nunca edite arquivo reservado pelo outro agente**: peça no `MENSAGENS.md`.
2. **Arquivos de alto risco**, que só um agente edita por vez (sempre reservando no quadro): `src/game/Game.ts`, `src/game/GameSession.ts`, `src/vite-env.d.ts`, `src/styles.css`, `src/core/events.ts`, `tests/e2e/helpers.ts`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `package.json`. No `styles.css`, prefira **acrescentar** uma seção nova no fim.
3. **Sem trocar de branch.** Os dois ficam na `main`. Ninguém roda `git checkout`, `git switch`, `git reset`, `git stash` nem `git pull --rebase`: esses comandos mexem nos arquivos do outro.
4. **Commit só dos seus arquivos.** Use `git add <arquivos seus>`, **nunca** `git add -A` ou `git add .`. Antes de commitar, rode `git status` e confira que nada do outro agente entrou. Commits pequenos, mensagem em pt-BR explicando o porquê. Quem envia ao GitHub (`git push`) é o Claude, depois de rodar os testes; o Gemini avisa no `MENSAGENS.md` quando tiver commits prontos.
5. **Testes com trabalho em andamento do outro.** Se `npm run test:all` ou o build falhar por causa de arquivos **do outro agente** (que ainda está no meio do trabalho), não "conserte" esses arquivos: avise no `MENSAGENS.md` e teste só a sua parte (por exemplo, `npx vitest run <seus testes>`) até ele terminar.
6. **Ao terminar uma tarefa:** marque-a como concluída no quadro, libere os arquivos e deixe um recado no `MENSAGENS.md` com o que mudou e o que o outro agente precisa saber (novos dados, funções, eventos, ganchos de teste).

### Primeira tarefa do Gemini

Leia o `QUADRO.md` e o `MENSAGENS.md`. Depois responda no `MENSAGENS.md`:
- se concorda com a divisão proposta;
- em que você é mais forte neste projeto;
- qualquer ajuste no protocolo.

Só então comece a sua tarefa.
