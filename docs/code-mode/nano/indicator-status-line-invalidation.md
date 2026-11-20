# Indicador — Invalidação da status line — Nano

Parent: [micro/indicator-status-icon.md](../micro/indicator-status-icon.md)

## Code locators

- `packages/tui/src/status-line/segments.ts#renderSegment` — ponto único de renderização dos
  segmentos; o segmento de modelo já desenha `theme.icon.fast`.
- `packages/tui/src/status-line/segments.ts:368` — ramo atual do `/fast`, precedente de desenho de
  ícone condicionado ao estado.
- `packages/tui/src/status-line/host.ts#StatusLineHost` — contrato que a sessão expõe à TUI
  (`isFastModeActive` no mesmo nível).
- `packages/tui/src/status-line/component.ts#StatusLineComponent` — componente que copia o estado
  para um alvo e compara para decidir se redesenha.
- `packages/tui/src/status-line/component.ts:2798` — cópia de estado por sessão.
- `packages/tui/src/status-line/component.ts:2855` — comparação que evita repaint desnecessário.
- `packages/tui/src/status-line/startup.ts#readStatusLineStartupData` — validação do snapshot
  inicial.
- `packages/tui/src/status-line/startup.ts#createStartupStatusLine` — primeira renderização.
- `packages/tui/src/theme/symbols.ts` — mapa de símbolos (unicode, nerd e fallback).
- `[planned] packages/tui/src/theme/symbols.ts#icon.codeMode`
- `[planned] packages/tui/src/status-line/host.ts#StatusLineHost.isCodeModeActive`
- `[planned] packages/tui/src/status-line/host.ts#StatusLineHost.isCodeModeDivergent`

## How it works

A status line não redesenha a cada frame. O componente copia um snapshot do estado da sessão para um
alvo (`component.ts:2798`) e compara campo a campo com o anterior (`component.ts:2855`). Se algum
campo difere, redesenha. Isso cria três obrigações para qualquer estado novo:

1. **Contrato do host.** A sessão precisa expor o valor (`isCodeModeActive()`); o componente não
   importa `AgentSession`.
2. **Cópia no snapshot.** Sem adicionar o campo à cópia, o componente nunca "vê" a mudança.
3. **Comparação.** Sem adicionar o campo à comparação, o componente ou redesenha sempre (campo
   ausente nos dois lados não conta) ou nunca (referência mutável compartilhada). O padrão correto é
   copiar o booleano e comparar por igualdade estrita.

O ícone tem dois estados visuais além de "ausente": ativo (`icon.codeMode` no estilo padrão) e
divergente (mesmo glifo, estilo esmaecido). A divergência é `decision.enabled !== isCodeModeActive()`
— a regra atual aponta um lado e a sessão está no outro.

## Invariants

- `renderSegment("model", ...)` desenha o ícone se e somente se `isCodeModeActive()` é true; não
  desenha nada quando false.
- O estilo divergente nunca é igual ao ativo; a comparação de visual é observável no retorno de
  `renderSegment`.
- O snapshot de startup valida `codeMode` como boolean quando presente; ausência continua válida.
- O tema define o glifo nos três mapas: unicode, nerd e fallback.

## Gotchas

- **Campo no host sem cópia/comparação** é o erro clássico: o teste de `renderSegment` passa (recebe
  o contexto direto) e a TUI real nunca atualiza. Adicione nos três lugares.
- **Repaint a cada frame.** Se o valor for lido como referência mutável (objeto de decisão), a
  comparação por identidade sempre difere e a barra pisca. Copie um booleano, não o objeto.
- **Snapshot antigo.** `readStatusLineStartupData` rejeita o snapshot inteiro quando um campo
  obrigatório falta; o campo novo precisa ser opcional no validador para não quebrar clientes
  antigos.
- **Glifo hardcoded.** Escrever o caractere direto no segmento quebra temas e testes de símbolo; use
  `theme.icon.codeMode`.
- **Divergência não é erro.** Não logue nem esmaeça o resto da barra: só o ícone muda de estilo.

## Tarefa de implementação

**Arquivos possuídos**

- `packages/tui/src/status-line/segments.ts`
- `packages/tui/src/status-line/host.ts`
- `packages/tui/src/status-line/component.ts`
- `packages/tui/src/status-line/startup.ts`
- `packages/tui/src/theme/symbols.ts`

**Passos**

1. Adicione `icon.codeMode` aos três mapas de símbolo.
2. Estenda `StatusLineHost` com `isCodeModeActive()` e `isCodeModeDivergent()`; implemente no
   adaptador que liga a sessão ao componente.
3. Copie os dois booleanos no snapshot e compare na função de igualdade.
4. Em `renderSegment`, no ramo do segmento de modelo, desenhe o ícone nos estilos ativo/esmaecido
   conforme os booleanos.
5. Adicione `codeMode` opcional a `StatusLineStartupData` e ao validador.
6. Rode o typecheck e o gate de `indicator.test.ts`.

**Test IDs:** CM-I1, CM-I2, CM-I3, CM-I4.

**Done when:** `bun test --todo test/code-mode/indicator.test.ts` marca os quatro IDs como prontos;
com `isCodeModeActive` falso o segmento sai sem o glifo; com divergência, sai com estilo diferente do
ativo.
