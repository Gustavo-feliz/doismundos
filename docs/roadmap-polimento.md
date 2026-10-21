# Roteiro de polimento: Prompts 19 a 26

Extensão do roteiro do GDD (§24), pedida pelo Gustavo em 2026-10-21. O objetivo é levar o jogo da qualidade de protótipo à **qualidade de um jogo de Steam**: bonito, claro, gostoso de jogar e com uma história que prende desde o primeiro minuto.

O GDD continua sendo a fonte de verdade. Estes prompts **complementam** o GDD e não mudam as regras de jogo, só a apresentação, a narrativa e a experiência.

## Regras que valem para todos os prompts

1. **Uma etapa por vez.** Leia `CLAUDE.md`, `AGENTS.md`, `docs/coordenacao/QUADRO.md` e `MENSAGENS.md` antes de começar; reserve os arquivos no quadro.
2. **Não quebre o que funciona.** `npm run test:all` e `npm run test:prod` passando ao fim de cada etapa. Mantenha os contratos usados pelos testes:
   - ids de `EQUIPMENT_IDS`;
   - pontos `AIM` (`tests/e2e/helpers.ts`);
   - API do `PlaceholderCar` (`group`, `hoodPivot`, `engineBay`, `hoodClosedAngle`, `setLook`);
   - colisores;
   - `__GAME_TEST_HOOKS__` / `__GAME_DIAGNOSTICS__`.

   Se um contrato precisar mudar, atualize os testes na mesma etapa e avise no `MENSAGENS.md`.
3. **Orçamento de desempenho** (`tests/e2e/desempenho.spec.ts` e `docs/QA.md` §4):

   | Medida | Meta |
   | --- | --- |
   | Oficina | ≤ 250 chamadas de desenho |
   | Bairro (por trecho visível) | ≤ 200 chamadas de desenho |
   | Triângulos por cena (qualidade alta) | ≤ 400 mil |
   | Texturas (qualidade alta) | ≤ 256 MB |
   | Memória JS | ≤ 150 MB |
   | FPS em GPU média (1080p, alta) | 60 |
   | FPS em GPU integrada (720p, baixa) | 30 |

   - Toda etapa de arte **mede antes e depois** e registra no `docs/QA.md`.
   - Ao melhorar, **abaixe os tetos do teste**.
4. **Três níveis de qualidade.** `baixa`, `media` e `alta` (`qualityProfile` em `src/save/settings.ts`) precisam continuar fazendo diferença real. A baixa roda em notebook com GPU integrada.
5. **Assets e licenças:**
   - Só assets próprios, gerados (as skills `threejs-image-generator`, `threejs-3d-generator` e `threejs-audio-generator` dependem de chaves de API: se não houver chave, diga isso e use procedural ou CC0) ou com licença clara (CC0 / CC-BY).
   - Registre **cada** asset externo em `docs/licencas.md` (origem, autor, licença, link).
   - Nada de marcas, carros, músicas ou pessoas reais.
6. **Formatos:**
   - GLB com Meshopt ou Draco;
   - texturas KTX2/Basis quando passarem de 512 px (`KTX2Loader`);
   - carregamento sob demanda (`import()` e loaders) com tela de carregamento honesta (progresso real, não barra falsa).
   - Assets provisórios continuam com o prefixo `PLACEHOLDER_` até serem substituídos.
7. **Acessibilidade sempre:**
   - "Reduzir movimento" desliga balanço, tremida e câmera lenta;
   - todo texto de cena tem legenda;
   - nenhuma informação só por cor.
8. **pt-BR em todos os textos**, preparando a chave de tradução (`src/data/strings/pt-BR.ts`) a partir do Prompt 24.
9. **Ao terminar:** arquivos alterados, testes executados, medições antes/depois, capturas de tela (antes/depois) e limitações.

## Ordem sugerida e quem faz

| Prompt | Etapa | Dono sugerido | Depende de |
| --- | --- | --- | --- |
| 19 | Direção de arte final e pipeline de assets | Gemini (Claude revisa o pipeline) | — |
| 20 | Oficina nível Steam | Gemini | 19 |
| 21 | Bairro vivo de São Cristóvão | Gemini | 19 |
| 22 | Carros e personagens com vida | Gemini (Claude: ligação com o estado do carro) | 19 |
| 23 | Abertura cinematográfica e história curta | Claude (sistema) + Gemini (cenas, personagens) | 22 |
| 24 | UI e UX de produto | Claude | 19 (paleta e tipografia) |
| 25 | Som, música e sensação de jogo | Gemini (áudio) + Claude (game feel) | 20 |
| 26 | Multiplayer: os irmãos e a oficina compartilhada | Claude | **Prompt 17 aprovado e concluído**, 23 |

Os Prompts 20, 21 e 24 podem rodar em paralelo depois do 19, porque não tocam os mesmos arquivos.

---

## Prompt 19: direção de arte final e pipeline de assets

**Objetivo:** definir o "jeito" visual do jogo e a base técnica para tudo que vem depois ficar bonito, coerente e leve.

``` text
Você é o diretor de arte técnico do "Simulador de Mecânico". A direção escolhida pelo Gustavo é a HÍBRIDA:
geometria limpa e legível (estilo A) com materiais PBR e iluminação realista (estilo B), num bairro carioca de São Cristóvão.
Use as skills threejs-aaa-graphics-builder e threejs-game-director.

Entregue, nesta ordem:
1. Guia de arte em docs/arte/guia.md:
   - paleta (com códigos), referências de luz por hora do dia, escala (1 unidade = 1 m);
   - regras de desgaste (sujeira, ferrugem, óleo) e de legibilidade: o que é interativo precisa se destacar sem brilhar demais;
   - 3 imagens de referência (geradas ou desenhadas) de oficina, rua e carro.
2. Biblioteca de materiais em src/world/materials/:
   - concreto com manchas, metal pintado, metal cromado, borracha, plástico, vidro, azulejo, madeira, asfalto e pedra portuguesa;
   - cada um com cor, rugosidade, normal e AO, nos três níveis de qualidade (sem normal/AO na baixa);
   - materiais compartilhados, nunca clonados à toa.
3. Pipeline de assets:
   - loader central (src/world/assets.ts) com cache, GLB + Meshopt/Draco, KTX2 e progresso real para a tela de carregamento;
   - LOD automático para props a distância;
   - InstancedMesh para tudo que se repete (caixas, latas, pneus, ferramentas, cones).
4. Iluminação e pós-processamento:
   - tone mapping ACES ou AgX, exposição calibrada e sombras suaves só onde importam;
   - AO de tela (SAO/N8AO) e bloom leve só na qualidade alta, com orçamento de custo medido;
   - luz do dia, fim de tarde e noite como presets em dados (src/data/lighting.ts).
5. docs/licencas.md, com a regra de registro de assets.

Fora do escopo: refazer a oficina, a cidade ou os carros (são os Prompts 20 a 22). Aplique o novo pipeline só num ambiente de teste (src/world/ArtSandbox.ts, abrindo com ?arte), com 10 props de exemplo.
Critérios: o sandbox roda a 60 FPS na alta; a qualidade baixa usa menos da metade das chamadas de desenho da alta; capturas antes/depois no docs/arte/guia.md.
Testes: um teste unitário do loader (cache e erro de rede tratado) e um teste de navegador abrindo ?arte sem erros no console.
```

---

## Prompt 20: a oficina nível Steam

**Objetivo:** a oficina é onde o jogador passa 80% do tempo e precisa dar vontade de ficar lá.

``` text
Reconstrua a oficina (src/world/Workshop.ts e módulos novos em src/world/workshop/) usando o guia e o pipeline do Prompt 19.
Mantenha os contratos: posições e ids interativos (EQUIPMENT_IDS), colisores coerentes, pontos AIM dos testes, PlaceholderCar.

Requisitos:
- Kit modular de paredes, piso, teto e portão, com detalhe de verdade:
  - canaletas e ralos no piso, manchas de óleo sob o elevador, marcas de pneu e pintura de faixa gasta;
  - azulejo meia-parede, tomadas, quadro de luz, cartazes fictícios, calendário, rádio na bancada, ventilador de teto girando (parado com "reduzir movimento").
- Equipamentos com aparência de equipamento real (sem marcas reais):
  - elevador de 2 colunas com braços e calços, compressor com mangueira;
  - bancada com morsa e painel de ferramentas;
  - carrinho de ferramentas com gavetas, estante de peças com caixas etiquetadas;
  - computador de tubo com tela que mostra o sistema.
- Interatividade legível:
  - contorno suave ou brilho no que está na mira;
  - estados visuais claros (elevador subindo, capô aberto, luz acesa);
  - o destaque do tutorial continua funcionando.
- Iluminação:
  - lâmpadas tubulares com luz que muda de verdade ao apagar;
  - luz do dia entrando pelo portão e pelas janelas, mudando com o relógio do jogo (preset do Prompt 19);
  - sombras de contato sob objetos.
- Detalhe que conta história: a oficina começa empoeirada (o tio morreu) e fica mais limpa e organizada conforme o jogador compra upgrades e conclui OS. Use a reputação e os upgrades existentes, sem regra nova.
- Partículas leves: poeira no feixe de luz, vapor do radiador quente, faísca ao soltar parafuso (desligáveis na qualidade baixa).

Desempenho: ≤ 250 chamadas de desenho e ≤ 300 mil triângulos na alta. Use instancing e merge de estáticos (já existe src/utils/mergeStatic.ts e o gancho sceneStats()).
Testes: toda a suíte passando (os AIM continuam acertando os mesmos objetos); abaixe o teto de chamadas da oficina em tests/e2e/desempenho.spec.ts para 300.
Entregue capturas antes/depois de 4 ângulos fixos (a partir do ponto de nascimento, do portão, da bancada e de baixo do carro no elevador).
```

---

## Prompt 21: bairro vivo de São Cristóvão

**Objetivo:** o bairro hoje é simples demais. Ele precisa ter cara de Rio, ter vida e ser um prazer de andar.

``` text
Reconstrua o bairro (src/world/CityNeighborhood.ts, src/world/city/ novo) com o guia do Prompt 19. O comportamento continua no CityController e em src/city/ (regras); a cena só mostra.

Requisitos:
- Ambientação de São Cristóvão (fictícia, sem lojas reais):
  - sobrados coloridos com varandas e grades, comércio de rua com toldos;
  - calçada de pedra portuguesa, orelhão, banca de jornal, poste com fiação embolada, amendoeiras, morros ao fundo;
  - um marco reconhecível do bairro (feira, campo de pelada ou viaduto), todo fictício.
- Os 5 locais com fachada própria e reconhecível de longe: oficina, autopeças, ferro-velho, banco e lanchonete da Tia Léa.
  - Placas legíveis.
  - Interior simples, visível pela porta, em todos os locais.
- Vida controlada (GDD: trânsito e pedestres mínimos), determinística pela semente:
  - carros passando com faróis à noite;
  - pedestres com animação simples;
  - cachorro de rua, pombos;
  - vendedor ambulante.
  - Tudo com instancing e LOD; nada disso pode travar o jogador.
- Céu e hora do dia ligados ao relógio do jogo:
  - manhã, tarde, fim de tarde dourado e noite com postes acesos;
  - chuva opcional por evento (sem regra nova de jogo; só visual e som).
- Navegação clara:
  - minimapa redesenhado (alinha com o Prompt 24);
  - placas de rua e caminho iluminado até o objetivo atual.
- Streaming por trecho (carregar e descarregar o que está longe), com tela de carregamento honesta na primeira entrada.

Desempenho: ≤ 200 chamadas por trecho visível; memória ≤ 150 MB; tempo da oficina até a rua ≤ 3 s na primeira vez e instantâneo depois.
Testes: tests/e2e/city.spec.ts continua passando; novo teste percorre os 5 locais e volta; o orçamento do bairro entra no desempenho.spec.ts.
Entregue capturas de 5 pontos fixos, de manhã e à noite.
```

---

## Prompt 22: carros e personagens com vida

**Objetivo:** o carro é o "paciente" e precisa ser bonito e expressivo. As pessoas precisam ter rosto e presença.

``` text
Parte A — carros (src/vehicles/PlaceholderCar.ts → src/vehicles/models/):
- Um modelo de qualidade para cada uma das 6 categorias (popular, hatch, sedã, SUV, picape, van), com variações por modelo de src/data/vehicles.ts (grade, faróis, rodas).
  - Fictícios, sem semelhança com marcas reais.
- Interior visível (bancos, painel, volante) e cofre do motor legível para as peças que o jogo usa (velas, correia, filtro, óleo, radiador, bateria, alternador).
  - Cada peça destacável pelo slot, para o diagnóstico e o reparo.
- Desgaste VISUAL ligado ao estado real do carro (VehicleState), sem revelar números:
  - sujeira e ferrugem pela idade e pela quilometragem;
  - amassado e risco quando houver histórico de colisão;
  - pneu careca visível quando gasto;
  - peça trocada aparece nova e limpa.
  - Isso NÃO pode vazar segredo: o desgaste de peças internas não aparece por fora (princípio do AGENTS.md).
- Animações:
  - capô com amortecedor;
  - rodas girando no test drive;
  - carroceria balançando com o amortecedor gasto;
  - fumaça do escapamento com motor falhando.
- Mantenha a API do PlaceholderCar (group, hoodPivot, engineBay, hoodClosedAngle, setLook) ou atualize os testes junto.

Parte B — personagens (src/characters/ novo):
- Seu Zé, o protagonista (corpo genérico e personalizável no Prompt 23), 3 tipos de cliente (motorista de aplicativo, aposentado econômico, senhora exigente) e o gerente do banco.
- Estilo da direção híbrida: proporções levemente estilizadas, roupas e acessórios que contam quem é a pessoa (macacão do Seu Zé, crachá do gerente).
- Animações:
  - parado, falando (boca simples e gestos), andando, apontando;
  - no rig, ou por animação procedural simples se não houver rig.
- Seu Zé aparece na oficina: perto da bancada, comenta o que o jogador está fazendo (usa os diálogos existentes) e aponta o objeto do tutorial.
- O cliente aparece no balcão quando a OS chega e na entrega do carro (some ao sair).

Desempenho: ≤ 30 mil triângulos por carro na alta (LOD nas outras) e ≤ 15 mil por personagem.
Testes: os testes de inspeção, diagnóstico e test drive continuam passando; um teste novo confere que o desgaste visual não muda com peças internas (o segredo continua secreto).
```

---

## Prompt 23: abertura cinematográfica e história curta

**Objetivo:** antes de jogar, a pessoa entende quem é, por que está ali e se importa com a oficina. Em no máximo 2 minutos, pulável.

``` text
Crie um sistema de cenas (cutscenes) orientado por dados e a abertura do jogo.

Sistema (Claude, src/cinematics/):
- Cena = lista de "tomadas" em dados (src/data/cinematics.ts):
  - câmera (posição, alvo, lente, trilho com curva), duração;
  - personagens e animação;
  - fala (personagem, texto, voz opcional), som, música;
  - transição (corte, fade, letreiro).
- Validado na inicialização com erros úteis.
- Controles:
  - Espaço/Enter avança a fala;
  - segurar Esc por 1 s pula a cena inteira (com indicador visual);
  - pausa ao trocar de aba.
- Legendas sempre ligadas na abertura, com tamanho do Prompt 24; faixas de cinema (letterbox) opcionais; "reduzir movimento" troca movimentos de câmera por cortes.
- Ao terminar ou pular, o jogo cai exatamente onde o tutorial começa, sem repetir as falas que a cena já mostrou.
- O save registra que a abertura foi vista (com migração de versão).

História da abertura (texto em src/data/cinematics.ts; Gemini faz cenário e personagens):
1. Noite, chuva fina. O protagonista recebe a ligação: o tio Tonhão morreu.
2. Manhã seguinte, Rua das Oficinas, São Cristóvão. Portão de aço meio enferrujado, a placa da oficina apagada.
3. Seu Zé espera na calçada com as chaves. Ele conta, em 3 ou 4 falas curtas, quem era o Tonhão, que a oficina perdeu os clientes e que existe uma dívida no banco.
4. O portão sobe. Poeira no feixe de luz, ferramentas cobertas e a foto do Tonhão com o Seu Zé na parede.
5. Escolha simples e com consequência registrada: "Vou reabrir a oficina" ou "Só vou ver se dá pra salvar". Ela muda uma fala do Seu Zé e o tom da primeira missão, não as regras.
6. Buzina: o Marcão chega com o carro chiando. Seu Zé: "Teu primeiro cliente. Bora?" → começa o tutorial do Prompt 10.

Personalização curta (antes da cena, ≤ 30 s):
- nome do protagonista (usado nas falas);
- 3 a 4 opções de aparência e de pronome de tratamento (ele/ela/neutro, para as falas do Seu Zé).
- Fica salvo.

Fora do escopo: dublagem profissional (deixe a voz como opção para depois; se houver chave da skill threejs-audio-generator, gere uma voz de rascunho marcada como PLACEHOLDER_).
Testes:
- unitários do sistema de cenas (ordem, pular, retomar);
- navegador: o jogo novo mostra a abertura; pular cai no tutorial; carregar um save não mostra a abertura de novo.
```

---

## Prompt 24: UI e UX de produto

**Objetivo:** a interface precisa parecer de um jogo lançado, ser fácil de entender sem tutorial escrito e confortável por horas.

``` text
Use a skill threejs-game-ui-designer.

1. Sistema de design (src/ui/design/):
   - tipografia: 1 fonte de títulos com personalidade e 1 de texto muito legível, auto-hospedadas (licença OFL registrada);
   - escala de espaçamentos, cores do guia (Prompt 19), ícones próprios em SVG (ferramentas, peças, dinheiro, relógio, reputação, alertas);
   - componentes: botão, aba, cartão, lista, barra, tooltip, aviso, diálogo, legenda.
   - Todos os painéis atuais (computador, ficha do carro, estoque, menus, bairro) migram para esses componentes.
2. Menu principal com arte-chave (a oficina ao entardecer, com o Seu Zé no portão), música e tela de carregamento com dica do Seu Zé e progresso real.
3. HUD redesenhado (GDD §20.3):
   - mínimo e diegético quando possível (o relógio pode ser o relógio de parede);
   - objetivo com ícone; notificações empilhadas que não cobrem a mira;
   - roda radial de ferramentas (GDD §20.3);
   - inventário em grade para as peças em mãos e na estante.
4. Fluxos com menos cliques:
   - ficha do carro com abas visuais;
   - o diagnóstico mostra as hipóteses como barras com "confiança" (sem número de desgaste);
   - orçamento com prévia ao vivo e explicação de por que o cliente reagiu;
   - compra com "comprar o que falta para esta OS" em 1 clique.
5. Configurações completas (GDD §20.4):
   - resolução e escala de interface, limite de FPS;
   - volumes separados (geral, efeitos, música, vozes, ambiente);
   - REMAPEAMENTO DE TECLAS;
   - velocidade do tempo;
   - legendas e tamanho de texto;
   - modo daltônico (protanopia, deuteranopia, tritanopia);
   - redução de tremor;
   - textos preparados para o inglês (src/data/strings/), mesmo que só o pt-BR esteja traduzido agora.
6. Feedback e "juice" da interface: microanimações (≤ 200 ms) desligáveis, sons de UI (Prompt 25) e estados de foco visíveis para o teclado.

Critérios:
- contraste AA em todo texto; tudo operável por teclado; nada cortado de 1280×720 a 2560×1440 e a 800×600;
- nenhuma informação só por cor.
Testes:
- os testes atuais adaptados aos novos seletores (data-testid continuam);
- teste de remapeamento (salvo e aplicado);
- teste de contraste automatizado (axe-core) nas telas principais.
```

---

## Prompt 25: som, música e sensação de jogo

**Objetivo:** cada ação precisa soar e "ser sentida" bem. É isso que faz alguém jogar por horas.

``` text
Áudio (Gemini, src/audio/; skill threejs-audio-generator se houver chave, senão síntese Web Audio + CC0 registrado em docs/licencas.md):
- Ambiente em camadas que muda com a hora e o lugar:
  - oficina: rádio baixinho, ventilador, rua lá fora;
  - rua: trânsito, feira, pássaros, chuva.
  - Som 3D posicionado.
- Foley de todas as ações: catraca, chave de impacto, elevador hidráulico, capô, gaveta, peça na bancada, porta do carro, buzina, partida que falha versus partida boa.
  - O motor muda de som pelo estado real (vela falhando, correia chiando).
- Trilha original: tema principal (menu e abertura), música calma de trabalho, tensão leve em eventos e vitória curta ao entregar o carro.
  - Transições suaves e música adaptativa por estado.
- Mixagem com barramentos (música, efeitos, voz, ambiente, UI), ducking da música nas falas e volume das configurações.

Sensação de jogo (Claude, sem mudar regras):
- Câmera em primeira pessoa com leve balanço ao andar, inércia ao virar e "mira magnética" suave em interativos. Tudo desligável e respeitando "reduzir movimento".
- Ações com começo, meio e fim: ao remover uma peça, mãos e ferramenta animadas (ou ícone animado na mira), barra de progresso na mira e som em sincronia. O tempo de jogo gasto continua o mesmo das regras.
- Recompensas claras:
  - entrega do carro com moedas e estrelas animadas e o cliente agradecendo;
  - reputação subindo com som;
  - missão concluída com um carimbo visual.
- Falhas claras e gentis: tremida curta, som de "não dá" e a explicação (já existe nas mensagens).

Critérios:
- sem estouro de volume (limitador no barramento principal);
- nenhum som repetido de forma irritante (variações aleatórias com semente);
- cada som novo registrado na lista de assets.
Testes:
- os existentes passando;
- teste de áudio sem erros com AudioContext suspenso (navegador sem interação);
- teste de que "reduzir movimento" desliga o balanço.
```

---

## Prompt 26: multiplayer — os irmãos e a oficina compartilhada

**Objetivo:** dar ao cooperativo uma história própria e uma experiência pensada para 2 a 3 pessoas jogando juntas.

> **Só começa depois que o Prompt 17 estiver aprovado e concluído** (servidor, salas, sincronização e bloqueios). Este prompt é a camada de **história e experiência** por cima do multiplayer, não a parte técnica de rede.

``` text
História do modo cooperativo (2 ou 3 jogadores):
- No co-op, a oficina do tio Tonhão fica para os IRMÃOS (2 ou 3, um por jogador), não para um sobrinho só.
- O Seu Zé, que tocou a oficina com o Tonhão a vida toda, entrega as chaves aos irmãos e fica como mentor de todos.
- Abertura própria, usando o sistema do Prompt 23 com uma variação:
  - os irmãos chegam separados (cada jogador vê a chegada do seu personagem) e se encontram no portão;
  - o Seu Zé fala com o grupo, e as falas se adaptam a 2 ou 3 irmãos (nomes e pronomes de cada um);
  - uma escolha em grupo (votação simples) com consequência registrada.
- Cada irmão tem um apelido e uma "fama" de família, só narrativa e cosmética:
  - o caçula esquentado, a mais velha das contas, o do meio que vive na rua.
  - Sem bônus de regra no começo; se houver, ele vem do Prompt 11 (upgrades), nunca de vantagem injusta.
- Falas do Seu Zé e dos clientes que reconhecem o grupo ("os sobrinhos do Tonhão", "Ô, família!") e brincadeiras leves entre irmãos nos eventos.

Experiência cooperativa:
- Seleção do personagem na sala:
  - aparência do Prompt 23;
  - cor de macacão por irmão, para se reconhecer de longe;
  - nome em cima da cabeça.
- Divisão de trabalho natural:
  - um diagnostica enquanto o outro compra a peça;
  - indicadores de "fulano está no elevador" (usando os bloqueios do 17);
  - ping no mundo ("olha aqui") com tecla e roda de comunicação rápida ("traz a peça", "sobe o elevador", "deixa comigo").
- Caixa e reputação da oficina são compartilhados, com histórico de "quem fez o quê" (crédito pelo serviço) e uma tela de fim de dia com o resumo do grupo.
- Entrada e saída no meio da partida, sem quebrar a história: quem entra depois vê um resumo curto do Seu Zé.

Fora do escopo: chat de voz, matchmaking público, mais de 3 jogadores na história (o 17 libera 4 só tecnicamente).
Testes:
- falas e cenas com 2 e 3 irmãos (dados validados para os dois casos);
- votação com empate e com desconexão no meio;
- um irmão entrando no meio do dia;
- o modo solo continua com a história do sobrinho, sem mudança.
```

---

## Depois dos 8 prompts (para quando o jogo for para a Steam)

Fora deste roteiro, anotado para não esquecer:
- **Versão desktop:** empacotar com Tauri ou Electron, para a Steam.
- **Steamworks:** conquistas e saves na nuvem.
- **Material de loja:** página da Steam com cápsulas e trailer.
- **Feedback:** teste com jogadores reais, por exemplo um playtest fechado com o recurso de playtest da própria Steam.
