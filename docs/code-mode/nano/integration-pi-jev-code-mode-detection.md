# Detecção de Code Mode no pi-jev — Nano

Parent: [micro/integration-pi-jev.md](../micro/integration-pi-jev.md)

Code: `vendor/pi-jev/src/mcp-gate.ts#McpGate.route`, `vendor/pi-jev/src/router.ts#ToolRouter.activateTools`, `vendor/pi-jev/src/auto.ts#AutoJev.route`, `vendor/pi-jev/src/tool-guard.ts#ToolGuard`, `vendor/pi-jev/src/skills.ts#JEV_THRESHOLD`, `vendor/pi-jev/src/tools.ts#registerJevTools`, `vendor/pi-jev/src/types.ts#JEV_TOOL_NAMES`

`[planned] packages/coding-agent/src/extensibility/extensions/types.ts#ExtensionAPI.isCodeModeActive`

## How it works

O pi-jev atua em três momentos: `before_agent_start` chama `AutoJev.route` (que usa `ToolRouter.activateTools` → `pi.setActiveTools`) e `McpGate.route` (que também chama `pi.setActiveTools`); `jev_find_tools` chama `router.findAndActivate`; e `tool_call`/`tool_result` passam pelo `ToolGuard`.

A detecção proposta:

```
function codeModeActive(pi: ExtensionAPI): boolean {
  return typeof pi.isCodeModeActive === "function" && pi.isCodeModeActive() === true;
}
```

- `McpGate.route`: se ativo, retorna antes de calcular `plan.inject/retract` (o plano não é aplicado).
- `AutoJev.route` / `ToolRouter.activateTools`: se ativo, não chama `setActiveTools`; devolve os nomes como dica, para o host anexar em `router-hints`.
- `jev_find_tools`: em Code Mode, devolve `tool.<nome>` como sugestão, sem ativar.
- `ToolGuard`: ignora `toolName === "eval"` (o código do cell não é uma tool call a julgar); chamadas `tool.*` aninhadas continuam sujeitas ao hook se RF6.6 confirmar.
- Mensagens de skill: `skill://<nome>` em vez de `/skill:<nome>` (funciona nos dois modos; `/skill:` continua válido como comando).

## Invariants

- Em Code Mode, nenhuma chamada do pi-jev chega a `pi.setActiveTools`.
- Sem `isCodeModeActive` no host, o comportamento é exatamente o atual (fallback por capacidade, não por versão).
- `AutoJev.route` continua "never throws": falha de detecção não pode derrubar o turno.
- `JEV_TOOL_NAMES` não muda; só o efeito de `jev_find_tools` muda.
- As dicas devolvidas usam nomes canônicos do catálogo bridge-only, não aliases.

## Gotchas

- `pi.isCodeModeActive` é opcional no tipo do host durante a transição: chamar direto em TypeScript quebra o typecheck do repo da extensão (usar o guard `typeof`).
- `AutoJev.route` roda antes da mensagem do usuário ir ao modelo; se ele devolver dicas, o host precisa anexá-las **depois** da mensagem (a extensão não deve escrever no system prompt).
- `McpGate.route` já ignora prompts que começam com `/`; não confundir esse early-return com o de Code Mode no teste (asserção deve observar ausência de `setActiveTools`, não o status).
- `ToolGuard` ignorar `eval` não pode ignorar `write`/`edit` chamados dentro do cell — a distinção é o nome da tool externa, não o conteúdo.
- Mensagem `skill://<nome>` sem o prefixo `/skill:` pode quebrar expectativa de usuários de slash command; manter `/skill:<nome>` como comando e `skill://` como instrução de leitura.

## Tarefa de implementação

- **Arquivos**: `vendor/pi-jev/src/mcp-gate.ts`, `vendor/pi-jev/src/router.ts`, `vendor/pi-jev/src/auto.ts`, `vendor/pi-jev/src/tool-guard.ts`, `vendor/pi-jev/src/skills.ts`, `vendor/pi-jev/src/tools.ts`, `vendor/pi-jev/test/code-mode.test.ts`.
- **Passos**:
  1. Adicionar o helper `codeModeActive(pi)` (guard `typeof`).
  2. Curto-circuitar `McpGate.route` e `ToolRouter.activateTools` quando ativo; fazer `AutoJev.route` devolver `activated: []` com as dicas.
  3. Ajustar `jev_find_tools` para devolver `tool.<nome>` e não ativar.
  4. Ignorar `eval` no `ToolGuard`.
  5. Trocar a mensagem de skill para `skill://<nome>`.
  6. Escrever os testes com `test(name, { todo: "code-mode" }, fn)`.
- **Test IDs**: `JEV-CM1`..`JEV-CM6` em `vendor/pi-jev/test/code-mode.test.ts`.
- **Done when**: os seis testes passam; a suíte atual do pi-jev continua verde sem alteração de expectativa.
