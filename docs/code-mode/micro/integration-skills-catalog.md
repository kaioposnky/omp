# Integração — Catálogo de skills — Micro

Parent: [macro/integration.md](../macro/integration.md)

## Requirement statement

Com o Code Mode ligado, o system prompt continua listando `nome: descrição` de cada skill visível e o modelo consegue ler o corpo de uma skill via `read("skill://<nome>")` no kernel do `eval`, inclusive pela busca `skill://?q=`.

## Acceptance criteria

- [ ] Com Code Mode ligado e skills presentes, `session.systemPrompt` contém o bloco de skills e a instrução de busca/leitura que referencia `read(` do `eval` — `CM-C1`, `packages/coding-agent/test/code-mode/skills-mcp.test.ts`.
- [ ] `skill://<nome>` é legível através da tool `read` exposta no bridge (`getToolForEvalBridge("read")`) quando o Code Mode está ligado — `CM-C2`, `packages/coding-agent/test/code-mode/skills-mcp.test.ts`.

## Constraints

- O bloco de skills só existe quando há uma tool ativa capaz de ler `skill://` (`packages/coding-agent/src/system-prompt.ts#toolReadsSkillUris`); em Code Mode o `eval` precisa contar como esse leitor (RF6.1).
- Skills nunca são injetadas por inteiro: o prompt lista apenas nome e descrição, e o corpo é lido sob demanda (`docs/code-mode-requirements.md`, F6).
- Skills com frontmatter `hide: true` continuam fora do bloco, mas carregáveis por `skill://` e `/skill:<nome>` (`packages/coding-agent/src/system-prompt.ts#buildSystemPrompt`).
- `skills.catalogMode: "search"` continua válido: o catálogo pode virar busca em vez de lista, sem sair do prompt estável (`packages/coding-agent/src/extensibility/settings.ts#cfgSkillsCatalogMode`).

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| `eval` indisponível no host | Code Mode cai no modo normal (`hard-gate:no-eval`); `read` volta ao top-level e o bloco de skills usa o leitor normal — sem regressão |
| Skill inexistente em `skill://nao-existe` | `read` devolve o erro normal do resolvedor de `skill://`, não um erro de tool desconhecida |
| Extensão substitui `read` (`readsSkillUris` custom) | O bloco continua aparecendo: o critério é a capacidade declarada, não o nome `read` |
| `skills.catalogMode: "search"` + Code Mode | Bloco cita a busca `skill://?q=` e o leitor do `eval`; nenhuma skill é inlinada |

## Implementation parts

- [nano/integration-skill-reader-capability.md](../nano/integration-skill-reader-capability.md)
