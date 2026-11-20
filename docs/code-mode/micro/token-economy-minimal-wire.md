# Economia de tokens — Wire mínimo e catálogo — Micro

Parent: [macro/token-economy.md](../macro/token-economy.md)

## Requirement statement

Para o mesmo fixture de sessão, o wire do Code Mode (system prompt + JSON dos schemas de tool) custa menos tokens que o wire do modo normal, e o catálogo bridge-only é determinístico: ordem estável e colapso de servidores MCP grandes em uma única linha.

## Acceptance criteria

- [ ] O wire do Code Mode (system prompt + JSON dos schemas) tem contagem de tokens menor que o wire do modo normal para o mesmo fixture, medida com `natives.countTokens` e encoding `ClaudeV5` — `CM-E2`, `packages/coding-agent/test/code-mode/token-economy.test.ts`.
- [ ] `renderBridgeCatalog` ordena de forma estável e colapsa um servidor MCP com mais de 20 tools em uma linha `mcp__<server>__* (N tools)` — `CM-E3`, `packages/coding-agent/test/code-mode/token-economy.test.ts`.

## Constraints

- No wire ficam apenas `eval`, `wait`, `yield`, `ask`, `todo`, `checkpoint`, `rewind` e tools fixadas explicitamente (`docs/code-mode-plan.md` §12.3).
- Catálogo: uma linha por tool, formato `name: summary`, resumo com no máximo 12 palavras; MCP com >20 tools colapsa (contrato de `renderBridgeCatalog`).
- `tool.describe(name)` e `tool.search(query, k=5)` são o caminho de descoberta; o catálogo não carrega schemas (RF6.2 / §12.3).
- A contagem usa um tokenizer offline do provider (`packages/coding-agent/src/commands/toks.ts` chama `natives.countTokens(text, encoding)`); sem rede.
- Comparação é relativa ao mesmo fixture — o número absoluto não é o critério, a diferença é.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Sessão sem nenhuma tool MCP | Catálogo lista só as bridge-only nativas; continua ordenado |
| Servidor MCP com exatamente 20 tools | Não colapsa; 20 é o limite inclusivo do colapso |
| Duas tools com o mesmo nome de exibição | Ordenação estável por nome canônico; nenhuma linha duplicada silenciosa |
| Resumo com quebras de linha/controle | Sanitizado para uma linha, truncado em limite de code point (mesmo critério de `packages/coding-agent/src/tools/xdev.ts#sanitizeCatalogSummary`) |
| Nenhuma tool bridge-only | Catálogo vazio não é renderizado; o prompt não ganha seção vazia |

## Implementation parts

- [nano/token-economy-bridge-catalog.md](../nano/token-economy-bridge-catalog.md)
