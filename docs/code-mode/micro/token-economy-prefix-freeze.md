# Economia de tokens — Prefixo congelado — Micro

Parent: [macro/token-economy.md](../macro/token-economy.md)

## Requirement statement

Durante toda a sessão em Code Mode, o system prompt e o conjunto de schemas no wire permanecem byte-idênticos, mesmo depois de N chamadas de `setActiveTools` vindas de extensões.

## Acceptance criteria

- [ ] `systemPrompt` + schemas de tools no wire são byte-idênticos antes e depois de N chamadas de `setActiveTools` de extensão em Code Mode — `CM-E1`, `packages/coding-agent/test/code-mode/token-economy.test.ts`.

## Constraints

- O top-level, o system prompt e o catálogo de tools são definidos na criação da sessão (RNF2.1, `docs/code-mode-plan.md` §12.2).
- A camada bridge-only não aparece no wire; é ela que o `setActiveTools` muta.
- O catálogo bridge-only é gerado em ordem estável (nome ordenado) para que descobertas tardias não o reordenem.
- MCP descoberto tarde entra no bridge e **não** reescreve o catálogo do prompt; o modelo encontra a tool por `tool.search` (§12.2).

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Extensão adiciona uma tool | Wire idêntico; apenas a camada bridge-only cresce |
| Extensão remove uma tool bridge-only | No-op; wire idêntico |
| MCP descoberto depois do primeiro request | Wire idêntico; catálogo do prompt já enviado não muda |
| Rebuild do system prompt por mudança de modo de plano | Fora do Code Mode a regra não vale; em Code Mode o rebuild não pode reordenar o catálogo |
| `skills.catalogMode` muda no meio da sessão | Mudança de setting exige nova sessão; a sessão corrente mantém o prefixo |

## Implementation parts

- [nano/token-economy-prefix-freeze.md](../nano/token-economy-prefix-freeze.md)
