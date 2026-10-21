# Prompt 17: auditoria da arquitetura e plano de rede (sem código)

> **Status:** só plano. O GDD (§24, Prompt 17) exige que o modo solo seja **aprovado pelo Gustavo** antes de qualquer implementação. Nada aqui foi construído.

## 1. Auditoria: o que já ajuda e o que atrapalha

**Já pronto para rede:**
- **Regras de jogo puras e testadas**, em `src/economy`, `src/diagnostics`, `src/repairs`, `src/customers`, `src/upgrades`, `src/staff`, `src/events`, `src/city` e `src/procedural`. Elas rodam igual em qualquer lugar que execute TypeScript.
- **A `GameSession` concentra o estado do jogo** e muda só por métodos que devolvem `ActionOutcome`. Isso já é, na prática, o formato "intenção → validação → resultado" que o servidor autoritativo pede.
- **Estado serializável e validado:** `toSnapshot()` / `fromSnapshot()` + `validateSessionSnapshot`, com save versionado (v6) e migrações. A mesma validação serve para mensagens vindas da rede.
- **Determinismo:** OS, garimpo, eventos e física do test drive dependem de semente ou de passo fixo. Servidor e cliente chegam ao mesmo resultado.
- **Dinheiro em centavos inteiros:** não há divergência de arredondamento entre máquinas.

**Atrapalha (precisa mudar antes):**
- **O relógio do jogo mora no `Game.ts`** (`GameClock`), no cliente. No multiplayer o tempo é do servidor (o GDD pede "servidor autoritativo para … tempo").
- **O estado dos equipamentos** (elevador, capô, gaveta, luzes) mora em `WorkshopEquipment`, fora da `GameSession`. Ele precisa entrar no estado compartilhado, com **bloqueio** ("bloqueio de uma peça/estação enquanto outro jogador interage").
- **Missões, tutorial e diálogos** (`MissionTracker`) são por jogador. Fica para decidir se a campanha é do anfitrião ou de cada um.
- **`Game.ts` (~1.700 linhas)** mistura entrada, cena e orquestração. Antes da rede, separar uma camada de **comandos** (abaixo).
- **Momento das ações:** hoje vem do relógio local (`GameMoment`). No servidor, o momento vem dele.

## 2. Decisão necessária: onde rodam as regras no servidor

O GDD sugere **ASP.NET Core + SignalR** "se aprovado e compatível com o ambiente". O ponto crítico é que **todas as regras estão em TypeScript**.

| Opção | Como | Prós | Contras |
| --- | --- | --- | --- |
| **A. Servidor Node + TypeScript** (recomendado) | Servidor WebSocket (por exemplo, `ws`) importa os **mesmos** módulos de `src/` (`GameSession` e regras). | Zero duplicação de regra. Os 242 testes valem para o servidor. Uma linguagem só. | Desvia da sugestão do GDD (ASP.NET). |
| B. ASP.NET Core + SignalR, regras portadas para C# | Reescrever as regras em C#. | Segue o GDD à risca; .NET é robusto para salas. | **Duplica toda a lógica** em duas linguagens; cada mudança de regra vira duas. Risco alto de divergência. |
| C. ASP.NET Core + SignalR como transporte, regras em JS dentro do .NET (Jint/ClearScript) | O .NET executa o pacote JS das regras. | Mantém ASP.NET e uma regra só. | Integração complexa; depuração difícil; desempenho incerto. |

**Recomendação:** opção A, com o protocolo desenhado de forma independente do transporte. Assim, trocar por SignalR depois afeta só a camada de rede. **A decisão é do Gustavo.**

## 3. Plano em fases (cada fase com testes antes da próxima)

**Fase 0: camada de comandos (também melhora o modo solo).**
- Criar `GameCommand`, uma união tipada das intenções (`{ type: 'buyPart', partId, supplierId, qty }`, `{ type: 'runTest', testId }`, …), e `applyCommand(session, cmd, when)`, pura.
- O `Game.ts` passa a mandar comandos em vez de chamar a sessão direto.
- Testes: cada comando é válido ou recusado com mensagem; comando repetido é idempotente quando deve ser.

**Fase 1: sala com código, 2 jogadores.**
- O servidor cria uma sala com código curto. Ele é o dono da `GameSession`, do relógio e dos equipamentos.
- O cliente manda **intenções**; o servidor valida (`applyCommand`) e devolve a nova versão do estado. Começar com o snapshot inteiro e passar a diferenças depois, medindo antes.
- **Posições e olhar** dos jogadores: mensagens não autoritativas, a cerca de 10–20 Hz, só visuais.

**Fase 2: bloqueios.**
- Peça, estação (elevador, computador, estoque) e OS ganham **dono temporário**: "fulano está usando o elevador".
- Bloqueio com expiração; liberado ao desconectar.

**Fase 3: desconexão e reconexão.**
- O jogador que cai mantém o lugar por N minutos.
- Ao voltar, recebe o snapshot completo e a versão. Mensagens com versão antiga são recusadas.

**Fase 4: até 4 jogadores**, só depois de a Fase 3 estar estável (o GDD manda).

**Fora do escopo** (pelo GDD): login definitivo, economia completa, voz.

## 4. Protocolo (rascunho)

```
cliente → servidor   { kind: 'command', seq, sessionVersion, command: GameCommand }
servidor → cliente   { kind: 'result', seq, ok, message, version }      (só para quem pediu)
servidor → todos     { kind: 'state', version, snapshot | diff }
cliente → servidor   { kind: 'presence', x, z, yaw, pitch }             (visual, sem validação de regra)
servidor → todos     { kind: 'presence', playerId, x, z, yaw, pitch }
servidor → todos     { kind: 'lock', target, playerId | null }
```

## 5. Testes exigidos pelo GDD (a fazer junto com cada fase)

- **Mensagem inválida:** formato errado, comando desconhecido, valores fora do limite → recusada sem mudar o estado.
- **Mensagem duplicada** (mesmo `seq`) → aplicada uma vez só.
- **Concorrência:** dois jogadores compram o último item ou mexem na mesma peça → um vence e o outro recebe "em uso".
- **Desconexão** no meio de uma ação, com bloqueio liberado, e **reconexão** com estado igual ao do servidor.
- **Regressão:** a suíte solo inteira continua passando, porque a fase 0 não muda o comportamento.

## 6. Como seria rodado (quando existir)

```
npm run dev            # cliente, como hoje
npm run server         # servidor da sala (a criar), porta configurável em dev-ports.ts
```
