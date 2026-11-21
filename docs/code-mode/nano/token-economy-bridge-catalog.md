# Catálogo bridge-only — Nano

Parent: [micro/token-economy-minimal-wire.md](../micro/token-economy-minimal-wire.md)

Code: `packages/coding-agent/src/code-mode/catalog.ts#renderBridgeCatalog`, `packages/coding-agent/src/tools/xdev.ts#toolSummary`, `packages/coding-agent/src/tools/xdev.ts#sanitizeCatalogSummary`, `packages/tui/src/tools/streaming-output.ts#truncateHeadBytes`

## How it works

`renderBridgeCatalog(tools)` recebe as tools bridge-only e devolve texto pronto para o prompt:

1. Nome canônico ordenado por code point (não `localeCompare`).
2. Uma linha por tool: `name: summary`, resumo com no máximo 12 palavras.
3. Resumo = `tool.summary`, senão a primeira linha não vazia da descrição, senão label/nome — o mesmo critério de `toolSummary`.
4. Sanitização: caracteres de controle e separadores Unicode viram espaço; truncamento em **bytes** com corte em code point (mesmo critério de `sanitizeCatalogSummary`).
5. Servidores MCP com mais de 20 tools colapsam em `mcp__<server>__* (N tools)`.

O catálogo é construído junto com o system prompt e congelado; descoberta tardia não o reescreve.

## Invariants

- Saída determinística para o mesmo conjunto de tools.
- Uma tool nunca aparece duas vezes.
- Nenhuma linha tem `\n` interno nem caractere de controle.
- Colapso só para servidor MCP com N > 20; N = 20 lista normalmente.
- Catálogo vazio → string vazia (nenhuma seção vazia no prompt).
- Contagem de tokens do catálogo é sempre menor que o conjunto de schemas das mesmas tools (`CM-E2`).

## Gotchas

- `Set` preserva ordem de inserção; descoberta MCP tardia insere no fim e muda a saída se o catálogo for remontado — ordenar sempre na renderização, não na coleta.
- `localeCompare` varia com locale do host; em CI isso muda a ordem e quebra `CM-E3`.
- O colapso precisa agrupar pelo servidor real (`mcpServerOf`-like), não por prefixo textual: `mcp__a_b_c` tem servidor `a`, não `a_b`.
- Resumos externos são metadata de terceiros: sanitizar antes de medir "12 palavras" para não contar tokens de controle.
- Se o implementador reaproveitar `toolSummary`/`sanitizeCatalogSummary` de `xdev.ts`, ambas são internas ao módulo — copiar a lógica para `catalog.ts` (sem exportar símbolo novo em `xdev.ts`, que aumenta conflito de merge) ou extrair com cuidado.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/code-mode/catalog.ts` (novo), `packages/coding-agent/src/sdk.ts` (chamar no build do prompt), `packages/coding-agent/src/system-prompt.ts` (seção do catálogo no template do prompt).
- **Passos**:
  1. Implementar `renderBridgeCatalog(tools)` puro, sem I/O.
  2. Cobrir: ordenação, 12 palavras, controle/UTF-8, colapso > 20, colapso não em 20, vazio.
  3. Ligar no build do prompt somente em Code Mode.
- **Test IDs**: `CM-E2`, `CM-E3` em `packages/coding-agent/test/code-mode/token-economy.test.ts`.
- **Done when**: ambos passam; a ordem da saída é estável entre duas construções com inserção em ordens diferentes.
