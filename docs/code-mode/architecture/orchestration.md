# Code Mode — Orquestração da implementação — Arquitetura

Parent: [index.md](index.md)

## Purpose

Sequência de ondas para implementar o Code Mode com subagentes em paralelo: cada onda entrega um
conjunto fechado de IDs de teste, cada tarefa possui arquivos exclusivos dentro da onda e cada onda
termina num portão verificável. O objetivo é que nenhum agente precise ler o repositório inteiro,
que dois agentes nunca editem o mesmo arquivo ao mesmo tempo e que o progresso seja medido por
testes que saem de `it.todo` para verde — não por opinião.

Pré-requisito de leitura para qualquer onda: `docs/code-mode-plan.md` §2–§4 e §10–§12,
`docs/code-mode-requirements.md` F1–F4, o contrato compartilhado ([contract.md](contract.md)) e
[testing.md](testing.md).

## Pré-requisitos antes de iniciar

1. **Working tree limpo.** Todo o WIP anterior precisa estar commitado na branch
   `truncated-tool-names`: `git status --porcelain` vazio antes de qualquer onda. Nenhum agente de
   onda reescreve, formata ou descarta trabalho alheio.
2. **Branch dedicada.** Crie `feat/code-mode` a partir do HEAD atual
   (`git switch -c feat/code-mode`); todo o trabalho de implementação acontece nela. Nenhuma onda
   commita direto na `truncated-tool-names`.
3. **Arquivos quentes.** Estes arquivos já foram tocados por trabalho paralelo do usuário e precisam
   de cuidado extra no rebase: `packages/coding-agent/src/sdk.ts`,
   `packages/coding-agent/src/system-prompt.ts`,
   `packages/coding-agent/src/prompts/system/system-prompt.md`,
   `packages/coding-agent/src/extensibility/settings.ts`,
   `packages/coding-agent/src/internal-urls/xd-protocol.ts`,
   `packages/coding-agent/src/internal-urls/skill-protocol.ts` e
   `packages/coding-agent/src/session/agent-session.ts`. Conflito neles se resolve preservando os
   dois lados; a lógica nova continua concentrada em `src/code-mode/` e nos pontos de chamada.
4. **Baseline verde.** `cd packages/coding-agent && bun test test/code-mode/` termina com **0 fail**
   e todos os IDs ainda em `it.todo`; nenhum teste é destravado antes de W0.
5. **W5 só com aprovação.** A execução A/B de W5.5 (modelos comparados, orçamento de tokens/custo e
   número de repetições) exige aprovação explícita do usuário **antes** de rodar. Sem a aprovação,
   implemente W5.1–W5.4 e pare antes de W5.5; a decisão de virar `default: true` não é tomada sem
   esse resultado.
6. **Needle fechada.** O spike da Needle 3 terminou **NO-GO** (seletor 10–20%, reparo 20%, p95
   172–251 ms). Não existe onda de implementação da Needle: o spike não é reaberto, não vira
   dependência de runtime e os IDs NDL ficam como registro da medição.

## Regras de gate

1. **Um dono por arquivo por onda.** As tabelas abaixo listam os arquivos possuídos; dentro de uma
   onda não há interseção. Arquivo fora da lista é proibido, mesmo que o teste falhe por causa dele
   — nesse caso, pare e reporte.
2. **Gate de IDs.** `cd packages/coding-agent && bun test --todo test/code-mode/<arquivo>.test.ts`
   executa os `it.todo`; todo todo cujo corpo passa é reportado como falha. A lista de falhas deve
   ser exatamente os IDs-alvo da onda.
3. **Flip.** Remova `.todo` só dos IDs que passaram e rode sem `--todo` até ficar verde. Repita o
   `--todo` para confirmar que sobraram apenas IDs de ondas futuras.
4. **Typecheck.** `cd packages/coding-agent && bunx tsgo -p tsconfig.json --noEmit` limpo antes de
   declarar a onda fechada.
5. **Revisão.** O último passo da onda é um agente `reviewer` (somente leitura) conferindo o diff:
   arquivos possuídos, nenhuma asserção de teste alterada, nenhum ID renomeado, docs batendo com o
   código.
6. **Não rode** suíte inteira, lint ou format por causa da onda.

Cada tarefa de implementação é um subagente `task`; o portão é um `reviewer`. Dependências entre
tarefas da mesma onda são explícitas; tarefas sem dependência rodam concorrentes.

## Visão das ondas

| Onda | Objetivo | Depende de | Portão (IDs que viram verdes) |
| --- | --- | --- | --- |
| W0 | Módulos puros de contrato em `src/code-mode/` | — | `scope.test.ts` → CM-S1..CM-S10 |
| W1 | Núcleo: camada bridge-only, partição no `createAgentSession`, flags, prompt | W0 | `partition.test.ts` → CM-P1..CM-P7; `gap.test.ts` → CM-G1..CM-G4; `toggle.test.ts` → CM-T2 |
| W2 | Toggle completo (sessão, `/code-mode`, RPC) e indicador na status line | W1 | `toggle.test.ts` → CM-T1, CM-T3..CM-T7; `indicator.test.ts` → CM-I1..CM-I4 |
| W3 | Escopo no runtime (frontmatter), `codeMode` no spawn e persistência do escopo | W2 | `spawn.test.ts` → CM-A1..CM-A3; `gap.test.ts` → CM-G6 |
| W4 | Skills, MCP, ExtensionAPI e pi-jev | W2 | `skills-mcp.test.ts` → CM-C1..CM-C6; `gap.test.ts` → CM-G5; pi-jev → JEV-CM1..JEV-CM6 |
| W5 | Economia de tokens: catálogo, dicas no sufixo, teto de saída, A/B | W4 | `token-economy.test.ts` → CM-E1..CM-E6 |
| W6 | RLM: input grande, `inputs`, `elide`, `agent(fork)` | W3 (fork), W5 (opcional) | `rlm.test.ts` → CM-R1..CM-R5; `spawn.test.ts` → CM-A4, CM-A5 |
| Needle | Spike de medição encerrado em **NO-GO** — sem onda de implementação | — | NDL-1..NDL-3 (só o relatório; nada a implementar) |

W5 não bloqueia W6: `CM-R1..CM-R3` só dependem de W1 (o `eval` precisa estar de pé) e `CM-A4`,
`CM-A5` dependem de W3. As dependências reais estão por tarefa, abaixo.

## W0 — módulos de contrato

Objetivo: lógica pura, sem wiring, que os testes de escopo consomem hoje. Nenhum arquivo quente do
upstream é tocado.

| Tarefa | Arquivos possuídos | Depende de | IDs | Agente |
| --- | --- | --- | --- | --- |
| W0.1 `settings.ts`: `cfgCodeModeDefault`, `cfgCodeModeScope` (com `validate`), `CodeModeScope` | `packages/coding-agent/src/code-mode/settings.ts` | — | CM-S7, CM-S8 | task |
| W0.2 `scope.ts`: `resolveCodeMode`, `CodeModeResolveInput`, `CodeModeDecision` | `packages/coding-agent/src/code-mode/scope.ts` | W0.1 (tipo) | CM-S1..CM-S6, CM-S9, CM-S10 | task |
| W0.3 `partition.ts`: `CODE_MODE_TOP_LEVEL`, `applyCodeModePartition` | `packages/coding-agent/src/code-mode/partition.ts` | — | (sem ID próprio; habilita W1) | task |
| W0.4 `catalog.ts`: `renderBridgeCatalog` | `packages/coding-agent/src/code-mode/catalog.ts` | — | CM-E3 | task |
| W0.5 `hints.ts`: contrato `customType: "router-hints"`, orçamento ≤ 600 tokens | `packages/coding-agent/src/code-mode/hints.ts` | — | (sem ID próprio; habilita W5.2) | task |

Portão:

```bash
cd packages/coding-agent && bunx tsgo -p tsconfig.json --noEmit
cd packages/coding-agent && bun test --todo test/code-mode/scope.test.ts
```

`CM-S8` exige que `settings.ts` seja importável isoladamente (o teste usa
`Settings.isolated` + id string); `CM-S7` exige os defaults de fábrica `agents: { sonic: false,
scout: false }` e `roles: { smol: false, tiny: false }`.

## W1 — núcleo da partição

Objetivo: o modelo passa a ver só o topo, e o bridge alcança o resto. Toca os arquivos mais quentes
do fork — mantenha a lógica em `partition.ts` e chame a partir do `sdk.ts`.

| Tarefa | Arquivos possuídos | Depende de | IDs | Agente |
| --- | --- | --- | --- | --- |
| W1.1 Camada bridge-only no `SessionTools` (`setBridgeOnlyToolNames`, união em `getEnabledToolNames`, `getToolForEvalBridge`, `setActiveToolsByName`, `refreshMCPTools`, gate ACP) e filtro de plan mode no bridge | `packages/coding-agent/src/session/session-tools.ts` | W0.3 | CM-P2, CM-P4, CM-P5, CM-P7, CM-G4 | task |
| W1.2 Opção `codeMode` em `createAgentSession`, partição do topo em `sdk.ts`, fallback sem backend de eval | `packages/coding-agent/src/sdk.ts` | W0.3, W1.1 | CM-P1, CM-P3, CM-P6 | task |
| W1.3 Flags booleanas `--code-mode` / `--no-code-mode` em `parseArgs` → `Args.codeMode` | `packages/coding-agent/src/cli/args.ts` | — | CM-T2 | task |
| W1.4 Bloco `{{#if codeMode}}` no prompt do `eval` com catálogo, helpers `tool.describe`/`tool.search` nas preludes JS e Python, remoção das instruções de tool direta sob Code Mode | `packages/coding-agent/src/prompts/tools/eval.md`, `packages/coding-agent/src/eval/js/shared/prelude.ts`, `packages/coding-agent/src/eval/py/prelude.ts`, `packages/coding-agent/src/eval/py/prelude.py`, `packages/coding-agent/src/system-prompt.ts` | W0.4 | CM-G1, CM-G2, CM-G3 | task |

Portão:

```bash
cd packages/coding-agent && bun test --todo test/code-mode/partition.test.ts
cd packages/coding-agent && bun test --todo test/code-mode/gap.test.ts
cd packages/coding-agent && bun test --todo test/code-mode/toggle.test.ts --test-name-pattern CM-T2
```

`CM-G1..CM-G3` fecham em W1.4: `tool.describe`/`tool.search` precisam existir na prelude JS
(`packages/coding-agent/src/eval/js/shared/prelude.ts`) e na Python
(`packages/coding-agent/src/eval/py/prelude.py`; `packages/coding-agent/src/eval/py/prelude.ts` só
importa o `.py` como texto). `CM-G3` é pulado quando o probe de backend Python indica ausência.
`CM-G4` fecha em W1.1: o filtro do plan mode (`planModeEnabled()` do host) vale também para
`getToolForEvalBridge`, sem tocar no wire e sem desligar o Code Mode.

Todo reconcile (`setActiveToolsByName`) precisa reconhecer a camada: `CM-P5` verifica que entrar em
goal mode não devolve as tools bridge-only ao wire. `CM-P6` exige que a sessão caia no modo normal
quando o backend de `eval` não estiver disponível (`packages/coding-agent/src/tools/eval-backends.ts`).

## W2 — toggle e indicador

Objetivo: ligar/desligar de verdade e mostrar o estado. O estado é congelado na criação da sessão.

| Tarefa | Arquivos possuídos | Depende de | IDs | Agente |
| --- | --- | --- | --- | --- |
| W2.1 `/code-mode [on\|off\|status\|default on\|default off]` em `BUILTIN_MODE_SLASH_COMMANDS`, seguindo o padrão do `/fast` | `packages/coding-agent/src/slash-commands/builtin-modes.ts` | W1 | CM-T5, CM-T6 | task |
| W2.2 Estado na sessão: `isCodeModeActive()`, `getCodeModeDecision()`, `getBridgeOnlyToolNames()`, gravação no arquivo de sessão, herança no `forkFrom` | `packages/coding-agent/src/session/agent-session.ts`, `packages/coding-agent/src/session/session-manager.ts` | W1 | CM-T3, CM-T4 | task |
| W2.3 Campo `codeModeEnabled` no snapshot de estado do RPC | `packages/coding-agent/src/modes/rpc/wire/state.ts`, `packages/coding-agent/src/modes/rpc/rpc-mode.ts` | W2.2 | CM-T7 | task |
| W2.4 Default `codeMode.default` lido no `createAgentSession` quando a opção é omitida | `packages/coding-agent/src/sdk.ts` | W0.1, W1.2 | CM-T1 | task |
| W2.5 Segmento de modelo: `icon.codeMode` ativo e variante esmaecida na divergência regra × estado; campo no host | `packages/tui/src/status-line/segments.ts`, `packages/tui/src/status-line/host.ts`, `packages/tui/src/status-line/component.ts` | W2.2 | CM-I1, CM-I2 | task |
| W2.6 Símbolo `icon.codeMode` nos conjuntos unicode e nerd | `packages/tui/src/theme/symbols.ts` | — | CM-I4 | task |
| W2.7 Campo `codeMode` no snapshot de startup e no validador | `packages/tui/src/status-line/startup.ts` | — | CM-I3 | task |

Portões:

```bash
cd packages/coding-agent && bun test --todo test/code-mode/toggle.test.ts
cd packages/coding-agent && bun test --todo test/code-mode/indicator.test.ts
```

`CM-T6` fixa a semântica: `/code-mode on` numa sessão com mensagens **não** muda o wire da sessão
atual — abre uma sessão nova; numa sessão vazia, aplica nela. `CM-T4` exige que o fork herde o
estado gravado, não o default corrente.

## W3 — escopo no runtime e spawn

Objetivo: fazer `resolveCodeMode` valer no caminho real de spawn e aceitar o parâmetro vindo do
modelo.

| Tarefa | Arquivos possuídos | Depende de | IDs | Agente |
| --- | --- | --- | --- | --- |
| W3.1 `codeMode?` em `agentArgsSchema`/`EvalAgentArgs`, repasse ao subagente, motivo de negação `codeMode ignored: agent has no eval` | `packages/coding-agent/src/eval/agent-bridge.ts` | W2.2 | CM-A1, CM-A2 | task |
| W3.2 `codeMode?` no item do `task` e resolução no `structured-subagent` depois da escolha de modelo | `packages/coding-agent/src/task/index.ts`, `packages/coding-agent/src/task/structured-subagent.ts` | W0.2, W2.2 | CM-A3 | task |
| W3.3 Frontmatter `codeMode: true\|false` em `AgentDefinition` e no parser de descoberta | `packages/coding-agent/src/task/types.ts`, `packages/coding-agent/src/task/discovery.ts` | — | (sem ID próprio; alimenta CM-S3/CM-A2 no runtime) | task |
| W3.4 Persistência de `codeMode.scope` pelo caminho de gravação do `/settings` (set + save, ordem de `models` preservada) e leitura de volta por `resolveCodeMode` | `packages/coding-agent/src/code-mode/settings.ts` | W0.1, W0.2 | CM-G6 | task |

Portão:

```bash
cd packages/coding-agent && bun test --todo test/code-mode/spawn.test.ts
cd packages/coding-agent && bun test --todo test/code-mode/gap.test.ts --test-name-pattern CM-G6
```

O gate de W3 cobre `CM-A1..CM-A3` e `CM-G6`; `CM-A4`/`CM-A5` só fecham em W6.4. A resolução precisa
acontecer **depois** do modelo, porque role e glob dependem dele. `CM-G6` não cria um segundo
registro de settings: exercita o `cfgCodeModeScope` de W0.1 pelo mesmo caminho que a TUI usa e
confirma que a ordem de `models` (primeiro match vence) sobrevive à persistência.

## W4 — skills, MCP, extensões e pi-jev

Objetivo: nada que hoje funciona pode quebrar quando o `eval` é a interface principal.

| Tarefa | Arquivos possuídos | Depende de | IDs | Agente |
| --- | --- | --- | --- | --- |
| W4.1 Bloco de skills no prompt continua válido com Code Mode; `skill://<name>` legível pelo `read` bridgeado | `packages/coding-agent/src/prompts/system/custom-system-prompt.md`, `packages/coding-agent/src/system-prompt.ts` | W1.4 | CM-C1, CM-C2 | task |
| W4.2 Sem bloco "MCP Tool Routes" `xd://` em Code Mode; MCP aparece no catálogo do bridge | `packages/coding-agent/src/sdk.ts` | W1.4 | CM-C3 | task |
| W4.3 `ExtensionAPI.setActiveTools` em Code Mode (adições viram bridge-only, remoções de bridge-only são no-op, topo imutável), `pi.isCodeModeActive()` e `tool_call` único no despacho bridgeado com o nome da tool interna | `packages/coding-agent/src/extensibility/extensions/types.ts`, `packages/coding-agent/src/extensibility/extensions/runner.ts` | W2.2 | CM-C4, CM-C5, CM-C6, CM-G5 | task |
| W4.4 pi-jev: `McpGate` sem `setActiveTools`, router devolve nomes, `jev_find_tools` sem ativar, `ToolGuard` ignora `eval`, hint em `skill://<name>`, fallback sem `isCodeModeActive` | `vendor/pi-jev/src/mcp-gate.ts`, `vendor/pi-jev/src/router.ts`, `vendor/pi-jev/src/tool-guard.ts`, `vendor/pi-jev/src/skills.ts` | W2.2 | JEV-CM1..JEV-CM6 | task |

Portões:

```bash
cd packages/coding-agent && bun test --todo test/code-mode/skills-mcp.test.ts
cd packages/coding-agent && bun test --todo test/code-mode/gap.test.ts --test-name-pattern CM-G5
cd vendor/pi-jev && node --test --import tsx test/code-mode.test.ts
```

`CM-E1` (prefixo congelado) depende de W4.3: é o `setActiveTools` que não pode mexer em
`systemPrompt` nem no wire. `CM-G5` usa o dedup existente
(`${toolCallId}:${toolName}` em `ExtensionRunner.markToolCallEmitted`): o evento tem que sair uma
vez só, com o nome da tool interna, e nunca com `eval`.

## W5 — economia de tokens

Objetivo: entregar o ganho que justifica o modo e congelar o prefixo para o cache.

| Tarefa | Arquivos possuídos | Depende de | IDs | Agente |
| --- | --- | --- | --- | --- |
| W5.1 Catálogo estável (ordem fixa, uma linha `name: summary` ≤12 palavras, MCP com >20 tools colapsado em `mcp__<server>__* (N tools)`) | `packages/coding-agent/src/code-mode/catalog.ts` | W0.4 | CM-E3 | task |
| W5.2 Mensagem de dicas no sufixo (`customType: "router-hints"`), nunca no system prompt, teto de 600 tokens com corte/rejeição | `packages/coding-agent/src/code-mode/hints.ts`, `packages/coding-agent/src/session/agent-session.ts` | W0.5 | CM-E4, CM-E5 | task |
| W5.3 Teto de saída inline do `eval` em Code Mode menor que no modo normal; excedente vira artifact | `packages/coding-agent/src/eval/js/executor.ts`, `packages/coding-agent/src/eval/py/executor.ts` | W1 | CM-E6 | task |
| W5.4 Congelamento do prefixo: `setActiveTools` de extensão não pode alterar system prompt nem schemas do wire | `packages/coding-agent/src/session/session-tools.ts` | W4.3 | CM-E1, CM-E2 | task |
| W5.5 A/B no metaharness: mesmo conjunto de tarefas com e sem `--code-mode`, mesmo modelo e seed; reportar input/output, custo, sucesso, wall time e requests | `packages/metaharness/src/experiments.ts` | W1 | (sem ID; decisão de default) | task |

Portão:

```bash
cd packages/coding-agent && bun test --todo test/code-mode/token-economy.test.ts
```

A decisão de virar `default: true` exige custo menor e sucesso igual ou maior em pelo menos dois
modelos, um Anthropic e um OpenAI/Codex, com t-test (`skill://eval-change-noise-vs-signal`) — não
por diferença bruta.

W5.5 é a única tarefa que gasta orçamento de verdade: antes de executá-la, peça aprovação explícita
do usuário para o **conjunto de modelos**, o **orçamento de tokens/custo** e o **número de
repetições**. Sem essa aprovação, W5 fecha com W5.1–W5.4 verdes e W5.5 registrada como pendente.

## W6 — RLM: input grande, `elide` e fork

Objetivo: contexto como dado. W6.1..W6.3 são independentes entre si; W6.4 depende de W3.

| Tarefa | Arquivos possuídos | Depende de | IDs | Agente |
| --- | --- | --- | --- | --- |
| W6.1 `input.largeInputAsHandle`: paste/anexo acima do limite vira `local://paste-N.md`; o prompt leva só handle, tamanho aproximado e instrução de acesso | `packages/coding-agent/src/modes/controllers/input-controller.ts` | W1 | CM-R1 | task |
| W6.2 `inputs` como mapa lazy de handles no prelude JS/Python, sem carregar conteúdo na criação do kernel | `packages/coding-agent/src/eval/js/shared/prelude.ts`, `packages/coding-agent/src/eval/py/prelude.py` | W6.1 | CM-R2 | task |
| W6.3 Tool `elide`: registrada só com `compaction.experimentalContextManagement`, blanking `[Elided by model - N tokens]`, respeita `keepBoundaryId` e `skill://`, adia quando o alvo está na janela de cache quente | `packages/coding-agent/src/tools/context-notes.ts` | W5.4 | CM-R3, CM-R4, CM-R5 | task |
| W6.4 `agent({ fork: true })`: `prepareSeance` aceita `invocationKind: "eval"` com a sessão atual como origem; falha clara sem sessão pai persistida | `packages/coding-agent/src/task/seance.ts`, `packages/coding-agent/src/eval/agent-bridge.ts` | W3.1, W3.2 | CM-A4, CM-A5 | task |

Portões:

```bash
cd packages/coding-agent && bun test --todo test/code-mode/rlm.test.ts
cd packages/coding-agent && bun test --todo test/code-mode/spawn.test.ts
```

`CM-R5` é o único que pode devolver "agendado": aplicar o blanking com cache quente invalidaria o
prefixo; o adiamento é comportamento esperado, não falha.

## Needle — spike encerrado (NO-GO)

Fora do fork e fechado: não existe onda de implementação da Needle. Roda em
`harnesses-improver/needle-spike/` apenas como registro da medição. O spike já foi executado:
veredito **NO-GO** — seletor 10–20%, reparo 20%, p50 94–118 ms,
p95 172–251 ms; tabela completa em `needle-spike/README.md` (seção "Resultados").

As tarefas abaixo são registro histórico do que já foi medido — não são um plano de execução e
ninguém deve rodá-las de novo:

| Tarefa | Arquivos possuídos | Depende de | IDs | Agente |
| --- | --- | --- | --- | --- |
| N1 Dump dos schemas reais do wire para fixture | `needle-spike/dump-schemas.ts`, `needle-spike/fixtures/tool-schemas.json` | — | NDL-1 | task |
| N2 Acurácia de argumentos válidos (seletor + reparo) sobre prompt set rotulado | `needle-spike/run_needle.py`, `needle-spike/cases.jsonl` | N1 | NDL-2 | task |
| N3 Latência p50/p95 em CPU e veredito go/no-go (≥95% válidos, p95 < 150 ms) | `needle-spike/run_needle.py`, `needle-spike/README.md` | N2 | NDL-3 | task |

## Prompt pronto para colar

O bloco abaixo orquestra a implementação inteira (W0..W6): já traz os pré-requisitos, a ordem das
ondas, os portões e o protocolo todo → pass, então pode ser colado sem edição. Para executar uma
única tarefa, use a linha correspondente da tabela da onda como escopo e mantenha o mesmo protocolo.

```text
Você é o agente orquestrador do Code Mode no fork kaioposnky/omp em
/media/kaio/9EA6BABAA6BA91EF/Users/kposa/repos/harnesses-improver/oh-my-pi.

Objetivo: implementar o Code Mode por completo — W0 a W6 — em ondas sequenciais, com subagentes
`task` donos de arquivos exclusivos, portões de teste e revisão final por onda, conforme
docs/code-mode/architecture/orchestration.md.

Pré-requisitos (verifique antes de criar qualquer subagente; se um falhar, pare e reporte):
1. `git status --porcelain` vazio — todo WIP anterior já commitado em `truncated-tool-names`.
2. Crie a branch de trabalho a partir do HEAD atual: `git switch -c feat/code-mode`. Nada é
   commitado na `truncated-tool-names`.
3. Baseline: `cd packages/coding-agent && bun test test/code-mode/` termina com 0 fail e todos os
   IDs ainda em `it.todo`.
4. Arquivos quentes que exigem cuidado no rebase, porque já foram tocados por trabalho paralelo do
   usuário: `packages/coding-agent/src/sdk.ts`, `packages/coding-agent/src/system-prompt.ts`,
   `packages/coding-agent/src/prompts/system/system-prompt.md`,
   `packages/coding-agent/src/extensibility/settings.ts`,
   `packages/coding-agent/src/internal-urls/xd-protocol.ts`,
   `packages/coding-agent/src/internal-urls/skill-protocol.ts` e
   `packages/coding-agent/src/session/agent-session.ts`.
5. Needle está fechada como NO-GO: não existe onda de implementação e o spike não é reaberto.
6. W5.5 (A/B) só roda com aprovação explícita do usuário para modelos, orçamento de tokens/custo e
   número de repetições.

Leia primeiro, nesta ordem:
1. docs/code-mode/architecture/orchestration.md (ondas, arquivos possuídos, portões e regras)
2. docs/code-mode/architecture/testing.md (mapa de testes e protocolo todo -> pass)
3. docs/code-mode/architecture/contract.md (módulos, APIs, IDs e estilo dos testes)
4. docs/code-mode/macro/ (as funcionalidades) e docs/code-mode/micro/ (critérios de aceite)
5. docs/code-mode-plan.md §2-§4 e §10-§12 e docs/code-mode-requirements.md F1-F6

Regras invioláveis:
- Um dono por arquivo por onda. Nenhum subagente edita arquivo fora da lista da própria tarefa; a
  lógica nova fica em packages/coding-agent/src/code-mode/ e nos pontos de chamada.
- Nunca altere asserções de teste, nomes de ID ou o corpo dos it.todo para fazer um gate passar.
  Nunca rode a suíte inteira, lint ou format por causa de uma onda.
- Não reverta, formate ou descarte trabalho do usuário; conflito em arquivo quente se resolve
  preservando os dois lados.
- Commit por onda apenas depois do gate verde, na `feat/code-mode`.

Ordem e portões (cada linha é uma onda; a tabela da onda define tarefas, arquivos e IDs):
- W0: módulos puros `settings.ts`, `scope.ts`, `partition.ts`, `catalog.ts`, `hints.ts`.
  Gate: typecheck limpo + `bun test --todo test/code-mode/scope.test.ts` → CM-S1..CM-S10.
- W1: núcleo da partição — `session-tools.ts`, `sdk.ts`, `cli/args.ts`, prompt do eval e preludes
  JS/Python (gap.test.ts CM-G1..CM-G3 em `eval/js/shared/prelude.ts` e `eval/py/prelude.py`;
  CM-G4 no filtro de plan mode do bridge). Gates: partition.test.ts → CM-P1..CM-P7; gap.test.ts →
  CM-G1..CM-G4; toggle.test.ts com `--test-name-pattern CM-T2`.
- W2: toggle e indicador — `builtin-modes.ts`, `agent-session.ts`, `session-manager.ts`, RPC e
  `packages/tui/src/status-line/` + `theme/symbols.ts`. Gates: toggle.test.ts → CM-T1,
  CM-T3..CM-T7; indicator.test.ts → CM-I1..CM-I4.
- W3: escopo no runtime e spawn — `agent-bridge.ts`, `task/index.ts`, `task/structured-subagent.ts`,
  `task/types.ts`, `task/discovery.ts` e persistência de `codeMode.scope` em `code-mode/settings.ts`.
  Gates: spawn.test.ts → CM-A1..CM-A3; gap.test.ts com `--test-name-pattern CM-G6` → CM-G6.
- W4: skills, MCP, extensões e pi-jev — `custom-system-prompt.md`, `system-prompt.ts`, `sdk.ts`,
  `extensibility/extensions/` e `vendor/pi-jev/src/`. Gates: skills-mcp.test.ts → CM-C1..CM-C6;
  gap.test.ts com `--test-name-pattern CM-G5` → CM-G5; pi-jev com
  `node --test --import tsx test/code-mode.test.ts` (em `vendor/pi-jev`) → JEV-CM1..JEV-CM5 deixam de ser todo; JEV-CM6 continua passando.
- W5: economia de tokens — `code-mode/catalog.ts`, `code-mode/hints.ts`, `agent-session.ts`,
  `eval/js/executor.ts`, `eval/py/executor.ts`, `session-tools.ts` e, só com aprovação,
  `packages/metaharness/src/experiments.ts`. Gate: token-economy.test.ts → CM-E1..CM-E6.
- W6: RLM — `modes/controllers/input-controller.ts`, preludes JS/Python, `tools/context-notes.ts`,
  `task/seance.ts` e `eval/agent-bridge.ts`. Gates: rlm.test.ts → CM-R1..CM-R5; spawn.test.ts →
  CM-A4, CM-A5.

Protocolo todo -> pass, repetido por onda:
1. Rode o portão da onda (por exemplo `bun test --todo test/code-mode/partition.test.ts`) a partir
   de `packages/coding-agent`. A lista de todos que passam, reportados como falha, tem que ser
   exatamente os IDs-alvo da onda.
2. Remova o `.todo` somente dos IDs que passaram; rode sem `--todo` até ficar verde.
3. Rode `--todo` de novo para confirmar que sobraram apenas IDs de ondas futuras.
4. Typecheck: `cd packages/coding-agent && bunx tsgo -p tsconfig.json --noEmit`.
5. Feche a onda com um subagente `reviewer` (somente leitura) conferindo: arquivos possuídos,
   asserções intactas, nenhum ID renomeado e docs batendo com o código.
6. ID alvo que continua todo é falha silenciosa: o corpo do teste não exercita o comportamento ou a
   implementação está incompleta — investigue antes de seguir.

W5 para em W5.4 se a aprovação do A/B não existir; W5.5 e a decisão de `default: true` ficam
pendentes. Needle não entra na fila.

Relatório final: por onda, IDs que viraram verdes, comandos rodados com a saída relevante, arquivos
tocados, commits feitos na `feat/code-mode` e qualquer portão que não fechou com a causa exata. Não
peça confirmação para nada que o repositório responda.
```
