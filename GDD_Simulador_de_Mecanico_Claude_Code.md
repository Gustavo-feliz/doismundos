# GDD --- Simulador de Mecânico

## Documento de Design do Jogo e Plano de Implementação para Claude Code

**Versão:** 1.0\
**Status:** Documento-base para pré-produção\
**Plataforma-alvo inicial:** navegador para PC\
**Tecnologia proposta:** Three.js, Vite, TypeScript; servidor ASP.NET
Core + SignalR em fase posterior\
**Idioma inicial:** português brasileiro\
**Direção:** simulador automotivo com gestão, progressão, humor
brasileiro e ambientação inspirada em bairros do Rio de Janeiro.

> **Regra de produção:** este GDD descreve a visão completa do jogo, não
> a lista de funcionalidades do primeiro protótipo. Implemente somente o
> escopo definido para cada etapa. Não simule funcionalidades futuras
> como se estivessem prontas.

------------------------------------------------------------------------

# 1. Visão do produto

## 1.1 High concept

O jogador herda uma oficina decadente e endividada de seu tio. Começa
realizando serviços básicos, aprende a diagnosticar e reparar veículos,
conquista a confiança dos moradores, administra caixa e fornecedores e
expande a operação até construir um império automotivo.

A experiência combina: - Simulação de mecânica com decisões e minijogos
acessíveis. - Gestão de oficina, orçamento, estoque, funcionários e
reputação. - Compra, restauração, personalização e revenda de
veículos. - Narrativa com personagens recorrentes, escolhas e
consequências. - Uma cidade fictícia inspirada no Rio de Janeiro. -
Cooperativo online para 2 a 4 jogadores, planejado para uma fase
posterior.

## 1.2 Fantasia do jogador

"Transformar uma oficina quebrada em referência automotiva, entendendo o
que está acontecendo com cada carro e tomando decisões que fazem o
negócio crescer."

## 1.3 Pilares de design

1.  **Diagnóstico antes da troca:** sintomas não revelam automaticamente
    a peça defeituosa.
2.  **Decisões com consequência:** preço, prazo, qualidade, ética e
    risco afetam lucro e reputação.
3.  **Progressão visível:** novas ferramentas, vagas, instalações,
    clientes e bairros.
4.  **Brasil reconhecível, sem caricatura:** linguagem natural, humor
    situacional e personagens memoráveis.
5.  **Interação satisfatória:** encaixe de peças, sons de ferramentas,
    feedback de reparo e pagamentos.
6.  **Sistemas compreensíveis:** a complexidade deve surgir
    gradualmente, com tutoriais contextuais.
7.  **Escopo testável:** cada etapa precisa resultar em uma build
    jogável e verificável.

## 1.4 Público e experiência

-   Público principal: pessoas que gostam de carros, simuladores,
    restauração e jogos de gestão.
-   Sessões: 15--60 minutos, com possibilidade de campanhas longas.
-   Experiência-alvo: começar simples e aumentar a profundidade sem
    exigir conhecimento mecânico prévio.
-   Acessibilidade: controles remapeáveis, legendas, opções de
    assistência e dificuldade ajustável.

## 1.5 Plataformas

**Prioridade 1:** navegador desktop com teclado e mouse.\
**Prioridade 2:** controle, otimização para telas menores e
empacotamento para PC.\
**Prioridade 3:** cooperativo online e persistência em servidor.

Não prometer desempenho mobile antes de medir a performance real.

## 1.6 Tom e identidade

-   Realista estilizado, com humor brasileiro moderado.
-   Bairro fictício inspirado no Rio; evitar depender de marcas, placas,
    músicas ou propriedades intelectuais sem licença.
-   Nomes de fabricantes e modelos de carros devem ser fictícios ou
    licenciados.
-   Direção visual a decidir no protótipo: low-poly estilizado ou
    semi-realista otimizado.

------------------------------------------------------------------------

# 2. Escopo e prioridades

## 2.1 Classificação

-   **P0 --- obrigatório para provar o jogo:** precisa funcionar no
    protótipo.
-   **P1 --- necessário para a primeira versão de carreira:** amplia o
    ciclo central.
-   **P2 --- expansão:** acrescenta profundidade após a base estar
    estável.
-   **P3 --- visão futura:** alto custo ou dependência técnica
    significativa.

## 2.2 Matriz de escopo

  -----------------------------------------------------------------------
  Sistema                 Prioridade              Observação
  ----------------------- ----------------------- -----------------------
  Movimento em primeira   P0                      Núcleo de exploração e
  pessoa e interação por                          interação
  raycast                                         

  Uma oficina compacta e  P0                      Cena controlada e leve
  um carro                                        

  15 peças iniciais com   P0                      Dados, não lógica
  estados                                         duplicada

  Cliente → diagnóstico → P0                      Loop principal completo
  orçamento → reparo →                            
  pagamento                                       

  Ferramentas básicas e   P0                      Feedback claro e
  minijogo simples                                tolerante

  Economia básica e save  P0                      Sem multiplayer ainda
  local versionado                                

  Loja de peças e         P1                      Estoque e prazo de
  compatibilidade                                 entrega

  Reputação, perfis de    P1                      Expande decisões
  clientes e garantia                             

  História do Ato 1 e Seu P1                      Missões e diálogos
  Zé                                              

  Mais veículos,          P1                      Conteúdo orientado por
  ferramentas e serviços                          dados

  Funcionários e gestão   P2                      IA e filas de tarefas
  da oficina                                      

  Cidade explorável e     P2                      Construir somente após
  trânsito                                        validar o loop

  Tuning, dinamômetro e   P2                      Física e balanceamento
  corridas                                        próprios

  Outros negócios e       P2/P3                   Economia de portfólio
  filiais                                         

  Milícia e arco          P2                      Representação
  narrativo completo                              ficcional,
                                                  consequências
                                                  sistêmicas

  Multiplayer 2--4        P3                      Servidor autoritativo e
  jogadores                                       testes de rede

  Login, nuvem, SQL e     P3                      Não antecipar antes da
  hospedagem                                      prova de diversão

  Electron/Tauri          P3                      Empacotamento opcional
  -----------------------------------------------------------------------

## 2.3 O que não fazer no início

-   Não criar a cidade inteira antes de validar a oficina.
-   Não modelar centenas de peças individualmente antes de provar o
    sistema de montagem.
-   Não implementar multiplayer junto com o primeiro protótipo.
-   Não criar um sistema de economia impossível de testar manualmente.
-   Não substituir testes por "parece funcionar".
-   Não fazer refatorações gigantes junto de novas funcionalidades.
-   Não usar assets sem licença clara nem depender de serviços pagos sem
    aprovação.

------------------------------------------------------------------------

# 3. Loop de jogo

## 3.1 Loop principal

1.  Um cliente chega e descreve um sintoma.
2.  O jogador inspeciona o carro e escolhe testes.
3.  O diagnóstico gera hipóteses e um grau de confiança.
4.  O jogador prepara um orçamento com peças, mão de obra, prazo e
    garantia.
5.  O cliente aceita, negocia ou recusa.
6.  O jogador compra/retira peças e executa o serviço.
7.  O sistema valida a qualidade do reparo.
8.  O cliente paga e avalia a experiência.
9.  O jogador paga despesas, compra ferramentas e melhora a oficina.
10. Novos clientes, serviços e oportunidades são desbloqueados.

## 3.2 Loop secundário

Encontrar veículo usado ou sucata → inspecionar histórico e defeitos →
comprar → restaurar → decidir entre vender, colecionar ou usar →
reinvestir o lucro.

## 3.3 Condições de sucesso

O jogador deve entender: - Qual é o problema apresentado. - Quais ações
de diagnóstico estão disponíveis. - Por que uma peça foi ou não
identificada como defeituosa. - Como o orçamento foi calculado. - O que
falta para concluir o serviço. - Como a qualidade e o comportamento
afetam o resultado financeiro.

------------------------------------------------------------------------

# 4. Modos de jogo

-   **Carreira:** história, dívida, progressão e desbloqueios.
-   **Sandbox:** dinheiro amplo/infinito e liberdade para experimentar.
-   **Desafio:** cenários com objetivos e restrições, como salvar uma
    oficina em 30 dias.
-   **Hardcore:** save único e falência com consequência definitiva,
    opcional.
-   **Restauração livre:** foco em carros e customização.

**Plano:** começar apenas com Carreira simplificada. Outros modos
dependem de a arquitetura suportar configurações de regras sem duplicar
sistemas.

------------------------------------------------------------------------

# 5. Personagem e progressão

## 5.1 Necessidades

-   Energia: reduz produtividade quando muito baixa.
-   Fome: opcional no modo realista.
-   Sujeira: pode afetar clientes exigentes, sem virar punição
    constante.

Esses sistemas devem ser configuráveis e não podem impedir o jogador de
concluir o tutorial.

## 5.2 Árvores de habilidade

Cada árvore tem 5--10 níveis; os valores exatos serão balanceados depois
de existir telemetria de jogo.

  -----------------------------------------------------------------------
  Árvore                              Efeito pretendido
  ----------------------------------- -----------------------------------
  Mecânica                            Desmontagem mais rápida e menor
                                      risco de danificar parafusos

  Elétrica                            Desbloqueia diagnóstico de módulos
                                      e chicotes

  Diagnóstico                         Revela indícios adicionais e reduz
                                      custo/tempo de testes

  Funilaria/Pintura                   Melhora acabamento e reparos
                                      estéticos

  Tuning                              Libera preparação e calibração

  Negociação                          Melhora margem e condições com
                                      fornecedores/clientes

  Gestão                              Melhora produtividade e reduz
                                      despesas

  Direção                             Facilita test drives e eventos de
                                      pista
  -----------------------------------------------------------------------

## 5.3 Celular

Planejado para mensagens, banco, GPS, câmera/foto, app de peças,
contatos e rede social fictícia. No protótipo, pode ser substituído por
um painel simples se a interface completa atrasar o loop principal.

------------------------------------------------------------------------

# 6. História, atos e personagens

## 6.1 Prólogo

O tio do protagonista morre e deixa a oficina com uma dívida bancária. O
jogador precisa manter o negócio aberto e descobrir por que a oficina
perdeu clientes.

## 6.2 Atos

1.  **Sobreviver:** pagar despesas e concluir o primeiro mês.
2.  **Ganhar o bairro:** superar um concorrente que cobra barato e
    entrega serviços ruins.
3.  **Pressão local:** lidar com intimidação criminosa e fiscalização,
    por meio de escolhas e consequências ficcionais.
4.  **Expandir:** investir em outros negócios.
5.  **Império automotivo:** virar referência em vários bairros.

## 6.3 NPCs

-   **Seu Zé:** mecânico experiente e mentor/tutorial vivo.
-   **Dono da loja de peças:** oferece crédito com juros e prazos
    variáveis.
-   **Concorrente:** preços baixos, qualidade inconsistente e
    rivalidade.
-   **Chefe da milícia:** antagonista ficcional que cria pressão
    econômica e narrativa.
-   **Gerente do banco:** oferece empréstimos e cobra a dívida.
-   **Colecionador rico:** missões de carros raros.
-   **Piloto de corrida:** tuning e desafios de pista.
-   **Fiscal da prefeitura:** licenças, segurança e descarte.

Diálogos devem ter opções claras, consequências registradas e falas
curtas. Cutscenes usam câmera e legendas; não exigir captura de
movimento.

------------------------------------------------------------------------

# 7. Mundo e mapa

## 7.1 Abordagem por fases

**Protótipo:** uma oficina compacta e um pequeno exterior.\
**Carreira inicial:** bairro com oficina, loja de peças, ferro-velho,
banco e lanchonete.\
**Expansão:** prefeitura, leilão, pista, casa, negócios e bairros
adicionais.

## 7.2 Cidade

-   Trânsito simples e pedestres somente quando necessários à missão.
-   Mapa de celular com marcadores.
-   Locais comerciais e pessoais desbloqueados por progresso.
-   Clima: sol, chuva, tempestade e enchente em fases posteriores.
-   Eventos: falta de luz, greve logística, alta de combustível,
    fiscalização, promoção de peças, funcionário doente e veículo raro.

## 7.3 Critério de performance

Carregar áreas sob demanda; limitar NPCs ativos; usar LOD, instancing e
modelos GLB comprimidos quando apropriado. Medir FPS e consumo antes de
expandir o mapa.

------------------------------------------------------------------------

# 8. Oficina

## 8.1 Áreas

-   Recepção e sala de espera.
-   Boxes de serviço (expansão de 1 a 8 vagas).
-   Estoque e escritório.
-   Cabine de pintura, funilaria, alinhamento, lava-jato e dinamômetro.
-   Pátio, depósito de sucata, banheiro e vestiário.

## 8.2 Upgrades

-   Terreno e vagas extras.
-   Iluminação.
-   Piso e segurança ocupacional.
-   Câmeras, alarme, portão e gerador.
-   Decoração, letreiro, logo, pôsteres e troféus.
-   Limpeza de óleo e lixo acumulados.

Upgrades devem apresentar custo, efeito, tempo de instalação e requisito
de desbloqueio.

------------------------------------------------------------------------

# 9. Sistema de veículos

## 9.1 Categorias

Popular, hatch, sedan, SUV, picape, van, esportivo, luxo,
superesportivo, clássico, elétrico/híbrido, moto e caminhão leve.
Introduzir poucas categorias inicialmente.

## 9.2 Dados por veículo

-   ID estável, nome fictício, categoria e ano.
-   Quilometragem, cor, valor-base e multiplicador.
-   Estado de cada peça e sintomas relacionados.
-   Histórico: colisão, enchente, leilão, manutenção ruim ou motor
    danificado.
-   Compatibilidades de peça por modelo/ano.
-   Desgaste visual: sujeira, ferrugem, amassados, riscos, vidro
    trincado e pneus gastos.

## 9.3 Geração procedural

Usar sementes e intervalos controlados para produzir variações
reproduzíveis. Evitar aleatoriedade que torne missões impossíveis.
Defeitos ocultos só devem ser revelados por ações apropriadas ou pistas
narrativas.

## 9.4 Envelhecimento

A passagem de anos pode gerar novos modelos e alterar
disponibilidade/preço, mas deve ser ativada apenas depois que a economia
básica estiver estável.

------------------------------------------------------------------------

# 10. Peças, fornecedores e estoque

## 10.1 Catálogo por sistema

-   **Motor:** bloco, cabeçote, junta, pistões, anéis, bielas,
    virabrequim, comando, tuchos, correia/corrente, tensor, bombas,
    cárter, coletores, bicos, bobinas, velas, cabos, TBI e sensores.
-   **Arrefecimento:** radiador, ventoinha, válvula termostática,
    mangueiras e reservatório.
-   **Combustível:** bomba, filtro, tanque e linhas.
-   **Transmissão:** embreagem, câmbio, diferencial, semieixos e
    homocinéticas.
-   **Freios:** pastilhas, discos, lonas, tambores, pinças, flexíveis,
    cilindro mestre e ABS.
-   **Suspensão/direção:** amortecedores, molas, bandejas, pivôs,
    terminais, buchas, barra estabilizadora e caixa de direção.
-   **Elétrica:** bateria, alternador, motor de arranque, módulos,
    chicote, fusíveis, relés, faróis, lanternas, vidros e travas.
-   **Escape:** catalisador, intermediário e silencioso.
-   **Rodas:** pneus, rodas e rolamentos.
-   **Carroceria:** portas, capô, para-lamas, para-choques, retrovisores
    e vidros.
-   **Interior:** bancos, volante, painel, forros, ar-condicionado e
    som.
-   **Fluidos:** óleo do motor/câmbio, fluido de freio, líquido de
    arrefecimento e fluido de direção.

## 10.2 Propriedades da peça

Cada peça deve possuir ID, sistema, compatibilidade, custo, valor de
sucata, tempo de instalação, desgaste, qualidade, condição, fornecedor e
prazo.

Qualidade: genérica, original ou performance.\
Condição: nova, usada ou recondicionada.

Peças falsificadas podem ser uma escolha de risco ficcional, com
probabilidade e consequência previsíveis; nunca devem ser a única
solução de missão.

## 10.3 Fornecedores

Variam em preço, qualidade, prazo e confiabilidade. Pedidos podem
atrasar ou chegar errados, mas o jogador precisa ter meios de
acompanhar, contestar e substituir o pedido.

------------------------------------------------------------------------

# 11. Diagnóstico

## 11.1 Entrada

O cliente descreve sintomas: ruído ao frear, fumaça azul, dificuldade
para dar partida, superaquecimento ou perda de potência.

## 11.2 Ferramentas

-   Test drive com áudio espacial.
-   Scanner OBD com códigos e dados ao vivo.
-   Inspeção visual com lanterna.
-   Compressômetro, multímetro, teste de pressão de combustível e teste
    de bateria.
-   Medição de discos e pastilhas.
-   Observação da cor da fumaça.
-   Estetoscópio mecânico e minijogos de folga/vazamento.

## 11.3 Regras

-   Sintoma não equivale a diagnóstico.
-   Cada teste tem custo de tempo e/ou dinheiro.
-   Evidências alteram a lista de hipóteses.
-   Habilidade pode revelar indícios, não deve resolver tudo
    automaticamente no nível inicial.
-   Diagnóstico errado pode gerar retrabalho, perda de peça e
    reclamação.
-   O tutorial deve ensinar o raciocínio sem exigir conhecimento real de
    mecânica.

------------------------------------------------------------------------

# 12. Reparo e ferramentas

## 12.1 Reparos

-   Desmontagem em ordem definida.
-   Modo de parafusos individual (realista) ou em grupo (casual).
-   Torque correto; aperto incorreto pode reduzir qualidade ou gerar
    retorno.
-   Parafusos enferrujados podem exigir desengripante e aumentar risco
    de espanamento.
-   Peças pesadas exigem equipamento de elevação.
-   Drenagem e reposição de fluidos.
-   Bancada para retífica de disco, alternador e montagem de motor em
    fases futuras.

## 12.2 Ferramentas

-   Manuais: chaves, catraca, torquímetro, alicates e martelo.
-   Pneumáticas: chave de impacto e compressor.
-   Elevação: macaco, cavaletes, elevadores e guincho de motor.
-   Diagnóstico: scanner, multímetro, compressômetro, estetoscópio e
    câmera.
-   Pneus: desmontadora, balanceadora e alinhador.
-   Funilaria: martelinho, solda, lixadeira e massa.
-   Pintura: pistola, cabine, estufa e polidora.
-   Performance: dinamômetro e notebook de remap.
-   Extras: lavadora, aspirador, recicladora de gás, EPIs e ferramentas
    para alta tensão.

Ferramentas têm níveis 1--3, desgaste e possibilidade de aluguel. A
segurança de veículos elétricos deve ser representada com procedimentos
e equipamentos próprios, sem ensinar práticas perigosas reais passo a
passo.

------------------------------------------------------------------------

# 13. Serviços e tuning

## 13.1 Serviços

-   Revisão, óleo, freios, suspensão, embreagem, motor e câmbio.
-   Injeção, bateria e iluminação.
-   Alinhamento, balanceamento e pneus.
-   Funilaria, pintura, polimento e vitrificação.
-   Ar-condicionado, GNV, som e multimídia.
-   Para-brisa e inspeção de usados.
-   Veículos elétricos/híbridos, motos e caminhões leves.
-   Serviço de leva e traz.

## 13.2 Tuning

-   Turbo, intercooler, comando, pistões forjados, injeção programável e
    remap.
-   Escape esportivo com mudança de som.
-   Suspensão de rua ou off-road.
-   Freios, relações de câmbio, pneus e redução de peso.
-   Dinamômetro com gráficos de potência e torque.
-   Preparação inadequada aumenta risco de falha.

Implementar tuning depois que os atributos do veículo e o modelo de
reparo estiverem definidos.

## 13.3 Estética

Pintura sólida/metálica/perolada/fosca, envelopamento, adesivos, faixas,
rodas, película, faróis e interior. O editor deve ter limites claros e
salvar configurações no veículo.

------------------------------------------------------------------------

# 14. Clientes, orçamento e ética

## 14.1 Perfil do cliente

Orçamento máximo, paciência, exigência, honestidade, fidelidade,
urgência e tolerância a peças alternativas.

Tipos: econômico, rico, apressado, inadimplente, fiel, motorista de
aplicativo, frota empresarial, colecionador, piloto, idoso desconfiado e
influencer.

## 14.2 Fórmula de orçamento

Base recomendada para o protótipo:

**Total = peças + (horas estimadas × valor/hora) + taxas − descontos**

Depois, aplicar multiplicadores de categoria e urgência de forma
explícita, sem cobrar o mesmo multiplicador duas vezes. Exibir ao
jogador o detalhamento do cálculo.

O orçamento registra: - Peças e qualidade escolhidas. - Horas estimadas
e mão de obra. - Prazo prometido. - Garantia. - Sinal antecipado quando
aplicável. - Validade da proposta.

## 14.3 Negociação

Cliente pode aceitar, fazer contraproposta ou sair. Insistência
excessiva reduz a chance de acordo. Habilidade altera limites de
negociação, sem garantir sucesso.

## 14.4 Garantia

Uma falha dentro do prazo gera retorno e custo para a oficina, conforme
a causa e a qualidade do serviço. Não penalizar o jogador por defeitos
não relacionados ao reparo.

## 14.5 Ética

Inventar defeitos pode gerar lucro curto, mas, se descoberto, reduz
reputação e fidelidade. Diagnóstico honesto e comunicação clara aumentam
confiança. O jogo deve tornar consequências legíveis.

## 14.6 Comunicação e pagamento

Fotos de antes/depois, aprovação de serviços extras por mensagem e
pagamentos via dinheiro, Pix fictício ou cartão com taxa. Fiado e
parcelamento trazem risco de inadimplência; serviços caros podem exigir
sinal.

------------------------------------------------------------------------

# 15. Reputação, missões e progressão

## 15.1 Reputação

Nota em estrelas, avaliações textuais e reputação por especialidade:
mecânica, elétrica, pintura e tuning. Reputação alta libera clientes
melhores e contratos; baixa reduz demanda e crédito.

Rede social fictícia: posts, seguidores, viralização e crises. Não
exigir integração com redes reais.

## 15.2 Missões

-   Tutorial com Seu Zé.
-   Missões de história por ato.
-   Tarefas diárias e semanais.
-   Contratos de frotas.
-   Carros raros para colecionadores.
-   Corridas contra IA.
-   Desafios de tempo e precisão.
-   Caça a carros abandonados.
-   Eventos sazonais.

Cada missão deve definir ID, objetivo, pré-requisitos, passos,
recompensa, falha, repetibilidade e gatilhos de conclusão.

## 15.3 Progressão em cinco fases

1.  **Fundo de quintal:** uma vaga e serviços básicos.
2.  **Oficina de bairro:** elevador e até dois funcionários.
3.  **Centro automotivo:** pintura, alinhamento e carros caros.
4.  **Empresário:** primeiro negócio adicional e gerente.
5.  **Império:** várias empresas e filiais.

Desbloqueios combinam história, nível, reputação e dinheiro. Evitar
bloqueios que não expliquem o requisito.

------------------------------------------------------------------------

# 16. Economia, burocracia e risco

## 16.1 Contabilidade

Separar caixa da oficina e dinheiro pessoal. Registrar cada transação
com data do jogo, categoria, valor, origem e entidade relacionada.

Receitas: serviços, veículos, sucata, negócios, contratos e corridas.\
Despesas: aluguel/financiamento, utilidades, salários, impostos,
ferramentas, estoque, seguros, taxas e eventos ficcionais.

## 16.2 Banco

Empréstimos, financiamento, investimentos, extrato e juros. Apresentar
custo total e vencimentos antes de aceitar uma operação.

## 16.3 Falência

No modo hardcore, caixa negativo por um período configurável pode
encerrar a campanha. No modo padrão, oferecer alternativas de
recuperação para não bloquear o progresso sem aviso.

## 16.4 Burocracia

Progressão de MEI ficcional para empresa maior, notas, alvarás,
licenças, descarte de óleo/pneus e fiscalização surpresa. As regras são
abstrações de jogo, não orientação jurídica ou tributária real.

## 16.5 Milícia --- arco ficcional

A visita recorrente cria pressão narrativa e financeira. O valor
solicitado pode considerar lucro, tamanho da oficina, veículos valiosos
e número de negócios.

Opções: pagar, negociar, atrasar ou recusar. Escalada ficcional: ameaça,
queda de confiança dos clientes, vandalismo, danos, roubo e incêndio.
Defesas: câmeras, alarme, portão e segurança.

Desfechos: continuar cedendo, reunir provas e denunciar ou mudar de
bairro. A decisão deve ser clara, não apresentar extorsão como mecânica
obrigatória sem alternativas. A violência não deve ser glamorizada.

------------------------------------------------------------------------

# 17. Funcionários e computador de gestão

## 17.1 Funcionários

Cargos: mecânico júnior/pleno/sênior, eletricista, funileiro, pintor,
borracheiro, lavador, recepcionista, gerente, frentista, segurança e
motorista de guincho.

Ficha: nome fictício, retrato, idade fictícia, habilidades, velocidade,
salário, honestidade, lealdade e traços de personalidade.

Gestão: contratar, treinar, promover, ajustar salário, bonificar,
demitir, programar folgas e turnos. Riscos: roubo ficcional, demissão,
concorrência e acidentes por falta de EPI.

IA inicial deve ser simples: pegar tarefa disponível, mover-se até o
posto, executar progresso e reportar resultado. Não criar navegação
complexa antes de validar o sistema de tarefas.

## 17.2 Computador de gestão

Aplicativos planejados: - Financeiro: gráficos, fluxo de caixa e DRE
simplificada. - Agenda: fila e prazos. - Loja de peças: compra e entrega
expressa. - Estoque: quantidades e reposição. - RH: equipe. - Banco:
empréstimo e extrato. - Leilão e classificados. - Marketing: anúncios e
promoções. - E-mail: contratos e missões. - Negócios: indicadores por
unidade. - Relatórios: serviços lucrativos e clientes fiéis. - Notícias:
eventos da cidade.

Construir primeiro os painéis que apoiam o loop atual; os demais
aparecem quando seus sistemas existirem.

------------------------------------------------------------------------

# 18. Outros negócios, logística e coleção

## 18.1 Negócios possíveis

Lava-jato, borracharia, posto, loja de autopeças, ferro-velho, guincho,
revenda de usados, estacionamento, funilaria, autoescola e equipe de
corrida.

Cada negócio tem níveis 1--5, gerente, funcionários, eventos, custos,
receitas e relatório. A rentabilidade precisa ser calculável e
auditável.

## 18.2 Pátio e logística

Vagas limitadas; carros parados ocupam espaço; estadia pode ser cobrada
quando o cliente não busca o veículo. Motoboy acelera entregas com custo
maior. Leva e traz exige tempo, motorista e risco.

## 18.3 Coleção

Comprar veículos em leilões, ferro-velho, classificados ou locais
abandonados. Restaurar, vender com lucro ou guardar. Showroom aumenta
reputação. Carro pessoal permite explorar a cidade.

------------------------------------------------------------------------

# 19. Vida, direção, clima e eventos

## 19.1 Vida do personagem

Casa evolui de quitinete a residência com garagem. Cursos pagos liberam
habilidades. Lesões podem ocorrer por trabalhar sem EPI, com avisos e
opções preventivas.

## 19.2 Direção

Física considera aderência, peso, suspensão e estado real das peças.
Painel com velocímetro, conta-giros e alertas. Áreas: pista de teste,
rodovia e cidade. Infrações em test drive afetam o cliente e a
reputação.

## 19.3 Clima e eventos

Sol, chuva, tempestade e enchente. Eventos econômicos e operacionais
mudam disponibilidade, custos e demanda. Oficinas concorrentes podem
abrir ou fechar. O jogador precisa receber sinais e ter opções de
resposta.

------------------------------------------------------------------------

# 20. Áudio, arte e interface

## 20.1 Áudio

Sons de ferramentas, motores por tipo e condição, ambiente urbano,
chuva, clientes e rádio com conteúdo original/licenciado. Trilha
dinâmica: calma no trabalho e tensão em eventos narrativos. Nunca usar
músicas comerciais sem licença.

## 20.2 Arte

Decidir no protótipo entre low-poly estilizado e semi-realista.
Iluminação diurna/noturna, sombras e reflexos de acordo com a capacidade
do navegador. Partículas para fumaça, solda e água. Desgaste deve ser
legível sem excesso de polígonos. Modo foto é futuro.

## 20.3 HUD e interação

HUD mínimo: dinheiro, hora, objetivo e ferramenta ativa. Ao mirar em uma
peça: nome, estado conhecido e ação disponível. Roda radial de
ferramentas, inventário em grade e notificações discretas. Suporte a
controle é planejado.

## 20.4 Acessibilidade

Resolução, qualidade, sombras, limite de FPS; volumes separados;
remapeamento de teclas e sensibilidade; velocidade do tempo; assistência
de diagnóstico; legendas, tamanho de texto, modo daltônico, redução de
tremor e português/inglês.

------------------------------------------------------------------------

# 21. Save e arquitetura técnica

## 21.1 Stack proposta

-   Cliente: Three.js + Vite + TypeScript.
-   Física: avaliar Rapier antes de escolher; manter a física isolada da
    lógica de negócio.
-   Modelos: Blender exportando GLB, com Draco/Meshopt quando fizer
    sentido.
-   Multiplayer futuro: ASP.NET Core + SignalR.
-   Banco futuro: PostgreSQL ou SQL Server, escolher um só após validar
    hospedagem.
-   Login futuro: autenticação segura; JWT somente dentro de uma
    arquitetura de sessão definida.
-   PC opcional: Electron ou Tauri após validar o build web.

## 21.2 Arquitetura modular

Separar módulos: - `core`: ciclo de vida, eventos, relógio e estado. -
`interaction`: raycast, foco e ações. - `vehicles`: catálogo, estado e
compatibilidade. - `diagnostics`: sintomas, testes e hipóteses. -
`repairs`: desmontagem, instalação e validação. - `customers`: perfis,
fila, satisfação e retorno. - `economy`: caixa, preços, despesas e
transações. - `inventory`: peças, ferramentas e fornecedores. -
`missions`: objetivos e recompensas. - `save`: versionamento, migrações
e validação. - `ui`: HUD, painéis e diálogos. - `multiplayer`: não
implementar no protótipo; reservar fronteiras de autoridade.

Sistemas comunicam-se por interfaces e eventos tipados, não por
dependências circulares. Evitar um arquivo monolítico.

## 21.3 Dados dirigidos por configuração

Carros, peças, fornecedores, clientes, serviços, missões e preços devem
viver em JSON/TypeScript tipado ou arquivos de dados equivalentes.
Validar dados na inicialização e falhar com mensagens úteis.

## 21.4 Save

Solo: IndexedDB recomendado para estado maior; localStorage apenas para
preferências ou protótipo mínimo. Save JSON versionado com
`schemaVersion`, timestamp e validação. Manter 3--5 slots manuais e
autosave. Online: persistência no servidor em etapa posterior.

## 21.5 Multiplayer futuro

Servidor autoritativo para dinheiro, peças, clientes, tempo, inventário
e transações. Cliente envia intenções, não resultados finais.
Atualização de posição de 10--20 vezes por segundo como hipótese inicial
a medir; interpolação para suavidade. Eventos enviados quando ocorrem.
Física de test drive pode rodar no cliente que dirige, com
validação/limites no servidor.

Sala com código, 2--4 jogadores, permissões de dono, bloqueio de peça
durante interação concorrente, votação para dormir, NPCs assumindo
tarefas de jogador ausente, chat de texto e save de servidor. Voz fica
fora do primeiro lançamento multiplayer.

------------------------------------------------------------------------

# 22. Segurança, qualidade e performance

-   Validar entrada de dados e saves; não confiar em valores enviados
    pelo cliente.
-   Não armazenar segredos em arquivos do cliente.
-   Evitar dependências desnecessárias e revisar licenças.
-   Não implementar compras reais nem pagamentos reais no jogo sem
    requisito explícito.
-   Logar erros com contexto e sem dados pessoais desnecessários.
-   Criar testes unitários para economia, compatibilidade, diagnóstico e
    save.
-   Testar fluxo completo manualmente em cada etapa.
-   Usar carregamento sob demanda, instancing e LOD onde medição
    justificar.
-   Definir orçamento de performance após a primeira build executável.
-   Evitar assets placeholder que pareçam finais; identificá-los como
    temporários.

------------------------------------------------------------------------

# 23. Critérios gerais de aceitação

Uma etapa só está concluída quando: 1. O projeto inicia pelo comando
documentado. 2. Não há erros críticos no console. 3. A funcionalidade
pode ser demonstrada no navegador. 4. O fluxo principal da etapa foi
testado de ponta a ponta. 5. Estados inválidos têm tratamento e
feedback. 6. Save/carregamento não corrompem dados, quando aplicável. 7.
Os testes automatizados existentes continuam passando. 8. Não foram
quebradas funcionalidades já aprovadas. 9. A documentação foi
atualizada. 10. O Claude apresenta arquivos alterados, testes
executados, limitações conhecidas e instruções para validar.

------------------------------------------------------------------------

# 24. Roadmap com prompts para Claude Code

## Como usar os prompts

-   Abra o repositório do jogo no Claude Code.
-   Faça commit ou backup antes de cada etapa.
-   Envie um prompt por vez.
-   Não avance enquanto os critérios de aceite da etapa atual não forem
    cumpridos.
-   Se o agente não conseguir executar um teste, ele deve dizer isso
    explicitamente.
-   Peça correções sobre a mesma etapa antes de solicitar novas
    funcionalidades.

## Prompt 0 --- Auditoria e plano de execução

**Objetivo:** descobrir o estado real do repositório antes de editar.

``` text
Você é o engenheiro de software sênior e responsável técnico do jogo “Simulador de Mecânico”.
Leia o GDD disponível no repositório e inspecione a estrutura atual, package.json, scripts, código, assets e documentação.

Nesta etapa NÃO implemente funcionalidades e NÃO reescreva arquivos.
1. Identifique stack, comandos reais para instalar, executar e testar.
2. Liste os sistemas já existentes, incompletos e ausentes.
3. Identifique erros de inicialização, dependências quebradas, arquivos monolíticos e riscos.
4. Proponha arquitetura incremental compatível com o código atual; não substitua a stack sem justificar.
5. Produza um plano de etapas pequenas com dependências e critérios de aceite.
6. Registre dúvidas e decisões que exigem aprovação.

Entregue um relatório com caminhos reais dos arquivos e evidências. Não invente resultados de testes. Aguarde minha aprovação antes de modificar código.
```

## Prompt 1 --- Fundação executável

**Objetivo:** build estável, estrutura modular e cena 3D.

``` text
Implemente apenas a fundação técnica do Simulador de Mecânico, seguindo o plano aprovado.
Use Three.js + Vite + TypeScript se essa stack for compatível com o repositório; preserve código existente funcional.

Requisitos:
- Projeto executável com scripts claros de dev, build e teste.
- Cena 3D simples, câmera, iluminação, chão e oficina placeholder.
- Movimento básico em primeira pessoa com teclado e mouse, incluindo captura/liberação do ponteiro.
- Tela inicial mínima com iniciar jogo e instruções.
- Estrutura modular para core, interaction, vehicles, economy, UI e save, sem criar sistemas vazios em excesso.
- Tratamento de resize, limpeza de recursos e erros visíveis.
- Assets temporários claramente identificados.
- README com pré-requisitos e comandos.

Não implemente clientes, economia real, cidade, multiplayer ou sistemas futuros nesta etapa.
Execute build e testes disponíveis. Corrija os erros encontrados e relate exatamente o que foi validado.
```

**Aceite:** a cena abre, o jogador consegue olhar e andar, iniciar e
sair do modo de jogo sem travar; build de produção funciona.

## Prompt 2 --- Interação e oficina vertical slice

**Objetivo:** interagir com objetos e inspecionar um carro.

``` text
Sobre a base aprovada, implemente interação de primeira pessoa para o protótipo.
- Raycaster detecta objetos interativos.
- Exiba nome e ação disponível ao mirar.
- Tecla de interação executa a ação e fornece feedback.
- Oficina compacta com elevador, bancada, armário de ferramentas e um carro placeholder.
- Interações com estados explícitos: disponível, em uso e indisponível.
- Não permitir duas ações incompatíveis ao mesmo tempo.
- Controles e feedback acessíveis por teclado/mouse.

Use componentes e dados reutilizáveis. Não crie uma cidade nem implemente multiplayer.
Adicione testes para regras de interação onde possível e um roteiro manual de QA. Teste build e verifique console.
```

**Aceite:** objetos corretos são selecionados, não há interação através
de objetos bloqueadores se isso fizer parte da cena, e estados inválidos
são tratados.

## Prompt 3 --- Veículo, peças e condição

**Objetivo:** modelo de dados para 15 peças iniciais.

``` text
Implemente o modelo de dados do veículo e 15 peças iniciais fictícias, seguindo o GDD.
Cada peça precisa ter ID estável, sistema, compatibilidade, condição, desgaste, custo-base e tempo de substituição.
O veículo deve ter estado próprio e histórico básico; não armazenar estado de gameplay apenas em objetos visuais Three.js.

Requisitos:
- Dados tipados e validados.
- Uma tela/painel de inspeção lista as peças e estados conhecidos.
- Separar condição real de informação descoberta pelo jogador.
- Permitir alterar estado por uma função de domínio, com validação.
- Preparar expansão para veículos diferentes sem duplicar lógica.
- Incluir dados de demonstração previsíveis.

Não implemente catálogo completo, geração procedural complexa ou tuning.
Crie testes de compatibilidade e transição de estado. Documente o formato dos dados.
```

**Aceite:** 15 peças aparecem, seus estados persistem durante a sessão e
peças incompatíveis são rejeitadas por regra de domínio.

## Prompt 4 --- Diagnóstico

**Objetivo:** sintomas, testes e hipóteses.

``` text
Implemente o primeiro sistema de diagnóstico jogável.
Crie 3 problemas de demonstração com sintomas distintos e causas que não sejam reveladas automaticamente.
O jogador pode usar inspeção visual, scanner simples e teste funcional. Cada teste consome tempo de jogo ou recurso definido.

Requisitos:
- Sintomas apresentados pelo cliente.
- Evidências adicionadas ao histórico do diagnóstico.
- Hipóteses e nível de confiança derivados de regras de domínio.
- O estado real da peça não deve aparecer na UI antes de ser descoberto.
- Habilidade/assistência pode mostrar dicas, mas não ignorar todas as etapas.
- Diagnóstico incorreto deve ser registrado e poderá causar retrabalho na etapa de reparo.
- Resultado determinístico nos casos de teste.

Não implementar simulação física real de motor ou OBD completo. Priorize clareza e diversão.
Inclua testes para os 3 casos e valide o fluxo na interface.
```

**Aceite:** o jogador precisa coletar evidências para identificar a
causa; a interface não vaza defeitos ocultos.

## Prompt 5 --- Orçamento, cliente e negociação

**Objetivo:** completar a primeira metade do loop central.

``` text
Implemente o fluxo cliente → sintoma → diagnóstico → orçamento → decisão do cliente.
Crie 3 perfis de clientes com orçamento máximo, paciência, exigência e tolerância a atraso.

O orçamento deve detalhar:
- peças selecionadas;
- mão de obra = horas estimadas × valor/hora;
- taxas e urgência, se houver;
- desconto;
- total e prazo;
- garantia.

Evite aplicar multiplicadores duplicados. Centralize a fórmula e teste seus casos.
O cliente pode aceitar, fazer contraproposta ou recusar, com resultado baseado em regras previsíveis.
Mostre mensagens claras e registre a decisão.
Não implementar pagamentos complexos, rede social ou muitos tipos de cliente ainda.
Teste limites, valores zero/negativos, recusa e contraproposta. Faça uma demonstração completa.
```

**Aceite:** valores da UI correspondem aos cálculos e a decisão do
cliente altera o estado da ordem de serviço.

## Prompt 6 --- Reparo e conclusão do serviço

**Objetivo:** fazer o loop principal funcionar de ponta a ponta.

``` text
Implemente o reparo de uma ordem de serviço aceita.
- O jogador precisa obter a peça compatível.
- A peça antiga é removida e a nova instalada por uma interação compreensível.
- O processo respeita dependências simples de desmontagem/montagem.
- Ações têm feedback visual e sonoro placeholder.
- Uma ordem só pode ser concluída quando todos os itens exigidos estiverem resolvidos.
- Peça errada, ação fora de ordem e tentativa duplicada devem ser tratadas.
- A qualidade final depende do diagnóstico e da execução, sem aleatoriedade injusta.

Após a conclusão, habilite entrega do veículo e pagamento na próxima etapa.
Não implementar centenas de parafusos ou montagem detalhada de motor. Use uma abstração clara para o protótipo.
Crie testes de estados e faça QA manual de uma ordem completa.
```

**Aceite:** uma ordem aceita pode ser reparada e validada; não é
possível finalizar um carro com tarefas pendentes.

## Prompt 7 --- Loja, estoque, pagamento e economia básica

**Objetivo:** fechar o loop cliente → lucro → reinvestimento.

``` text
Implemente loja de peças simplificada, estoque, pagamento e livro-caixa.
- Peças possuem preço, compatibilidade e prazo de entrega.
- Compra reduz o caixa e aumenta o estoque apenas quando recebida.
- Conclusão do serviço gera pagamento conforme orçamento aprovado.
- Registrar receitas, compras e despesas em transações identificáveis.
- Mostrar caixa atual, custo do serviço, receita e lucro bruto.
- Impedir gastos que excedam o caixa, salvo se uma regra de crédito tiver sido explicitamente habilitada.
- Não misturar dinheiro pessoal e caixa da oficina nesta etapa.

Crie dados de exemplo determinísticos e testes para compras, recebimento, pagamento, cancelamento e cálculo de lucro.
Não implemente inflação dinâmica, empréstimos ou todos os métodos de pagamento.
```

**Aceite:** o jogador compra uma peça, recebe a peça, conclui o serviço,
recebe o pagamento e vê o resultado financeiro correto.

## Prompt 8 --- Reputação, garantia e retorno de clientes

**Objetivo:** consequência de qualidade e ética.

``` text
Implemente reputação simples e garantia no loop existente.
- Avaliação do cliente considera prazo, orçamento, qualidade do reparo e comunicação.
- Reputação geral e por especialidade devem ser armazenadas separadamente.
- Cliente satisfeito pode retornar; cliente insatisfeito pode reclamar.
- Garantia registra validade e serviços cobertos.
- Retorno em garantia gera uma ordem vinculada à original.
- Só penalize a oficina quando a falha estiver relacionada ao reparo coberto.
- Mostre o motivo da avaliação com mensagens claras.

Não implementar rede social completa ou dezenas de traços de personalidade.
Teste situações de serviço pontual, atraso, reparo incorreto e defeito não relacionado.
```

## Prompt 9 --- Save e carregamento confiáveis

**Objetivo:** persistir o progresso sem corrupção.

``` text
Implemente save local versionado para o estado do jogo.
Use IndexedDB se o estado já exigir estrutura maior; localStorage pode ficar reservado a preferências.
Requisitos:
- 3 slots manuais e autosave.
- schemaVersion, data/hora e validação.
- Salvamento de dinheiro, estoque, veículo, ordens, reputação, upgrades e progresso de missão existentes.
- Carregar, sobrescrever e excluir slot com confirmação.
- Recuperação segura de save inválido; nunca sobrescrever automaticamente um save bom com dados corrompidos.
- Estratégia de migração entre versões.
- Testes de round-trip e dados inválidos.

Não incluir login, nuvem ou servidor nesta etapa. Teste salvar, recarregar a página e continuar o jogo.
```

## Prompt 10 --- Tutorial e Ato 1

**Objetivo:** transformar sistemas em uma experiência guiada.

``` text
Implemente o tutorial com Seu Zé e o primeiro trecho da carreira.
O arco deve ensinar movimento, interação, inspeção, diagnóstico, orçamento, compra de peça, reparo, pagamento e gestão do caixa.
A história começa com a oficina herdada e uma dívida bancária.

Requisitos:
- Missões orientadas por dados com ID, pré-requisitos, passos, recompensa e condição de conclusão.
- Dicas contextuais dispensáveis.
- Diálogos curtos com escolhas e consequência registrada.
- O jogador sempre sabe o objetivo atual.
- Não prender a campanha por uma falha pequena; oferecer orientação ou recuperação.
- O conteúdo usa apenas sistemas existentes e não finge que funcionalidades futuras estão prontas.

Crie uma missão completa e testável antes de ampliar o ato. Verifique progressão após salvar e carregar.
```

## Prompt 11 --- Ferramentas, upgrades e progressão

**Objetivo:** introduzir decisões de investimento.

``` text
Implemente ferramentas e upgrades da oficina para a carreira inicial.
Comece com poucas ferramentas e 3 níveis por ferramenta. Cada nível deve ter custo e efeito mensurável.
Upgrades possíveis no protótipo: iluminação, uma vaga/elevador, armário de ferramentas e organização do estoque.

Requisitos:
- Compra valida dinheiro e requisitos.
- Efeitos devem ser aplicados pelo sistema de domínio, não apenas por texto na UI.
- Mostrar comparação antes/depois.
- Salvar progresso corretamente.
- Balanceamento configurado em dados.
- Não criar todos os upgrades listados no GDD de uma só vez.

Inclua testes de compra, bloqueios, efeitos e persistência. Apresente uma tabela de valores para futura revisão.
```

## Prompt 12 --- Mais carros, serviços e conteúdo orientado por dados

**Objetivo:** expandir conteúdo sem duplicar código.

``` text
Expanda o catálogo para 10 veículos fictícios e um conjunto limitado de serviços adicionais.
Reutilize os sistemas já implementados; não copie e cole lógica por veículo.
Defina compatibilidades por modelo/ano, preços, tempos, defeitos e requisitos de ferramenta em dados validados.
Inclua pelo menos veículos de categorias diferentes e variação de condição/histórico.
A geração procedural deve ser reproduzível por seed e nunca produzir uma missão impossível.
Adicione uma tela de catálogo/enciclopédia simples.

Não adicionar ainda cidade completa, negócios extras ou multiplayer. Teste compatibilidade e geração em várias seeds e documente os limites conhecidos.
```

## Prompt 13 --- Direção e test drive

**Objetivo:** experiência de condução isolada e controlável.

``` text
Crie uma área de teste pequena e um veículo dirigível com física selecionada após avaliar Rapier e alternativas compatíveis.
A física deve considerar peso, aderência, pneus e condições básicas do veículo.
Inclua controles, câmera, velocímetro, conta-giros e luzes de alerta essenciais.
Test drive deve ser uma atividade separada e não comprometer a oficina caso falhe.
Não implementar trânsito urbano completo nem corrida competitiva nesta etapa.

Defina controles e limites de velocidade; teste colisão, reinício e retorno à oficina. Faça medição de performance e documente os controles.
```

## Prompt 14 --- Cidade e novos locais

**Objetivo:** ampliar o bairro sem prejudicar performance.

``` text
Expanda o exterior para um bairro pequeno com apenas os locais necessários à carreira: oficina, loja de peças, ferro-velho, banco e lanchonete.
Use marcadores no mapa e interações claras. Carregue conteúdo sob demanda quando apropriado.
Trânsito e pedestres devem ser mínimos e controlados; use assets temporários identificados.
Não crie uma cidade gigante nem dezenas de NPCs ativos.
Meça FPS, tempo de carregamento e uso de memória em uma máquina de referência disponível. Se não for possível medir, declare isso.
Teste navegação, colisão, retorno à oficina e transições de local.
```

## Prompt 15 --- Funcionários e automação básica

**Objetivo:** introduzir gestão sem IA excessivamente complexa.

``` text
Implemente um protótipo de funcionários com 2 cargos e uma fila de tarefas.
Cada funcionário possui habilidade, velocidade, salário e estado atual.
A IA deve selecionar uma tarefa compatível, deslocar-se por caminho simples ou usar uma representação abstrata se navegação física for desnecessária, executar progresso e reportar conclusão.
Impedir que dois funcionários assumam a mesma tarefa.
Adicionar contratação, folha salarial e pausa/demissão.
Não implementar todos os cargos, férias, acidentes e traços de personalidade ainda.
Teste concorrência de tarefas, caixa insuficiente, demissão e save/load.
```

## Prompt 16 --- Eventos, fiscalização e arco de pressão local

**Objetivo:** consequências narrativas com alternativas.

``` text
Implemente o primeiro evento de fiscalização e um encontro narrativo ficcional de pressão criminosa, usando um sistema de eventos reutilizável.
Cada evento precisa de gatilho, opções, custo/consequência, mensagem e registro no histórico.
As escolhas devem oferecer alternativas legíveis; não transformar eventos aleatórios em punição inevitável.
Permitir que o jogador entenda riscos e recupere-se de consequências moderadas.
Não adicionar violência gráfica nem sistemas de crime realistas operacionais.
Testar gatilhos, frequência, persistência e efeitos financeiros/reputacionais.
```

## Prompt 17 --- Multiplayer cooperativo (somente após aprovação do modo solo)

**Objetivo:** protótipo online de 2 jogadores, depois expandir até 4.

``` text
Antes de implementar, audite a arquitetura atual e apresente um plano de rede. Não tente converter todos os sistemas de uma vez.
Use ASP.NET Core + SignalR se aprovado e compatível com o ambiente.
Primeiro protótipo:
- criar sala com código;
- dois jogadores entram na mesma oficina;
- posições e estados visuais sincronizados;
- servidor autoritativo para dinheiro, inventário, peças, ordens e tempo;
- cliente envia intenções e o servidor valida;
- bloqueio de uma peça/estação enquanto outro jogador interage;
- reconexão e tratamento de desconexão.

Não implementar login definitivo, economia completa, voz ou 4 jogadores até os testes com dois jogadores serem estáveis.
Crie testes de mensagens inválidas, duplicadas, desconexão e concorrência. Documente como iniciar cliente e servidor.
```

## Prompt 18 --- QA, performance e preparação de lançamento

**Objetivo:** estabilizar o que existe, sem adicionar escopo.

``` text
Entre em modo de estabilização. Não adicione novas funcionalidades.
Audite o jogo implementado contra este GDD e liste:
- bugs reproduzíveis;
- fluxos incompletos;
- erros de console;
- falhas de save/load;
- problemas de performance;
- problemas de acessibilidade e controles;
- assets sem licença ou placeholders não identificados;
- dependências e riscos de build.

Priorize por severidade. Corrija primeiro bugs críticos e altos, um grupo por vez, mantendo testes de regressão.
Execute build de produção e toda a suíte de testes disponível.
Produza checklist manual de QA, instruções de instalação/execução, limitações conhecidas e lista de funcionalidades realmente concluídas.
Nunca declare uma funcionalidade testada se não a executou.
```

------------------------------------------------------------------------

# 25. Plano de testes do loop principal

## Teste A --- caminho feliz

1.  Iniciar carreira nova.
2.  Receber cliente e sintoma.
3.  Fazer testes de diagnóstico.
4.  Identificar a causa.
5.  Criar orçamento e obter aprovação.
6.  Comprar e receber peça.
7.  Executar reparo.
8.  Entregar o carro e receber pagamento.
9.  Conferir caixa, reputação e histórico.
10. Salvar, recarregar e verificar que o estado foi preservado.

## Teste B --- erros esperados

-   Cliente recusa o orçamento.
-   Peça incompatível é selecionada.
-   Caixa insuficiente para compra.
-   Jogador tenta concluir serviço incompleto.
-   Diagnóstico errado.
-   Save inválido.
-   Página é recarregada durante uma ordem.
-   Duas ações tentam alterar a mesma peça.
-   O jogo é aberto em janela estreita e redimensionado.
-   Asset falha ao carregar.

## Teste C --- regressão

Após cada etapa, repetir o caminho feliz e os erros mais relevantes das
etapas anteriores. Uma funcionalidade nova não pode quebrar a compra, o
reparo, o pagamento ou o save.

------------------------------------------------------------------------

# 26. Decisões ainda abertas

Estas decisões devem ser tomadas com protótipos, não por suposição: 1.
Low-poly estilizado ou semi-realista. 2. Física: Rapier ou alternativa.
3. Nível de realismo dos reparos: casual, intermediário ou simulador. 4.
Câmera de condução e escopo do mapa. 5. Equilíbrio entre campanha
narrativa e sandbox. 6. Modelo de hospedagem e custos do multiplayer. 7.
Banco de dados definitivo. 8. Modelo comercial, se houver. 9. Quais
recursos ficam fora do primeiro lançamento. 10. Quantidade final de
conteúdo e duração da campanha.

------------------------------------------------------------------------

# 27. Definição de "pronto"

Uma funcionalidade não está pronta apenas porque o código foi escrito.
Ela está pronta quando: - existe no build; - pode ser acessada por uma
sequência clara; - produz o resultado esperado; - trata erros
previsíveis; - funciona após save/load, se aplicável; - tem teste ou
roteiro de QA; - não quebra sistemas anteriores; - está documentada e
não depende de arquivos inexistentes.

**Ordem recomendada:** prompts 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 →
10. Só então expandir ferramentas, veículos, direção e mundo.
Multiplayer é uma fase posterior, não um requisito do protótipo inicial.
