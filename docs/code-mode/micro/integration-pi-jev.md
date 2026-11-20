# Integração — Ajustes do pi-jev — Micro

Parent: [macro/integration.md](../macro/integration.md)

## Requirement statement

No Code Mode, o pi-jev deixa de chamar `pi.setActiveTools` para rotear tools (`McpGate`, `AutoJev`, `jev_find_tools`), passa a devolver sugestões no formato `tool.<nome>`, ignora o `toolName === "eval"` no `ToolGuard` e usa `skill://<nome>` nas mensagens de skill — com fallback para hosts sem `pi.isCodeModeActive()`.

## Acceptance criteria

- [ ] `McpGate.route` não faz nenhuma chamada a `setActiveTools` quando `pi.isCodeModeActive()` é `true` — `JEV-CM1`, `vendor/pi-jev/test/code-mode.test.ts`.
- [ ] A ativação automática do router é pulada em Code Mode e os nomes viram dicas (hints) em vez de ativação — `JEV-CM2`, `vendor/pi-jev/test/code-mode.test.ts`.
- [ ] `jev_find_tools` em Code Mode devolve sugestões `tool.<nome>` sem ativar tools — `JEV-CM3`, `vendor/pi-jev/test/code-mode.test.ts`.
- [ ] `ToolGuard` ignora `toolName === "eval"` — `JEV-CM4`, `vendor/pi-jev/test/code-mode.test.ts`.
- [ ] A mensagem de skill usa a forma `skill://<nome>` — `JEV-CM5`, `vendor/pi-jev/test/code-mode.test.ts`.
- [ ] Host sem `pi.isCodeModeActive` mantém o comportamento atual: `setActiveTools` continua sendo chamado — `JEV-CM6`, `vendor/pi-jev/test/code-mode.test.ts`.

## Constraints

- Os testes do pi-jev usam `node:test` com `test(name, { todo: "code-mode" }, fn)`, não `bun:test` — o mesmo estilo de `vendor/pi-jev/test/mcp-gate.test.ts`.
- O ajuste é no repo da extensão (`vendor/pi-jev/` no fork; origem `~/.omp/agent/extensions/pi-jev`), não em `packages/coding-agent`.
- `ToolGuard` só pode ignorar a chamada externa `eval`; as chamadas `tool.*` aninhadas continuam verificadas se RF6.6 confirmar que o hook dispara uma única vez (`docs/code-mode-requirements.md`, F6).
- Detecção deve ser por capacidade: `typeof pi.isCodeModeActive !== "function"` → comportamento atual (RF6.5).
- `AutoJev.route` já é "never throws" (`vendor/pi-jev/src/auto.ts#AutoJev.route`); o caminho de Code Mode não pode introduzir exceção nova.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Host antigo sem RF6.4 | Fallback: roteamento atual, sem erro |
| `isCodeModeActive()` lança | Tratar como `false`; roteamento atual |
| `jev_find_tools` chamado fora do Code Mode | Comportamento atual: ativa tools |
| `eval` avaliado pelo `ToolGuard` | Ignorado (JEV-CM4), sem julgamento sobre o código do cell |
| Router sugere tool já no catálogo | Dica repetida é inofensiva; o catálogo não muda |

## Implementation parts

- [nano/integration-pi-jev-code-mode-detection.md](../nano/integration-pi-jev-code-mode-detection.md)
