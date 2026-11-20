# Captura de schemas do spike — Nano

Parent: [micro/needle-schema-fixture.md](../micro/needle-schema-fixture.md)

Code: `needle-spike/dump-schemas.ts`, `needle-spike/fixtures/tool-schemas.json`, `packages/ai/src/utils/schema/wire.ts#toolWireSchema`, `packages/coding-agent/src/sdk.ts#createAgentSession`

## How it works

O script cria uma sessão real com `createAgentSession` (settings isolados: `tools.xdev: false`, `marketplace.autoUpdate: "off"`, sem MCP), percorre a lista fixa de tools alvo e grava `toolWireSchema(tool)` em `fixtures/tool-schemas.json`. Importa os fontes do fork por caminho relativo (`../oh-my-pi/packages/...`) de propósito: um import bare resolveria os pacotes publicados no cache do bun, não o workspace.

A fixture é commitada e vira a entrada do harness Python; nenhum passo do spike depende de rodar o fork de novo.

## Invariants

- A fixture contém exatamente uma entrada por tool alvo registrada.
- O schema gravado é o do wire, não uma versão convertida para TypeScript.
- O script roda offline (sem modelo, sem rede) — `createAgentSession` com modelo bundled e `enableMCP: false`.
- Rodar de novo produz o mesmo conjunto de chaves; diferenças refletem mudança real de schema.
- Saída determinística em ordem de `TOOL_NAMES`.

## Gotchas

- Import relativo é obrigatório; `@oh-my-pi/pi-ai` dentro do script resolveria a cópia publicada.
- `toolWireSchema` remove campos internos do host; comparar com `tool.parameters` cru produz diff falso.
- Tools que exigem backend (ex.: `eval` sem interpreter) podem não estar registradas; o script pula e avisa — o relatório precisa listar o que foi pulado.
- Caminhos de `cwd`/`agentDir` temporários (`TempDir`) evitam herdar config do usuário, que mudaria tools registradas.
- O `using dir = TempDir.createSync(...)` apaga o diretório no fim; nunca apontar a saída da fixture para dentro dele.

## Tarefa de implementação

- **Arquivos**: `needle-spike/dump-schemas.ts` (existe), `needle-spike/fixtures/tool-schemas.json` (gerado), `needle-spike/README.md` (documentar comando).
- **Passos**:
  1. Manter a lista `TOOL_NAMES` alinhada com as tools que o Code Mode usa.
  2. Garantir sessão isolada e offline.
  3. Gravar a fixture com `mkdir` recursivo e ordem estável.
  4. Registrar no README o comando `bun needle-spike/dump-schemas.ts` e a pré-condição `bun install` no fork.
- **Test IDs**: `NDL-1` em `needle-spike/dump-schemas.ts` (saída em `needle-spike/fixtures/tool-schemas.json`).
- **Done when**: o script roda do zero e a fixture contém todas as tools alvo registradas, com contagem declarada no README.
