# Code Mode — Testes e aceite — Arquitetura

Parent: [index.md](index.md)

## Purpose

Esta página é o mapa de verificação do Code Mode: qual arquivo de teste cobre qual requisito, como
rodar, como um `it.todo` vira teste verde e qual comando de typecheck precisa passar antes de
qualquer gate. Ela existe para que um agente de implementação saiba exatamente o que rodar — e não
rode a suíte inteira.

Todos os IDs abaixo são fixos. Os testes já existem como `it.todo(nome, fn)` com corpo real; o nome
sempre começa pelo ID (`"CM-P1 code mode advertises only the top-level set"`).

## Mapa arquivo → IDs → o que prova

| Arquivo | IDs | O que prova |
| --- | --- | --- |
| `packages/coding-agent/test/code-mode/partition.test.ts` | CM-P1..CM-P7 | Partição F1: só o topo no wire, bridge alcança o resto, `checkpoint`/`rewind`/`yield`/`ask`/`todo` ficam top-level, MCP tardio e reconcile não perdem a camada bridge-only, fallback sem eval, aprovação preservada. |
| `packages/coding-agent/test/code-mode/toggle.test.ts` | CM-T1..CM-T7 | Liga/desliga F2: `codeMode.default`, flags `--code-mode`/`--no-code-mode`, persistência em sessão, resume contra default oposto, fork, spec `/code-mode` com `on/off/status/default`, campo `codeModeEnabled` no RPC. |
| `packages/coding-agent/test/code-mode/indicator.test.ts` | CM-I1..CM-I4 | Indicador F3: ícone quando ativo, ícone esmaecido na divergência regra × estado, validação do campo `codeMode` no snapshot de startup, símbolo `icon.codeMode` nos dois conjuntos de tema. |
| `packages/coding-agent/test/code-mode/scope.test.ts` | CM-S1..CM-S10 | Escopo F4 puro: escada de precedência, gates duros, frontmatter sem `eval`, glob de modelo (primeiro match), role, não-herança do pai, defaults de fábrica, validação de settings, `source`/`detail` para `/code-mode status`, lista restrita sem `eval`. |
| `packages/coding-agent/test/code-mode/skills-mcp.test.ts` | CM-C1..CM-C6 | Integração F6: bloco de skills continua no prompt, `skill://<name>` legível pelo `read` bridgeado, sem bloco `xd://` de MCP, `setActiveTools` de extensão não muda o wire, `pi.isCodeModeActive()`. |
| `packages/coding-agent/test/code-mode/token-economy.test.ts` | CM-E1..CM-E6 | Economia §12: prefixo congelado, wire menor que o normal, catálogo estável com colapso `mcp__<server>__*` acima de 20 tools, dicas depois da mensagem do usuário, teto de 600 tokens nas dicas, teto de saída inline do eval. |
| `packages/coding-agent/test/code-mode/spawn.test.ts` | CM-A1..CM-A5 | Spawn: `agent({ codeMode })` e item de `task` aceitam o parâmetro, negação com motivo `codeMode ignored: agent has no eval`, `agent({ fork: true })` e falha clara sem sessão pai persistida. |
| `packages/coding-agent/test/code-mode/rlm.test.ts` | CM-R1..CM-R5 | RLM: paste grande vira `local://paste-N.md`, `inputs["paste-N"]` lazy, `elide` só com `compaction.experimentalContextManagement`, blanking com `[Elided by model - N tokens]` e adiamento por cache quente. |
| `packages/coding-agent/test/code-mode/gap.test.ts` | CM-G1..CM-G6 | Lacunas de descoberta e restrição: `tool.describe`/`tool.search` nas preludes JS (CM-G1/G2) e Python (CM-G3), plan mode restringindo o alcance do bridge sem desligar o modo (CM-G4), hook `tool_call` disparado exatamente uma vez com o nome da tool interna em chamada bridgeada (CM-G5) e round-trip de `codeMode.scope` pelo caminho de persistência do `Settings` lido de volta por `resolveCodeMode` (CM-G6). |
| `vendor/pi-jev/test/code-mode.test.ts` | JEV-CM1..JEV-CM6 | pi-jev sob Code Mode: `McpGate` não chama `setActiveTools`, auto-ativação do router devolve nomes, `jev_find_tools` sugere `tool.<name>`, `ToolGuard` ignora `eval`, hint em `skill://<name>`, fallback quando o host não tem `isCodeModeActive`. |
| `harnesses-improver/needle-spike/` | NDL-1..NDL-3 | Spike da Needle 3: dump dos schemas reais, acurácia de argumentos válidos sobre prompt set rotulado, latência p50/p95 em CPU e veredito go/no-go (≥95% válidos, p95 < 150 ms). Resultado medido: **NO-GO** (seletor 10–20%, reparo 20%, p95 172–251 ms). |

### Contagem de IDs

Recontagem feita de `packages/coding-agent` com

```bash
rg -o 'it\.todo\("CM-' test/code-mode/*.test.ts | wc -l
```

dá **56** todos `CM-*` em `test/code-mode/`: CM-P 7, CM-T 7, CM-I 4, CM-S 10, CM-C 6, CM-E 6,
CM-A 5, CM-R 5 e CM-G 6. À parte, de `vendor/pi-jev`,

```bash
rg -c 'todo: "code-mode"' test/code-mode.test.ts
```

dá **5** todos `JEV-CM*` — JEV-CM6 é guarda de regressão, roda sempre e não é todo. O total de todos
é **61**. Sem `gap.test.ts`, a contagem em `test/code-mode/` dá 50.

## Como rodar

Os testes de `packages/coding-agent` rodam do diretório do pacote, porque o `tsconfig` e os
caminhos relativos do `bun:test` são resolvidos ali:

```bash
cd packages/coding-agent
bun test test/code-mode/partition.test.ts             # suíte normal (todos viram skip)
bun test --todo test/code-mode/partition.test.ts      # executa os todo e denuncia todo que passa
bun test --todo -t CM-P4 test/code-mode/partition.test.ts   # um ID isolado
```

- **`bun test <arquivo>`**: `it.todo` é ignorado; os testes já destravados rodam e precisam passar.
- **`bun test --todo <arquivo>`**: executa os `it.todo`. Um todo cujo corpo **passa** é reportado
  como falha — esse é o sinal de "já implementado, remova o `.todo`". Um todo cujo corpo falha
  permanece todo e sai como sucesso da execução de todos. Portanto a saída de `--todo` lista
  exatamente os IDs prontos.
- Do repositório-raiz o mesmo arquivo roda com prefixo de caminho
  (`bun test packages/coding-agent/test/code-mode/partition.test.ts`), mas o gate oficial usa o
  diretório do pacote.
- `vendor/pi-jev/test/code-mode.test.ts` usa `node:test` e a forma
  `test(name, { todo: "code-mode" }, fn)`; roda com `bun test` (ou `node --test`) dentro de
  `vendor/pi-jev`. O sinal é o mesmo: um todo que passa precisa perder a opção `todo`.
- `harnesses-improver/needle-spike/` não é teste de unidade: são scripts de medição. NDL-1 gera o
  fixture, NDL-2 mede acurácia, NDL-3 mede latência; o aceite é o relatório com os números — o
  veredito atual é **NO-GO**, em `needle-spike/README.md`.

## Protocolo todo → pass

1. Implemente apenas os arquivos da sua tarefa (ver [orchestration.md](orchestration.md)).
2. Rode o gate da onda:
   `cd packages/coding-agent && bun test --todo test/code-mode/<arquivo>.test.ts`.
3. A saída deve falhar **somente** nos IDs que a sua onda lista como alvo. ID alvo que continua
   todo falhou silenciosamente: o corpo não exercita o comportamento, ou a implementação está
   incompleta.
4. Remova o `.todo` exatamente dos IDs que passaram (`it.todo(` → `it(`) e rode sem `--todo`:
   `bun test test/code-mode/<arquivo>.test.ts` precisa ficar verde.
5. Rode `--todo` outra vez e confirme que a lista de falhas agora contém apenas os IDs de ondas
   posteriores.
6. O gate final é um agente `reviewer` lendo o diff da onda e conferindo que nenhum arquivo de
   outra tarefa da mesma onda foi tocado.

Nunca "conserte" um teste mudando a asserção: o ID e o comportamento descrito no contrato são
fixos. Se um ID for inalcançável por interface pública, ele permanece `it.todo` com um comentário
dizendo qual API planejada falta — nunca vira teste de texto-fonte.

## Typecheck

Obrigatório antes de fechar qualquer onda:

```bash
cd packages/coding-agent && bunx tsgo -p tsconfig.json --noEmit
```

Os testes usam import dinâmico com interface de contrato local para módulos `[planned]`, então a
árvore compila hoje sem os módulos existirem. Ao implementar, o import dinâmico pode virar import
estático — desde que o typecheck continue limpo e a asserção continue sendo comportamental.

## Regras de estilo dos testes

- Comportamento observável apenas por interface pública: `createAgentSession`,
  `session.agent.state.tools`, `session.systemPrompt`, `getToolForEvalBridge`, `parseArgs`,
  `renderSegment`, `ExtensionFactory`.
- Proibido: asserção sobre texto-fonte, teste que só verifica wiring, snapshot de arquivo.
- Fixtures reaproveitadas de `packages/coding-agent/test/tan-tool-presentation.test.ts`:
  `createAgentSession` com `enableMCP: false`, `disableExtensionDiscovery: true`,
  `skipPythonPreflight: true`, `mcpTools`, `Settings.isolated`, `SessionManager.inMemory`, `TempDir`.
- Settings planejados são passados por id string (`Settings.isolated({ "codeMode.default": true })`),
  não por import de símbolo inexistente.

## Constraints

- Não rode a suíte inteira nem lint/format por causa do Code Mode: o gate é o arquivo da onda.
- Não edite testes de outra onda para "fazer o gate passar".
- Não adicione IDs novos: o contrato é a fonte única; docs, testes e implementação citam os mesmos
  IDs.
