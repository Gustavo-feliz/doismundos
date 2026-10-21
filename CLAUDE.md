# Simulador de Mecânico — instruções para o Claude Code

Jogo de simulação de oficina mecânica para navegador (PC), em pt-BR, ambientado no Rio de Janeiro.
Stack: **Three.js + Vite + TypeScript**. Multiplayer (ASP.NET Core + SignalR) só em fase posterior.

## Fonte de verdade: o GDD
`GDD_Simulador_de_Mecanico_Claude_Code.md` (~1300 linhas). **Não leia inteiro.** Use Grep pelo título da seção e leia só o trecho necessário.
- Escopo/prioridades: §2 · Loop: §3 · Veículos: §9 · Peças: §10 · Diagnóstico: §11 · Reparo: §12
- Clientes/orçamento: §14 · Economia: §16 · Arte/HUD: §20 · Arquitetura/save: §21 · Qualidade: §22
- Critérios de aceite: §23 · Roadmap (Prompts 0–18): §24 · Testes do loop: §25 · Decisões abertas: §26

Implemente **somente o escopo da etapa atual**. Não simule funcionalidades futuras como se estivessem prontas.

## Estado e comandos
Etapas concluídas: **Prompts 1–16, 18 (QA), 23 (abertura), 24 (UI/UX) e 25 (parte visual: sensação de jogo)**. O Prompt 17 (multiplayer) espera a aprovação do Gustavo; o plano está em `docs/plano-multiplayer.md`. Relatório de QA, checklist manual e limitações: `docs/QA.md`. Balanceamento: `docs/balanceamento.md`. Próximo roteiro (polimento, Prompts 19–26): `docs/roadmap-polimento.md`.
- `npm run dev` (porta 5188) · `npm run build` · `npm test` (Vitest, unitários) · `npm run test:e2e` (Playwright) · `npm run test:prod` (fumaça no build de produção) · `npm run test:all`
- Node 24 em `C:\Program Files\nodejs`; no Bash, prefixe `export PATH="/c/Program Files/nodejs:$PATH"` se `npm` não for achado.
- Testes e2e entram no jogo via `window.__GAME_TEST_HOOKS__` (só em dev/`?debug`), porque o headless não captura o mouse. Leia `__GAME_DIAGNOSTICS__` só depois de esperar alguns quadros.

## Colaboração com o Gemini (Antigravity)
Antes de cada tarefa, leia `docs/coordenacao/QUADRO.md` e `docs/coordenacao/MENSAGENS.md`; reserve arquivos no quadro e respeite os reservados pelo outro agente. Protocolo completo: `AGENTS.md` §5.

## Regras de arquitetura (§21)
- Módulos separados: `core`, `interaction`, `vehicles`, `diagnostics`, `repairs`, `customers`, `economy`, `inventory`, `missions`, `save`, `ui`. Nada de `multiplayer` no protótipo.
- Comunicação por interfaces e eventos tipados; sem dependências circulares; sem arquivo monolítico.
- Física isolada da lógica de negócio.
- Conteúdo (carros, peças, preços, clientes, missões) em dados tipados, validados na inicialização com erros úteis.
- Save: JSON versionado (`schemaVersion`, timestamp, validação); IndexedDB para estado de jogo.
- Sem segredos no cliente; sem pagamentos reais; placeholders marcados como temporários.

## Fluxo de trabalho (economia de tokens sem perder qualidade)
- Antes de ler, decida quais arquivos são relevantes; prefira Grep/Glob e leitura de trechos.
- Não releia arquivos já analisados que não mudaram.
- Etapas pequenas e com escopo definido; uma etapa do roadmap por vez.
- Edições localizadas; não reescreva arquivos inteiros sem necessidade.
- Rode os testes relevantes à mudança — mas nunca pule verificações de funcionamento (build, console sem erros, fluxo testado) para economizar.
- Testes no navegador (Playwright): rode 1x. Repita (no máximo 1x a mais) só se houver falha intermitente.
- Não despeje arquivos completos, logs longos ou explicações repetidas na resposta.
- Skills `threejs-*` estão instaladas; use-as quando a tarefa se encaixar (ex.: `threejs-gameplay-systems`, `threejs-debug-profiler`, `threejs-qa-release`).

## Definição de pronto (resumo do §23)
Inicia pelo comando documentado · sem erros críticos no console · demonstrável no navegador · fluxo testado de ponta a ponta · estados inválidos tratados · save não corrompe · testes existentes passando · nada aprovado quebrado · docs atualizadas.
Se um teste não puder ser executado, diga isso explicitamente.

## Ao terminar cada tarefa, informe (curto)
1. Arquivos alterados
2. Testes executados e resultado
3. Problemas pendentes / limitações
