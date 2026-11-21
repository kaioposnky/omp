# Capacidade de leitor de `skill://` no Code Mode — Nano

Parent: [micro/integration-skills-catalog.md](../micro/integration-skills-catalog.md)

Code: `packages/coding-agent/src/system-prompt.ts#toolReadsSkillUris`, `packages/coding-agent/src/system-prompt.ts#buildSystemPrompt`, `packages/coding-agent/src/system-prompt.ts#buildSystemPromptToolMetadata`, `packages/coding-agent/src/eval/js/shared/prelude.txt#read`, `packages/coding-agent/src/code-mode/partition.ts#CODE_MODE_TOP_LEVEL`

## How it works

`buildSystemPrompt` decide se o bloco de skills existe a partir da presença de um **leitor**: percorre os nomes ativos e chama `toolReadsSkillUris(tool)`; o resultado vira `skillReaderName` e, com `skills.length > 0`, `hasSkillUriAccess = true`. Sem leitor, `visibleSkills` fica vazio e o bloco some.

No Code Mode, `read` sai do wire, mas `eval` fica. O caminho é: (1) a partição garante `eval` no conjunto avaliado pelo prompt; (2) a metadata de prompt projeta `readsSkillUris: true` para `eval` quando o modo está ativo — `buildSystemPromptToolMetadata` já aceita override (`readsSkillUris`); (3) o prompt passa a instruir `read("skill://<nome>")`/`await read("skill://<nome>")`. A leitura funciona porque o prelude delega qualquer URI com esquema para a tool `read` (`shouldDelegateRead`), e o bridge alcança `read` por `getToolForEvalBridge`.

## Invariants

- O bloco de skills nunca contém corpo de skill: apenas `nome: descrição`.
- `hasSkillUriAccess` só é verdadeiro com leitor **e** skills não vazias.
- Skills com `hide: true` nunca aparecem na lista, mas permanecem legíveis por `skill://`.
- `skills.catalogMode: "search"` troca lista por busca; não remove o requisito de leitor.
- A projeção de capacidade não pode alterar o wire: `eval` continua com o mesmo schema.

## Gotchas

- O ramo `tools === undefined` de `buildSystemPrompt` só reconhece `toolNames.includes("read")`; qualquer chamador que passe apenas nomes (sem registry) derruba o bloco em Code Mode. Preferir o ramo com registry.
- Marcar `eval` como leitor sem condicionar ao Code Mode muda o prompt do modo normal para sessões que tenham `eval` — mudança de comportamento fora do escopo RNF2.1.
- O override de metadata é por tool projetada (`buildSystemPromptToolMetadata`); esquecer de propagá-lo ao rebuild pós-descoberta MCP faz o bloco oscilar entre requests (quebra `CM-E1`).
- `skill://?q=` (busca) usa o mesmo leitor; se a projeção só cobrir `skill://<nome>`, a busca falha silenciosamente.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/system-prompt.ts` (projeção de `readsSkillUris` para `eval` quando `codeMode`), `packages/coding-agent/src/sdk.ts` (passar o estado Code Mode ao build do prompt), `packages/coding-agent/src/code-mode/partition.ts` (`CODE_MODE_TOP_LEVEL`).
- **Passos**:
  1. Adicionar ao build do prompt a noção de "Code Mode ativo" (parâmetro explícito, não leitura de setting no meio da função).
  2. Quando ativo e `eval` estiver entre os nomes, projetar `readsSkillUris: true` para `eval` na metadata.
  3. Ajustar a instrução do bloco para usar `read("skill://<nome>")` (JS) e `await read(...)` (Python) quando o leitor é `eval`.
  4. Garantir que rebuild (MCP tardio, resize) reaplique a mesma projeção.
- **Test IDs**: `CM-C1`, `CM-C2` em `packages/coding-agent/test/code-mode/skills-mcp.test.ts`.
- **Done when**: os dois testes saem de `it.todo` e passam; o system prompt em modo normal (sem Code Mode) é byte-idêntico ao atual para o mesmo fixture.
