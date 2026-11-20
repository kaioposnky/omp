# Code Mode no omp: plano de alterações

> Proposta de design. Base: fork `kaioposnky/omp` em `3231d5e26c`. Inspiração: vídeo "Code Mode Is Claude Code's BIGGEST Harness Change Yet" (Ray Amjad, 2026-11-16) e o artigo da Cloudflare "Code Mode: the better way to use MCP".

## 1. Objetivo

Expor ao modelo um conjunto mínimo de tools (`eval` + `wait` + controle de sessão). Todas as demais tools (read, edit, bash, grep, MCP, devices `xd://`) continuam executáveis, mas apenas como funções `tool.<name>(args)` dentro do kernel do `eval`. Resultados intermediários ficam em variáveis do kernel e só o que o modelo imprimir volta ao contexto.

Ganho esperado (não medido no omp): menos tokens de schema por request, menos round-trips e menos tool output no histórico. O vídeo reporta ~50% menos input e ~29% menos custo no Claude Code. O omp já tem `eval` com bridge, `xd://` e pruning, então o ganho marginal precisa ser medido (seção 7) antes de virar default.

## 2. O que já existe (não reimplementar)

| Capacidade | Onde |
| --- | --- |
| REPL persistente JS/Python | `packages/coding-agent/src/eval/` (`js/`, `py/`, `kernel-base.ts`) |
| Tools como funções (`tool.<name>`) | `eval/js/tool-bridge.ts`, `eval/py/tool-bridge.ts` |
| MCP via bridge | `eval/js/tool-bridge.ts` (ramo `mcpServerName`) |
| Gate de permissão do bridge | `SessionTools.getToolForEvalBridge` (`session/session-tools.ts:687`) |
| Subagentes programáticos | `agent()`/`workpool()`: `eval/agent-bridge.ts`, `eval/workpool-bridge.ts` |
| Background/poll | auto-background do eval, `wait`, `proc://` |
| Tools fora do schema, sob demanda | `xd://` (`tools/xdev.ts`, setting `tools.xdev`) |
| Fork de sessão | `SessionManager.forkFrom` (`session/session-manager.ts:4054`), `task/seance.ts` |
| Blanking de tool results | `blankToolResult`, `pruneToolOutputs`, `pruneSupersededToolResults` (`packages/agent/src/compaction/pruning.ts`) |
| Paste grande para arquivo | `#attachPasteAsFile` (`modes/controllers/input-controller.ts:2574`) |
| A/B de harness | `packages/metaharness` (`launch-args.ts` aceita `extraArgs`) |

## 3. Restrições descobertas no código

1. **O bridge só alcança tools habilitadas.** `getToolForEvalBridge` retorna `undefined` quando o nome não está em `getEnabledToolNames()`, que é a união das tools ativas (top-level) e dos `xdev.mountedNames`. Por isso `--tools=eval,wait` **não** implementa Code Mode: `tool.edit(...)` passaria a falhar com `Unknown tool from js runtime`.
2. **`--tools` estreita o próprio registro** (`cli/args.ts:446-449`). O filtro não distingue "visível ao LLM" de "existe na sessão".
3. **`checkpoint` e `rewind` não funcionam via bridge.** Eles são bloqueados em `eval/js/tool-bridge.ts:269` porque a sessão só os reconhece como `toolResult` direto, então precisam continuar top-level.
4. **`yield` (subagentes), `ask` e `todo`** têm semântica de sessão ou UI e ficam top-level. Já estão em `XDEV_KEEP_TOP_LEVEL` (`tools/xdev.ts:58`), com exceção de `grep` e `web_search`, que no Code Mode devem ir para o bridge.
5. **O xdev já tem a camada certa.** Tools montadas saem do schema e continuam em `getEnabledToolNames()`, portanto continuam alcançáveis pelo bridge. Code Mode é, essencialmente, uma nova política de partição sobre essa mesma infraestrutura.
6. **Seance recusa `eval`.** `prepareSeance` lança erro se `invocationKind !== "task"` (`task/seance.ts:232`) e também recusa isolation e custom tools.

## 4. Fase 1: perfil Code Mode (núcleo)

### 4.1 Setting e flag

- `packages/coding-agent/src/tools/settings.ts`: registrar `cfgToolsCodeMode` (`id: "tools.codeMode"`, `boolean`, default `false`, grupo "Discovery & MCP"), no mesmo padrão de `cfgToolsXdev`.
- `cli/flag-tables.ts`: adicionar a flag `--code-mode`, que liga o setting apenas na sessão.
- Pré-condição: o backend do `eval` precisa estar disponível (`tools/eval-backends.ts`). Sem ele, logar um aviso e manter o modo normal. Code Mode sem interpretador deixaria a sessão sem tools úteis.

### 4.2 Nova camada de apresentação "bridge-only"

Em `session/session-tools.ts`:

- Adicionar `#bridgeOnlyToolNames: Set<string>`, paralelo a `xdev.mountedNames`.
- `getEnabledToolNames()` passa a unir `base ∪ mountedNames ∪ bridgeOnlyToolNames`. Assim o gate de permissão (`#wrapToolForAcpPermission`) continua idêntico para chamadas diretas e via bridge.
- `getEvalBridgeToolNames()` não precisa de mudança porque já delega para `getEnabledToolNames()`.
- Em `setActiveToolsByName`, preservar a camada bridge-only como hoje se preservam os mounts. Ver o comentário em `getEnabledToolNames` sobre mounts "out-of-band".

Por que não reutilizar `xdev.mountedNames`: tools montadas também são anunciadas como devices `xd://` e exigem `read`/`write` top-level como transporte (`XDEV_TRANSPORT_TOOLS`). No Code Mode `read` e `write` são justamente as tools que queremos tirar do schema.

### 4.3 Partição em `sdk.ts`

No bloco que hoje particiona para o xdev (`sdk.ts:~4290-4318`, antes de `setSessionActiveToolNames(initialToolNames)`):

```ts
const CODE_MODE_TOP_LEVEL = new Set(["eval", "wait", "yield", "ask", "todo", "checkpoint", "rewind"]);
if (codeMode) {
  const top: string[] = [];
  const bridgeOnly: string[] = [];
  for (const name of initialToolNames) {
    (CODE_MODE_TOP_LEVEL.has(name) || presentationPinnedToolNames?.has(name) ? top : bridgeOnly).push(name);
  }
  // mounts do xdev também viram bridge-only: o modelo não terá read/write para usá-los
  bridgeOnly.push(...(toolSession.xdev?.mountedNames ?? []));
  toolSession.xdev?.mountedNames.clear();
  initialToolNames = top;
  // repassar bridgeOnly ao SessionTools
}
```

- Code Mode vence `tools.xdev`: com ambos ligados, o xdev não monta nada porque o transporte foi removido.
- MCP tools descobertas depois (`collectPendingMCPToolNames`, `sdk.ts:3620`) também entram em bridge-only. O caminho de reconcile das MCP (`sdk.ts:~5028`) precisa checar o modo.
- Tools pedidas explicitamente pelo usuário (`presentationPinnedToolNames`) ficam top-level, como no xdev.

### 4.4 Prompt

- `prompts/tools/eval.md`: adicionar um bloco `{{#if codeMode}}` que declara que o eval é a interface principal e lista o **catálogo** das tools bridge-only (nome + resumo de uma linha, sem schema). Reutilizar o gerador de catálogo do xdev (`renderXdevPromptDocs` em modo `catalog`, `sdk.ts:4048-4070`).
- Schemas sob demanda: adicionar ao prelude JS/Python um helper `tool.describe(name)` que retorna o schema TS da tool via `jsonSchemaToTypeScript` (já importado em `tools/xdev.ts`). Esse helper equivale ao `search` da Cloudflare.
- O system prompt não deve mais instruir "use `read` para arquivos". Revisar os trechos que citam tools diretas (`prompts/system/*.md`) sob `{{#unless codeMode}}`.

### 4.5 Renderização (TUI)

Cada `tool.*` já emite status via `emitStatus`, e as chamadas aninhadas aparecem no card do eval. Verificar se um card de eval com N edits continua legível e se diffs de `edit` aparecem. Se não aparecerem, delegar o renderer da tool interna, como o xdev faz com `XdevDispatch`.

### 4.6 Aprovação

O modo de aprovação (`docs/approval-mode.md`) já se aplica ao bridge porque `getToolForEvalBridge` passa por `#wrapToolForAcpPermission`. Teste obrigatório: com aprovação ligada, `tool.edit` dentro do eval precisa pedir confirmação.

## 5. Fase 2: fork da conversa a partir do eval

Objetivo: permitir o padrão "fork N vezes, explorar abordagens, devolver as melhores".

- `eval/agent-bridge.ts`: adicionar `"fork?": "boolean"` a `agentArgsSchema` e a `EvalAgentArgs`, e repassar a `runStructuredSubagent`.
- `task/structured-subagent.ts:~382`: quando `fork === true`, montar o `PreparedSeanceSession` com a sessão **atual** como `sourceSession` (`request.session.getSessionFile()`).
- `task/seance.ts:232`: aceitar `invocationKind === "eval"` quando a origem é a própria sessão. A recusa de isolation continua. A recusa de custom tools pode ser relaxada só se `createEvalCustomTools` funcionar na sessão forkada, o que precisa ser testado.
- Pré-requisito: a sessão precisa estar persistida. `task/executor.ts:4512` já falha com "requires a persisted child session file". Propagar essa mensagem ao modelo.
- Custo: cada fork re-lê o histórico inteiro, com cache frio no primeiro request. Documentar no `prompts/tools/eval-agents.md` que fork é caro e deve ser usado com N pequeno.
- Prompt: em `eval-agents.md`, adicionar `fork?=False` à assinatura de `agent(...)`.

## 6. Fase 3: RLM e contexto como dado

### 6.1 Input grande como variável

- `modes/controllers/input-controller.ts`: `#attachPasteAsFile` já grava `local://paste-N.md`. Criar um setting `input.largeInputAsHandle` (limite em tokens) que aplica esse caminho automaticamente, sem passar pelo menu, quando o paste ou o arquivo anexado exceder o limite.
- No lugar do texto, o modelo recebe: `local://paste-3.md (≈1.8M tokens, 41k linhas). Disponível no eval como inputs["paste-3"].`
- Prelude JS/Python: expor `inputs` como mapa lazy de handles (`read()` sob demanda), sem carregar o conteúdo na criação do kernel.
- Vale também fora do Code Mode, mas só faz sentido se o eval estiver disponível.

### 6.2 Edição de contexto pelo modelo

- Nova tool `elide` em `tools/context-notes.ts` (ao lado de `context_notes`/`new_context`), com o mesmo gate: `compaction.experimentalContextManagement` (`session/context-settings.ts:119`).
- Input: `{ toolCallIds: string[], reason?: string }`.
- Implementação: para cada id, aplicar `blankToolResult` (`pruning.ts:98`) com aviso `[Elided by model - N tokens]` e chamar `sessionManager.rewriteEntries()`. Seguir `#pruneToolOutputs` em `session/session-maintenance.ts:717`.
- Proteções a reaproveitar: `keepBoundaryId` (não reescrever antes da última compactação), `#withPlanProtection`, a exclusão de `skill://` e o piso `MIN_PRUNE_TOKENS`.
- Cache: cada elide invalida o prefixo a partir da primeira mensagem alterada. Reaproveitar o `cacheLookbackFloor` de `pruneSupersededToolResults` para **adiar** o blanking até o idle passar do TTL do cache, ou até que o sufixo seja pequeno. A tool responde "agendado" em vez de aplicar na hora quando aplicar quebraria um cache quente.
- O histórico continua recuperável via `history://` e artifacts, então o elide não destrói informação.

## 7. Medição antes de virar default

- `packages/metaharness`: rodar o mesmo conjunto Harbor/TypeScript-edit com `extraArgs: []` e com `extraArgs: ["--code-mode"]`, mesmo modelo e mesmo seed de tarefas.
- Métricas: input tokens (cache e não-cache), output tokens, custo, taxa de sucesso, wall time, nº de requests.
- Critério para cogitar `default: true`: custo menor e sucesso igual ou maior em pelo menos 2 modelos (um Anthropic e um OpenAI/Codex), porque a fluência em escrever código no REPL varia por modelo.
- Usar o skill `eval-change-noise-vs-signal`, com t-test, para não confundir ruído com ganho.

## 8. Testes

Testes novos que pegam bugs visíveis ao usuário:

| Teste | Arquivo sugerido | Garante |
| --- | --- | --- |
| Code Mode remove `read`/`edit`/`bash`/MCP do schema e mantém `eval`, `wait`, `checkpoint`, `rewind` | `test/tools/code-mode.test.ts` | partição |
| `tool.edit` via eval funciona em Code Mode | idem | bridge-only alcançável |
| `tool.edit` via eval pede aprovação com approval mode ligado | idem | gate de permissão preservado |
| MCP descoberta depois do startup vira bridge-only | idem | reconcile |
| `setActiveToolsByName` (ex.: entrar em goal mode) não perde a camada bridge-only | idem | regressão do comentário em `getEnabledToolNames` |
| Code Mode sem backend de eval cai no modo normal | idem | sessão não fica sem tools |
| `agent(..., fork=True)` filho enxerga mensagens anteriores do pai | `test/eval/agent-fork.test.ts` | fase 2 |
| `elide` não toca entradas antes de `keepBoundaryId` nem `skill://` | `test/session/elide.test.ts` | fase 3 |

Testes existentes que podem quebrar: os de `tan-tool-presentation.test.ts` e `test/tools/index.test.ts` que enumeram a lista de tools ativas. Atualizar apenas se o contrato mudar, o que só acontece com o setting ligado.

## 9. Documentação a atualizar

- `docs/tools/eval.md`: seção "Code Mode" (camada bridge-only, `tool.describe`, `fork`).
- `docs/settings.md`: `tools.codeMode`, `input.largeInputAsHandle`.
- `docs/cli-reference.md`: `--code-mode`.
- `docs/tools/elide.md`: nova página, no formato de `docs/tools/new-context.md`.
- `docs/compaction.md`: interação entre `elide` e pruning automático.

## 10. Ordem sugerida de PRs

1. Camada bridge-only em `SessionTools`, com testes, sem mudança de comportamento.
2. Setting, flag e partição em `sdk.ts`, com prompt, `tool.describe` e catálogo compacto (§12.3).
3. `setActiveTools` estável em Code Mode (§12.2, RF6.3) e `pi.isCodeModeActive()`.
4. Canal de sugestões no sufixo (§12.4) e ajustes no pi-jev (RF6.5).
5. Rodada de A/B no metaharness com os braços de §12.6, com a decisão registrada neste doc.
6. `agent(fork=True)`.
7. Input grande como handle.
8. `elide`.

Os itens 1–5 entregam o Code Mode do vídeo com custo de cache controlado. Os itens 6–8 são a parte "RLM", independentes entre si.

## 11. Riscos

- **Modelos fracos em código**: modelos `smol`/`tiny` podem errar a sintaxe do REPL com mais frequência do que errariam um tool call JSON. Por isso o Code Mode não deve ser herdado automaticamente por subagentes `sonic`/`scout`. Decisão: ele vale só para a sessão principal, a menos que o agent frontmatter o peça.
- **Visibilidade para o usuário**: edits aninhados dentro de um card de eval são menos auditáveis que cards de `edit`. Mitigar com a seção 4.5.
- **Cache**: o eval com prints grandes também infla o contexto. O ganho depende de o modelo imprimir pouco, e o prompt deve reforçar isso.
- **Merge com upstream**: `sdk.ts` e `session-tools.ts` são arquivos quentes no upstream. Manter a mudança concentrada num helper (`applyCodeModePartition`) para reduzir conflitos no `oh-my-pi-fork-release-sync`.

## 12. Estratégia de economia de tokens (decisão)

### 12.1 Modelo de custo

O custo de cada request é aproximadamente:

$$C \approx 0{,}1\cdot\underbrace{(P+H)_{\text{cache hit}}}_{\text{prefixo estável}} + 1{,}25\cdot\underbrace{\Delta_{\text{cache write}}}_{\text{o que mudou}} + 1{,}0\cdot U + k\cdot O$$

- $P$ = system prompt e schemas, $H$ = histórico, $U$ = tokens novos não cacheados, $O$ = output.
- Multiplicadores da Anthropic: hit 0,1×, write 1,25×. Outros providers diferem, mas a ordem de grandeza é a mesma.

Consequências diretas para o design:

1. **Cada round-trip custa cerca de $0{,}1\cdot(P+H)$**: com 60k de contexto, são ~6k tokens-equivalentes. Economizar uma ida e volta vale mais que economizar algumas centenas de tokens de prompt. Esse é o ganho real do Code Mode: N chamadas viram um cell, e resultados intermediários nunca entram em $H$.
2. **Mudar o prefixo é o pior evento possível.** Qualquer alteração em $P$ (schema de tools, system prompt) reescreve todo o sufixo a 1,25×. O comportamento atual do jev (`setActiveTools` por prompt) faz exatamente isso.
3. **Tirar schemas do prompt economiza pouco com cache quente**, só $0{,}1\cdot\Delta P$ por request. Ainda vale a pena, mas é o ganho secundário.

### 12.2 Regra 1: prefixo congelado

- Top-level, system prompt, catálogo de tools e bloco de skills são definidos na criação da sessão e não mudam até o fim (RNF2.1 dos requisitos).
- Em Code Mode, `setActiveTools` de extensões só mexe na camada bridge-only (RF6.3), que não aparece no wire. O resultado é zero cache miss causado pelo router.
- O catálogo bridge-only é gerado em ordem estável (nome ordenado). MCP descoberta tarde entra no bridge e **não** reescreve o catálogo do prompt. O modelo a encontra via `tool.search(q)` (§12.3).

### 12.3 Regra 2: catálogos mínimos e busca sob demanda

| Item | Hoje | Em Code Mode |
| --- | --- | --- |
| Schemas de tools | JSON schema por tool no wire | só `eval`/`wait`/`yield`/`ask`/`todo`/`checkpoint`/`rewind` |
| Tools bridge-only | — | uma linha por tool, `nome: resumo` (≤ 12 palavras, reaproveitando a compressão de `extensibility/skill-descriptions.ts`) |
| MCP | bloco "MCP Tool Routes" | entra no catálogo acima; servidores com > 20 tools aparecem como `mcp__<server>__* (N tools)`, e os nomes vêm de `tool.search` |
| Skills | lista `nome: descrição` ou `catalogMode: search` | `skills.catalogMode: search` **forçado** quando há router (jev); sem router, mantém a configuração do usuário |

- Novo helper no prelude: `tool.search(query, k=5)` retorna nome, resumo e assinatura TS. Ele substitui listar tudo e reaproveita a busca por palavra-chave do `skill://?q=`.
- Medição local: as descrições completas das 315 skills instaladas somam **22,4k tokens** em `claude-v5` (`omp toks` no frontmatter de `~/.omp/agent/skills` + `managed-skills`). A lista comprimida que vai ao prompt é menor, estimada em 8–12k [INFERENCE]. Em modo `search`, esse bloco cai para ~100 tokens.

### 12.4 Regra 3: o router injeta no sufixo, nunca no prefixo

O jev (ou a Needle, F5) passa de "ativador de tools" a "anexador de dicas":

- No `before_agent_start`, o router devolve uma mensagem `customType: "router-hints"` anexada **depois** da mensagem do usuário, contendo:
  - top-k skills (`skill://<nome>`, k ≤ 3) e
  - top-k tools bridge-only **com a assinatura TS já inline** (k ≤ 5, ~60 tokens cada).
- Incluir a assinatura evita o round-trip de `tool.describe`, que segundo §12.1 custa muito mais que os ~300 tokens das dicas.
- Mensagens antigas de dicas são candidatas a `pruneSupersededToolResults` / `USELESS_NOTICE` quando ficam fora da janela de lookback do cache, como os resultados obsoletos já são tratados (`docs/compaction.md`).
- O router tem orçamento fixo: hints ≤ 600 tokens por prompt. Se a confiança for menor que o limiar, não anexa nada.
- Precisa de RF6.4 (`pi.isCodeModeActive()`) e RF6.5 (pi-jev).

### 12.5 Regra 4: disciplina de output no REPL

- Em Code Mode, o truncamento de output por cell fica mais agressivo: `eval` com limite padrão menor (ex.: 4 KB inline), e o restante vai para artifact (`artifact://N`), que já existe.
- Instrução no prompt: "atribua a variável, imprima resumo/contagem/amostra". É o comportamento descrito no vídeo e a principal alavanca de $H$.
- Resultados de `tool.*` nunca são impressos por padrão. Só aparece o que o código imprime.

### 12.6 Como validar (braços do A/B)

| Braço | Config |
| --- | --- |
| A (baseline) | modo normal, `tools.xdev` on, `skills.catalogMode: full`, jev desligado |
| B | Code Mode, sem router, catálogo de skills conforme o usuário |
| C | Code Mode + `catalogMode: search` + router hints (jev) no sufixo |
| D | modo normal + jev atual (`setActiveTools` por prompt), para quantificar o custo de cache dele |

Métricas por tarefa: cache read, cache write, input não cacheado, output, nº de requests, sucesso e wall time. Hipóteses [INFERENCE, a confirmar]: D tem o maior cache write; C < B < A em custo total; e o sucesso de C não fica abaixo do de A.

### 12.7 Decisão

**Abordagem escolhida: C.** Prefixo congelado, catálogos mínimos, router como fonte de dicas no sufixo e REPL com output disciplinado. Ela ataca as três parcelas de custo na ordem de peso: round-trips e $H$ (Code Mode e disciplina de output), cache writes (prefixo congelado) e $P$ (catálogos mínimos). A consequência para o jev é que ele deixa de chamar `setActiveTools` em Code Mode e passa a só anexar dicas. Ele continua sendo o componente que decide o que é relevante, sem custar cache.
