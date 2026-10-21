# QA e preparação de lançamento (Prompt 18)

Auditoria feita na madrugada de 2026-10-21, contra o GDD, de tudo o que existe até o Prompt 16. **Nenhuma funcionalidade nova foi adicionada:** só correções e testes de regressão. Aqui só aparece como "testado" o que foi de fato executado.

## 1. Como instalar e rodar

Pré-requisitos: Node.js 20 ou mais novo (testado com o 24) e um navegador desktop com WebGL 2 (Chrome, Edge ou Firefox).

```
npm install          # uma vez
npm run dev          # jogo em desenvolvimento: http://127.0.0.1:5188
npm run build        # checa os tipos e gera o pacote de produção em dist/
npm run preview      # serve o pacote de produção: http://127.0.0.1:4188
```

**Testes:**

| Comando | O que roda |
| --- | --- |
| `npm test` | Regras (Vitest): 242 testes em 18 arquivos. |
| `npm run test:e2e` | Navegador (Playwright, Chromium): 32 testes no servidor de desenvolvimento, incluindo o orçamento de desempenho. |
| `npm run test:prod` | Gera o build e roda a fumaça no **pacote de produção**. |
| `npm run test:all` | Tipos + regras + navegador. |

**Publicação:** o `dist/` é estático e pode ir para qualquer hospedagem de arquivos. Os saves ficam no navegador do jogador (IndexedDB), sem servidor.

## 2. Resultado da última execução (2026-10-21)

| Verificação | Resultado |
| --- | --- |
| `tsc --noEmit` | sem erros |
| `npm test` | 242 de 242 passando |
| `npm run test:e2e` | 32 de 32 passando (com o orçamento de desempenho) |
| `npm run test:prod` | 1 de 1 passando: abre, joga, test drive e bairro carregam, console sem erros |
| `npm run build` | ok, sem aviso de tamanho |
| `npm audit` | 0 vulnerabilidades |
| Teste de longo prazo (`tests/unit/soak.test.ts`) | 40 OS seguidas; caixa = livro-caixa, save válido e idêntico na volta, sempre há próxima OS |

## 3. Achados da auditoria, por severidade

### Corrigidos nesta etapa (com teste de regressão)

| Severidade | Problema | Correção |
| --- | --- | --- |
| Alta | **Garimpo ilimitado no Ferro-Velho.** A oferta do dia (peça a 48% do preço) podia ser comprada sem limite, e o preço vinha da tela. | A sessão calcula as ofertas e valida o preço, com 1 unidade por oferta por dia (salva no save). |
| Alta | **Funcionários trabalhavam sem salário para sempre.** A folha era opcional. | Cada funcionário tem o "dia pago". Sem o salário do dia, ele para (a tarefa espera sem perder o progresso). |
| Alta | **Eventos repetíveis à vontade.** "Atender agora" ignorava as regras de gatilho: no dia 1 dava para repetir a opção grátis com +2 de reputação. | A regra de domínio exige dia mínimo, OS entregues e intervalo; a tela só antecipa o que já está liberado. |
| Média | **Folha cobrava o mesmo dia duas vezes** (o adiantamento da contratação e de novo na folha do dia). | O adiantamento paga o dia da contratação. |
| Média | **Falha ao carregar o pátio ou o bairro** (rede, arquivo ausente): a promessa rejeitada escapava, sem aviso. | O jogo avisa o jogador e continua na oficina. Os detalhes 3D de um local são opcionais. Há teste bloqueando os arquivos. |
| Média | **Pacote principal de 939 kB** (aviso no build). | O three.js foi para um arquivo próprio (576 kB, fica no cache entre versões); o jogo tem 365 kB. |
| Baixa | **Janela de 761 a 1100 px:** o objetivo cobria o caixa e a hora; as abas do computador sumiam na borda. | Novo posicionamento; as abas quebram linha. |
| Baixa | Teste da equipe lia o diagnóstico antes do quadro seguinte (instável). | Espera os quadros, como manda o `CLAUDE.md`. |
| Baixa | A lanchonete recebia preço e tempo da tela. | A tela manda só o ID; preço e tempo vêm do cardápio. |
| Baixa | Na rua, sair (F) ou abrir o mapa (M) encerrava o quadro no meio, pulando a limpeza da entrada e o diagnóstico. | O quadro termina normalmente (veio junto com a extração do bairro). |
| Média (arquitetura) | `Game.ts` com ~1.700 linhas. | Test drive e bairro extraídos para `src/game/TestDriveController.ts` e `src/game/CityController.ts`, ligados por interfaces pequenas. O `Game.ts` agora tem ~1.320 linhas, com o mesmo comportamento e a suíte inteira passando. |

**Save:** passou para a **versão 6**, com migrações 1 → 6 testadas.

### Pendentes (recomendação, sem bug que trave o jogo)

| Severidade | Ponto | Recomendação |
| --- | --- | --- |
| Média | **Desempenho da oficina:** 458 chamadas de desenho na visão inicial. O `sceneStats()` (gancho de depuração) mostra de onde vêm: carro 82 malhas, estante 47, luminárias 45, bancada 31, armário 30. | **Feito:** a rua vista pelo portão foi unida por material (`src/utils/mergeStatic.ts`), de 106 para 19 malhas. Olhando para a rua, as chamadas caíram de 280 para 195. **Falta** (arte, Gemini): instancing nos repetidos (caixas da estante, luminárias, ferramentas) e esconder a decoração no nível "baixa". Os grupos com visual de upgrade ou objetos interativos não devem ser unidos às cegas. Meta: ≤ 250 chamadas. |
| Média | **`src/game/GameSession.ts` com ~1.450 linhas.** O `Game.ts` já foi dividido. | Mover equipe, eventos e bairro da sessão para serviços que recebem o estado e devolvem o novo estado (como as regras puras já fazem), um por vez e com a suíte rodando. |
| Baixa | A sucata (`sellScrap`) recebe o fator de quem chama; hoje ele vem de dados, não do jogador. | Ler o fator dos dados dentro da sessão. |
| Baixa | Não existe remapeamento de teclas (GDD §20.4). | Entra junto com a tela de controles completa. |
| Baixa | Se o arquivo do pátio ou do bairro falhar uma vez, o navegador só tenta de novo depois de recarregar a página. | A mensagem já pede para recarregar. |
| Baixa | Aviso do Vite sobre `import "./dev-ports"` sem extensão no `vite.config.ts`. | Inofensivo hoje; ajustar quando o carregador nativo de config virar padrão. |

## 4. Desempenho medido

Medido com Chromium em modo de teste, 1280×720, máquina de desenvolvimento do projeto. A GPU do modo headless não serve de referência de FPS: meça o FPS no navegador normal com `?debug`.

| Área | Chamadas de desenho | Triângulos | Memória JS |
| --- | --- | --- | --- |
| Oficina | 458 | 25.824 | ~31 MB |
| Pátio de teste | 104 | 5.150 | ~28 MB |
| Bairro | 47 | 1.024 | ~29 MB |

Tempo até o primeiro quadro do jogo: ~2,3 s (servidor de desenvolvimento). O pátio e o bairro carregam sob demanda, em arquivos de 4 a 6 kB.

### Orçamento de desempenho (GDD §22)

O teste `tests/e2e/desempenho.spec.ts` falha se uma mudança passar do **teto**, o que barra regressões. A **meta** é onde queremos chegar.

| Medida | Teto (teste) | Meta | Hoje |
| --- | --- | --- | --- |
| Oficina: chamadas de desenho | 500 | 250 | 458 (acima da meta) |
| Oficina: triângulos | 60.000 | 50.000 | ~25.800 |
| Pátio de teste: chamadas | 200 | 150 | 104 |
| Bairro: chamadas | 150 | 120 | 47 |
| Memória JS | 150 MB | 100 MB | ~31 MB |
| Carregamento até o primeiro quadro (dev) | 10 s | 3 s | ~2,3 s |
| Pacote do jogo (sem o three.js) | — | ≤ 500 kB | 365 kB |

Quando a oficina chegar à meta (≤ 250 chamadas), abaixe o teto do teste junto.

## 5. O que está concluído de verdade (e como foi verificado)

| Prompt | Funcionalidade | Verificado por |
| --- | --- | --- |
| 1 | Cena 3D, primeira pessoa, menu, HUD, configurações | `foundation.spec.ts` |
| 2 | Interação (elevador, capô, gaveta, luzes, portão) | `interaction.spec.ts` |
| 3 | 15 peças, estado real × conhecido, inspeção | `vehicleDomain.test.ts`, `inspection.spec.ts` |
| 4 | Diagnóstico com exames, evidências e hipóteses | `diagnostics.test.ts`, `diagnosis.spec.ts` |
| 5 | Orçamento e negociação | `orders.test.ts`, `order.spec.ts` |
| 6 | Reparo e conclusão | `orders.test.ts`, `order.spec.ts` |
| 7 | Loja, estoque, caixa | `economy.test.ts`, `order.spec.ts` |
| 8 | Reputação, garantia, retorno | `reputation.test.ts` |
| 9 | Save (slots, autosave, soma de verificação, cópia de segurança, migrações) | `save.test.ts`, `save.spec.ts` |
| 10 | Tutorial, Ato 1, diálogos, dívida do banco | `missions.test.ts`, `tutorial.spec.ts` |
| 11 | Ferramentas e upgrades | `upgrades.test.ts`, `upgrades.spec.ts` |
| 12 | 10 carros, OS geradas por semente, enciclopédia | `generation.test.ts`, `catalog.spec.ts` |
| 13 | Test drive com física própria | `driving.test.ts`, `testdrive.spec.ts` |
| 14 | Bairro com 5 locais, mapa, sucata, garimpo, lanchonete | `city.test.ts`, `city.spec.ts` |
| 15 | Funcionários, fila de tarefas, folha | `staff.test.ts`, `staff.spec.ts` |
| 16 | Eventos, fiscalização, pressão local | `events.test.ts`, `events.spec.ts` |

**Plano de testes do GDD (§25):**
- **Teste A** (caminho feliz completo, terminando em salvar, recarregar e conferir): `order.spec.ts`.
- **Teste B** (erros esperados): coberto por `orders.test.ts`, `save.spec.ts`, `interaction.spec.ts`, `staff.test.ts`, `foundation.spec.ts` (redimensionar) e `robustez.spec.ts` (asset que falha).
- **Teste C** (regressão): a suíte inteira roda a cada etapa, mais o teste de longo prazo.

**Não feito:** o Prompt 17 (multiplayer). Ele depende da aprovação do modo solo pelo Gustavo; o plano está em `docs/plano-multiplayer.md`.

## 6. Checklist manual de QA (o que a automação não cobre)

O navegador headless não captura o mouse nem toca áudio de verdade. Antes de publicar, confira à mão no Chrome e no Firefox:

1. [ ] **Iniciar jogo** captura o mouse; Esc pausa e libera; **Continuar** captura de novo.
2. [ ] Mouse com sensibilidade e inversão das configurações; o olhar vertical para nos limites.
3. [ ] **Sons:** ferramentas, diálogo do Seu Zé, missão concluída, motor no test drive e ambiente da oficina. O volume das configurações funciona; com volume 0, silêncio.
4. [ ] **"Reduzir movimento":** a câmera do menu para, o destaque do tutorial não pulsa, o test drive sem balanço nem tremida.
5. [ ] **Qualidade "baixa":** sem sombras e com DPR 1. Anote o FPS na oficina com `?debug`.
6. [ ] **Tutorial completo** jogando de verdade (8 passos) e a ligação do banco.
7. [ ] **Test drive com o carro de demonstração:** luz de freio acesa, carro freia mais longe. Bater, apertar R e F.
8. [ ] **Bairro:** andar até os 5 locais, abrir o mapa com M, vender sucata, garimpar (só 1 por oferta) e voltar.
9. [ ] **Equipe:** contratar, passar para o dia seguinte sem pagar (o funcionário para), pagar e ver a tarefa voltar a andar.
10. [ ] **Evento:** esperar liberar (dia 2 e 1 OS entregue), atender e conferir o caixa e a reputação.
11. [ ] **Salvar e carregar** em cada área: oficina, bairro, test drive (deve voltar à oficina).
12. [ ] **Janela:** 800×600, 1366×768 e 1920×1080, sem nada cortado ou sobreposto.
13. [ ] Fechar a aba no meio do jogo e reabrir: "Continuar jogo salvo" volta ao último autosave.

## 7. Limitações conhecidas

- **Modelos 3D procedurais e provisórios:** carros por categoria, oficina, pátio e bairro. Estão marcados como `PLACEHOLDER_` ou têm o selo "Protótipo" na tela.
- **Test drive:** física simplificada (modelo bicicleta), colisão com dois círculos, sem trânsito.
- **OS geradas:**
  - o gerador não olha o caixa (o jogador pode dispensar o cliente);
  - o orçamento usa sempre a primeira peça compatível;
  - embreagem, pneus, filtros e correia ainda não são gerados como defeito.
- **Equipe abstrata:** os funcionários não andam pela oficina em 3D, o que o GDD permite.
- **Sem multiplayer, sem conta e sem nuvem:** os saves ficam só no navegador.
- **Valores provisórios:** todo o balanceamento (`docs/balanceamento.md`) espera telemetria de jogo real.

## 8. Dependências e riscos de build

- **Produção:** só `three` 0.186 (MIT). O `lil-gui` (MIT) entra apenas no painel de depuração (`?debug`, em arquivo separado).
- **Ferramentas:** Vite 8, TypeScript 7, Vitest 5 e Playwright 1.64, com versões travadas no `package-lock.json`.
- **Sem assets externos:** sem fontes, imagens ou áudio de terceiros. Tudo é gerado por código, então não há risco de licença.
- **Risco:** o Playwright precisa do Chromium instalado (`npx playwright install chromium`) numa máquina nova.
