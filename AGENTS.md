# Guia para agentes de IA — Simulador de Mecânico

> **Para o agente Gemini (Antigravity):** este arquivo é o seu ponto de partida. Dois agentes trabalham neste projeto ao mesmo tempo: você (Gemini) e o Claude (Claude Code). Leia este guia inteiro e depois o quadro e as mensagens da coordenação (caminhos absolutos na seção 5) antes de começar qualquer tarefa.

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

## 2. Estado atual: Prompts 1 a 9 concluídos

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

**Testes atuais:** 166 testes de regras e 22 no navegador, todos passando. **A próxima etapa do roteiro é o Prompt 10 (tutorial e Ato 1).**

Detalhes: `README.md` (estrutura, controles, roteiro de teste manual) e `docs/formato-de-dados.md` (formato de todos os dados).

## 3. Arquitetura: como o código está organizado

```
src/core/        loop, renderer, entrada, eventos, estados do jogo, relógio
src/data/        TODO o conteúdo (carros, peças, clientes, casos, preços, fornecedores)
src/vehicles/    estado do carro e regras de domínio (domain.ts: funções puras)
src/diagnostics/ exames e hipóteses (rules.ts puro; view.ts = o que a UI pode ver)
src/customers/   decisão, avaliação e reputação (puras)
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

**Pastas de trabalho (git worktree, já criadas):**

| Agente | Pasta | Branch | Portas (dev / preview) |
| --- | --- | --- | --- |
| Claude | `C:\Users\Gustavo\Desktop\jogo mecanico` | `main` (commits pequenos e testados) | 5188 / 4188 |
| Gemini | `C:\Users\Gustavo\Desktop\jogo mecanico (gemini)` | `gemini/arte-som` (uma branch por tarefa) | 5288 / 4288 (arquivo local `.dev-ports.json`) |

Cada pasta tem a **sua cópia** dos arquivos. Por isso, os arquivos de coordenação têm **um único endereço**, a pasta do Claude, e os dois agentes os leem e editam sempre por esse caminho completo:

| Arquivo (caminho absoluto) | Para que serve |
| --- | --- |
| `C:\Users\Gustavo\Desktop\jogo mecanico\docs\coordenacao\QUADRO.md` | Quem está fazendo o quê, e quais arquivos estão reservados. |
| `C:\Users\Gustavo\Desktop\jogo mecanico\docs\coordenacao\MENSAGENS.md` | Recados entre os agentes. Só se acrescenta no fim; nunca se apaga. |

> Gemini: **não edite** a cópia de `docs/coordenacao/` que existe na sua pasta (ela fica desatualizada). Use os caminhos acima. Quem faz o commit desses arquivos é o Claude.

### Regras para não atrapalhar um ao outro

1. **Reserve antes de começar.** Coloque a tarefa no quadro com o seu nome e os arquivos que vai alterar. Não mexa em arquivos reservados pelo outro agente: peça no `MENSAGENS.md`.
2. **Arquivos de alto risco**, que só um agente edita por vez (sempre reservando no quadro): `src/game/Game.ts`, `src/game/GameSession.ts`, `src/vite-env.d.ts`, `src/styles.css`, `src/core/events.ts`, `tests/e2e/helpers.ts`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `package.json`. No `styles.css`, prefira **acrescentar** uma seção nova no fim.
3. **Fique em dia com a `main`.** O Gemini traz as novidades para a sua branch com `git merge main`, dentro da pasta dele, com frequência e sempre antes de pedir integração.
4. **Integração na `main` (um único integrador: o Claude).** O git não deixa a mesma branch aberta em duas pastas, e a `main` está na pasta do Claude. Por isso:
   1. o Gemini roda `npm run test:all` e `npm run build` na pasta dele, faz commit na branch dele e escreve no `MENSAGENS.md`: "pronto para integrar: <branch>, <resumo>, <testes>";
   2. o Claude faz `git merge <branch>` na `main`, roda os testes de novo, resolve conflitos (se houver) e envia ao GitHub;
   3. o Claude avisa no `MENSAGENS.md`, e o Gemini faz `git merge main`.

   Commits pequenos, com mensagem em pt-BR explicando o porquê.
5. **Ao terminar uma tarefa:** marque-a como concluída no quadro, libere os arquivos e deixe um recado no `MENSAGENS.md` com o que mudou e o que o outro agente precisa saber (novos dados, funções, eventos, ganchos de teste).

### Primeira tarefa do Gemini

Leia o `QUADRO.md` e o `MENSAGENS.md` (pelos caminhos absolutos acima). Depois responda no `MENSAGENS.md`:
- se concorda com a divisão proposta;
- em que você é mais forte neste projeto;
- qualquer ajuste no protocolo.

Só então comece a sua tarefa.
