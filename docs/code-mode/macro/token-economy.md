# Economia de tokens — Macro

Parent: [architecture/index.md](../architecture/index.md)

## Purpose

Fazer o Code Mode pagar o próprio custo. O perfil troca N chamadas de tool por um único cell de `eval` e tira do wire os schemas de todas as tools que não sejam de sessão/controle. O ganho real não é o schema economizado (com cache quente ele vale pouco), e sim a eliminação de round-trips, a manutenção de um prefixo byte-estável e a disciplina de output: resultados intermediários ficam em variáveis do kernel e nunca entram no histórico. Esta funcionalidade define as quatro regras que produzem isso e como medi-las antes de qualquer default.

## Inputs / Outputs

| | O quê | De / Para |
|---|---|---|
| Input | Lista de tools habilitadas (top-level + bridge-only) | `packages/coding-agent/src/session/session-tools.ts#getEnabledToolNames` |
| Input | Resumos de tools montadas (uma linha) | `packages/coding-agent/src/tools/xdev.ts#renderXdevPromptDocs` |
| Input | Top-k tools/skills sugeridos por prompt | `packages/coding-agent/src/code-mode/hints.ts` |
| Input | Output bruto de cada cell | `packages/coding-agent/src/eval/js/executor.ts#executeJs` |
| Output | System prompt + wire de tools byte-estáveis durante a sessão | `packages/coding-agent/src/system-prompt.ts#buildSystemPrompt` |
| Output | Catálogo bridge-only ordenado (`name: summary`) | `packages/coding-agent/src/code-mode/catalog.ts#renderBridgeCatalog` |
| Output | Mensagem `customType: "router-hints"` após a mensagem do usuário, ≤ 600 tokens | `packages/coding-agent/src/code-mode/hints.ts` |
| Output | Overflow de output em artifact `artifact://N` | `packages/tui/src/tools/streaming-output.ts#OutputSink`, `packages/coding-agent/src/tools/output-meta.ts#resolveOutputSinkHeadBytes` |

## Modelo de custo

O custo de cada request é aproximadamente:

$$C \approx 0{,}1\cdot\underbrace{(P+H)_{\text{cache hit}}}_{\text{prefixo estável}} + 1{,}25\cdot\underbrace{\Delta_{\text{cache write}}}_{\text{o que mudou}} + 1{,}0\cdot U + k\cdot O$$

- $P$ = system prompt e schemas, $H$ = histórico, $U$ = tokens novos não cacheados, $O$ = output.
- Multiplicadores da Anthropic: hit $0{,}1\times$, write $1{,}25\times$. Outros providers diferem em valor, não em ordem de grandeza.

Consequências que o desenho explora, na ordem de peso:

1. Cada round-trip custa cerca de $0{,}1\cdot(P+H)$: com 60k de contexto, ~6k tokens-equivalentes por ida e volta. Um cell que substitui N chamadas vale mais que qualquer economia de schema.
2. Mudar o prefixo é o pior evento: reescreve todo o sufixo a $1{,}25\times$. `setActiveTools` por prompt (comportamento atual do pi-jev) faz exatamente isso.
3. Tirar schemas do prompt rende só $0{,}1\cdot\Delta P$ com cache quente — ganho secundário, não a justificativa.

Fonte da fórmula e da leitura: `docs/code-mode-plan.md` §12.1.

## Regras

1. **Prefixo congelado.** Top-level, system prompt, catálogo de tools e bloco de skills são definidos na criação da sessão e não mudam. `setActiveTools` de extensão só mexe na camada bridge-only, que não aparece no wire.
2. **Catálogos mínimos e busca sob demanda.** No wire ficam apenas `eval`/`wait`/`yield`/`ask`/`todo`/`checkpoint`/`rewind` (mais tools fixadas explicitamente). O resto vive num catálogo de uma linha por tool; `tool.describe(name)` devolve a assinatura e `tool.search(query, k)` devolve top-k.
3. **Router injeta no sufixo, nunca no prefixo.** As dicas do roteador viram uma mensagem `customType: "router-hints"` anexada **depois** da mensagem do usuário: top-k skills (`skill://<nome>`, k ≤ 3) e top-k tools bridge-only com assinatura TS inline (k ≤ 5), orçamento fixo de 600 tokens. Confiança abaixo do limiar não anexa nada.
4. **Disciplina de output no REPL.** Em Code Mode o limite inline por cell cai (ex.: 4 KB) e o resto vai para `artifact://N`. Resultados de `tool.*` nunca são impressos por padrão; só aparece o que o código imprime. O prompt instrui "atribua à variável, imprima resumo/contagem/amostra".

## Medição (A/B) antes de virar default

Braços definidos em `docs/code-mode-plan.md` §12.6, rodados com `packages/metaharness` — `packages/metaharness/src/launch-args.ts#harborRunnerArgs` aceita `extraArgs`, então o mesmo conjunto Harbor/TypeScript-edit roda com `extraArgs: []` e `extraArgs: ["--code-mode"]`, mesmo modelo e mesmas tarefas (`packages/metaharness/src/launch-args.ts#LaunchRequest`).

| Braço | Config |
|---|---|
| A (baseline) | modo normal, `tools.xdev` on, `skills.catalogMode: full`, jev desligado |
| B | Code Mode, sem router, catálogo de skills conforme o usuário |
| C | Code Mode + `catalogMode: search` + router hints (jev) no sufixo — **abordagem escolhida** |
| D | modo normal + jev atual (`setActiveTools` por prompt), para quantificar o custo de cache dele |

Métricas por tarefa: cache read, cache write, input não cacheado, output, nº de requests, sucesso e wall time. Hipóteses a confirmar: D tem o maior cache write; C < B < A em custo total; sucesso de C não fica abaixo de A. Critério para cogitar `codeMode.default: true`: custo menor e sucesso igual ou maior em pelo menos 2 modelos (um Anthropic e um OpenAI/Codex). Rodar com `skill://eval-change-noise-vs-signal` (t-test) para não confundir ruído com ganho — `docs/code-mode-plan.md` §7.

## Entry points

- `packages/coding-agent/src/system-prompt.ts#buildSystemPrompt` → monta `P` uma vez por sessão.
- `packages/coding-agent/src/session/session-tools.ts#getEnabledToolNames` → fonte única do que existe (não do que aparece no wire).
- `packages/tui/src/tools/streaming-output.ts#OutputSink` → aplica o orçamento inline e grava o overflow em artifact.
- `packages/coding-agent/src/tools/output-meta.ts#resolveOutputSinkHeadBytes` → resolve o head inline a partir de settings.

## Dependencies

- Núcleo: [macro/core.md](core.md) — a partição define o que sai do wire.
- Integração: [macro/integration.md](integration.md) — o catálogo bridge-only substitui o bloco "MCP Tool Routes" e o router do pi-jev passa a só sugerir.
- Fork/RLM: [macro/spawn.md](spawn.md), [macro/rlm.md](rlm.md) — ambos consomem o mesmo orçamento de contexto.

## Requirements

- [micro/token-economy-prefix-freeze.md](../micro/token-economy-prefix-freeze.md)
- [micro/token-economy-minimal-wire.md](../micro/token-economy-minimal-wire.md)
- [micro/token-economy-router-hints.md](../micro/token-economy-router-hints.md)
- [micro/token-economy-output-discipline.md](../micro/token-economy-output-discipline.md)
- [micro/token-economy-model-behaviors.md](../micro/token-economy-model-behaviors.md) — comportamento por modelo no Code Mode (evidência, não requisito)
