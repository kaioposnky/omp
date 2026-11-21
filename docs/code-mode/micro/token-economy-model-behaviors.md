# Economia de tokens — Comportamento por modelo — Micro

Parent: [macro/token-economy.md](../macro/token-economy.md)

## Propósito

Esta página registra como 7 LLMs se comportam no Code Mode do oh-my-pi em comparação com o tool-calling normal. O objetivo é adaptar o harness a cada família de modelos. Ela não especifica requisito nenhum: reúne evidências e propostas. Toda proposta continua pendente até a [rodada de confirmação](#confirmação).

## Como foi medido

- **Tarefas:** `pricing`, `parser`, `cli` e `refactor` (`packages/metaharness/scripts/code-mode-ab/tasks/fx-*`).
- **Braços:** `normal` (tools no wire) e `code` (wire com `eval`/`wait`/`todo`).
- **A/B completo:** 3 reps × 4 tarefas × 2 braços por modelo.
  - Anthropic e OpenAI: `results/v2-2026-11-20/summary.md`.
  - Modelos flash: `results/v2-2026-11-21-flash/summary.md`.
- **Modelos e esforço** (campo `thinking` do `runs.jsonl`):
  - `9router/cc/claude-opus-5-5`, `claude-sonnet-5-5` e `claude-haiku-5-5`, todos com `low`.
  - `9router/cx/gpt-6.2-sol` e `gpt-6.1-terra`, ambos com `medium`.
  - `9router/cmc/deepseek/deepseek-v4.1-flash` e `z-ai/glm-5.3-flash`, ambos com `max`.
- **Perfis de comportamento:** 1 rep × 4 tarefas por modelo. Os transcripts estão em `/tmp/cm-behav/<model>/transcripts/*.jsonl`. "T*n*" indica o request/turno *n* do assistente na run.
- **Triagem de hipóteses:** só no braço `code` dos 4 modelos não-Anthropic, com 2 reps × 4 tarefas (n=8). Cada run é pareada com a run baseline `code` da mesma tarefa e rep.

## Perfil por modelo

Os valores de requests e tokens são as médias do A/B com 3 reps (n=12 por braço). A coluna Δtok mostra a diferença code − normal pareada por tarefa×rep.

| Modelo | Batching | Calls/cell | todo | Impressão | Falhas de edit | Verificação | req code / normal | tok code / normal (Δ, p) |
|---|---|---|---|---|---|---|---|---|
| opus | 1 `tool.bash` com loop de `cat` | 1 bash encadeado | nunca | `print(r)` no T1, `.text` depois | nenhuma (não usa `tool.edit`; usa replace com guarda) | testes + probes + grep no mesmo cell, para no verde | 3,50 / 4,92 | 39.891 / 85.289 (−45.398, p=0,0000) |
| sonnet | igual ao opus | 1 bash | nunca | `join` em resultados → `[object Object]` | `AttributeError` `.text` em Python (parser T3) | igual ao opus | 3,58 / 5,08 | 39.330 / 86.547 (−47.217, p=0,0004) |
| haiku | `Promise.all` misturando bash e read | 2+ | nunca | `JSON.stringify`/`print(r)` com `details` | replace sobre texto com prefixo hashline (cli T4) | probes extensos (parser T4: 9 entradas) | 5,33 / 7,17 | 67.644 / 130.937 (−63.293, p=0,0022) |
| sol | `Promise.all` em quase todo cell | 2–5 | sozinho no turno (15 de 19 requests extras) | objeto inteiro → elisão em 4 KB | 1º edit falha em 4/4 runs | testes uma vez, junto com grep | 12,75 / 7,83 | 116.431 / 86.393 (+30.038, p=0,0006) |
| terra | `Promise.all` no code; 1 call/request no normal | 2+ | nunca agrupa com `eval` | objeto inteiro (11,6 de 11,6 KB em refactor) | 4 turnos de thrash (cli); contorna com python | — | 12,08 / 11,33 | 108.111 / 114.298 (−6.187, p=0,6155) |
| deepseek | `Promise.all` desde o T1, só JS | 1+ | nunca | objeto inteiro + campo `.stdout` adivinhado | 3 requests de forma de argumento (parser T5–T7) | cells de smoke separados, re-run após verde | 9,42 / 7,33 | 72.880 / 79.911 (−7.031, p=0,7055) |
| glm | ~70% dos cells em Python, `subprocess` | loop dentro do cell, listar e ler em 2 turnos | sozinho no turno (5 em 3 runs) | `CompletedProcess`/dict com `details` | `NameError` com sintaxe JS em Python; `old/new` | 3 verificações (cli) | 12,83 / 8,17 | 100.957 / 81.007 (+19.949, p=0,17) |

### Anthropic (opus, sonnet, haiku)

- **Formato vencedor.** Opus e sonnet fazem tudo em dois cells.
  - O cell de *discover* é um único `tool.bash` com `find; cat package.json; for f in …; do cat $f; done; bun test | tail` (opus cli T1).
  - O cell de *mutate+verify* faz todas as escritas e depois um bash com testes, probes e grep. Opus cli T2 roda 7 checagens com resultado de 575 B.
  - Os edits são `Bun.write`/`replace` com `throw` quando a âncora não existe (opus parser T3, refactor T2).
  - Os dois param no verde, sem re-read.
- **Requests desperdiçados pela renderização.** Nas 12 runs code foram 9 requests, 0,75 por run, cerca de 15–20% dos requests do braço code:
  - elisão no cap de 4 KB: parser T2 nos três modelos;
  - `[object Object]`: sonnet cli T2, haiku refactor T3;
  - `details` inflando o resultado: haiku cli T2 e pricing T2;
  - prefixo hashline: haiku cli T5;
  - `.text` em Python: sonnet parser T4.
- **De onde vem a economia.** O primeiro request tem cerca de 9,0k tokens de input no code contra 14,9k no normal, e a rota `cc` mostra `cacheRead=0`. Por isso, mais ou menos metade da economia vem do tamanho do prompt (~6k × ~4,5 requests ≈ 27k por run) e metade de haver menos requests e calls. Haiku normal faz 11–15 calls em 7–9 requests; haiku code faz 4–5 cells.

### OpenAI/Codex (sol, terra)

- **sol: todo sozinho no turno.** No braço code, sol manda `todo` como turno próprio: cli T1, T4, T9 e T11, mais pricing e refactor com 5 cada. No braço normal foram 0 turnos assim. Cada um reenvia ~8–11k de input (`code-pricing T8 in=10402`).
- **sol: gramática de edit.** `tool.describe('edit')` devolve só `function edit(input: string;)`. sol então inventa sintaxes como `11: …`, `=18..19|…`, `8|\t…` e `3..9=…`, recebe "payload line has no preceding hunk header" e gasta 2–3 requests por run.
- **sol: falha falsa causada pelo harness.** O aviso de dedup de leitura (`tools/read.ts:868`) altera `.text`. Isso quebrou uma guarda de igualdade em `code-parser T7`.
- **terra: serial no normal.** No braço normal, terra faz exatamente 1 tool call por request nas 4 runs. O Code Mode corrige isso: `code-refactor` termina com 7 requests / 53k tokens, contra 14 / 141k no normal.
- **terra: custos que anulam o ganho.**
  - turnos de todo sozinho: 4 em cli e 4 em pricing;
  - thrash de edit: `edits:[{oldText,newText}]` → `*** Begin Patch` → `write`, 4 requests perdidos;
  - `title` degenerado (cli T2, pricing T2).
  - `code-parser` sofreu timeout de 300 s sem nenhum delta e é tratado como dado ausente.

### Open-weights flash (deepseek, glm)

- **Prompt menor.** O primeiro request do braço code tem ~3,6k tokens contra ~7,0k no normal. Assim, o code só vence se usar menos de ~1,5–2× os requests do normal.
- **deepseek: impressão e cap.** Imprime objetos inteiros, e `tool.read` duplica o texto em `details.displayContent`. Na rodada de perfil, o primeiro read bateu no cap de 4 KB nas 4/4 runs (4.135–4.141 B), sempre seguido de um re-read.
- **deepseek: forma de argumento.** Em `code-parser`, T5 usa `oldString`, T6 chama `describe`, T7 interpreta a assinatura como posicional e só T8 funciona. Os pensamentos têm tamanho igual nos dois braços (20,7k contra 21,5k caracteres).
- **glm: Python no lugar do bridge.** Cerca de 70% dos cells são Python, com `os.chdir('<workspace absoluto>')` hardcoded e `subprocess` no lugar de `tool.bash`. Isso gera saída perdida:
  - `Bun.$` só captura stdout (parser T6);
  - `CompletedProcess` truncado (pricing T6);
  - `NameError` ao usar sintaxe JS dentro de Python (pricing T4, refactor T2).
- **glm: desperdício e pensamento.** Foram cerca de 15 requests desperdiçados em 39. O pensamento ficou +86% maior no code (32,6k contra 17,6k caracteres), concentrado em turnos de planejamento com código em fences (parser T4: 9.500 caracteres).

## Sumidouros de tokens

| Sumidouro | Quantificação |
|---|---|
| **Cada request extra** reenvia o histórico | ~10k por request tardio em sol (`code-parser T9 in=13980`), até 14.323 em deepseek `code-parser` T14. É o multiplicador dominante. |
| Dumps de discovery | 61,7 de 69,9 kB (88%) do texto de resultado nas 12 runs Anthropic. 5 dumps em 4 runs bateram no cap de 4.096 B (`CODE_MODE_EVAL_INLINE_BYTES`, `eval/executor-base.ts:32`). |
| `details` em objetos impressos | sol: 8,3 de 12,5 KB (cli) e 9,4 de 13,8 KB (refactor). terra: 11,6 de 11,6 KB (refactor). deepseek: ~22k dos 52,5k B. |
| Wrapping de `util.inspect` em `print(r)` | ≈9,3 kB (~13%) nas runs Anthropic |
| Re-read forçado pela elisão | +1 request por run em sol, terra e deepseek. ~8k B de repetição nos modelos flash. |
| Turnos de todo sozinho | 15 de 19 requests extras de sol. 8 de terra em cli e pricing. 5 de glm. |
| Bytes de resultado code vs normal | deepseek 52,5k contra 26,7k B. glm 39,5k contra 23,6k B. |

## Hipóteses (triagem)

Coluna Δ: diferença contra o baseline `code` das reps 1–2, no formato Δtok (p) / Δreq. Baselines: sol 114.406 / 12,6; terra 106.799 / 12,1; deepseek 60.847 / 8,2; glm 108.358 / 13,4.

| H | Mudança | Mecanismo | Previsão | sol | terra | deepseek | glm | Veredito |
|---|---|---|---|---|---|---|---|---|
| H1 | `PI_CM_EXP=lean`: `print` de um resultado mostra `.text` | remove `details`/inspect e fica abaixo do cap | −1 req/run | −26.872 (0,028) / −2,2 | −26.742 (0,010) / −1,5 | −349 (0,972) / +0,5 | −27.879 (0,190) / −2,4 | misto: apoiada em OpenAI |
| H2 | `PI_CM_EXP=describe`: `tool.describe` com descrição completa | gramática do edit no code | 1º edit falha ≤1/4 | −34.974 (0,017) / −3,6 | −24.679 (0,239) / −2,6, 7/8 ok | +64.450 (0,134) / +3,0 | −7.098 (0,672) / −0,6 | misto: apoiada só em sol; deepseek dominado por um outlier ([isolamento](#isolamento-de-workspace)) |
| H3 | `variants/h3-recipe.md` (receita Anthropic) | 2 cells: discover e mutate+verify | sol/glm ≤8 req | −47.433 (0,005) / −4,6 | −56.108 (0,002) / −5,5 | −12.893 (0,296) / −2,0 | −65.395 (0,018) / −7,5 | apoiada (direção 4/4, p<0,05 em 3) |
| H4 | `variants/h4-todo.md` (nunca todo sozinho) | todo entra no cell ou some | sol ~8–9 req | −37.718 (0,011) / −3,6 | −49.338 (0,000) / −4,9 | −12.224 (0,093) / −1,2 | −12.308 (0,621) / −2,4 | apoiada em OpenAI; não em flash |
| H5 | `variants/h5-shape.md` (forma de call, `tool.bash`) | menos erros de argumento | glm −1–2 req | −18.520 (0,116) / −1,8 | −10.133 (0,225) / −0,9 | +23.717 (0,160) / +2,0 | −27.180 (0,228) / −2,0 | não apoiada |

**Cautela estatística.**
- Cada célula tem n=8, e foram 20 testes. Com p<0,05, espera-se ~1 falso positivo só por acaso; aqui 8 de 20 deram p<0,05.
- Com Bonferroni (0,05/20 = 0,0025), sobrevivem apenas terra H3 (p=0,002) e terra H4 (p=0,000).
- Contra o braço normal, H3 deixa o code mais barato que o normal:
  - sol −20.247 (p=0,024);
  - terra −66.626 (p=0,000);
  - glm −41.011 (p=0,014).
- Os modelos Anthropic não foram triados: a receita H3 descreve o comportamento que eles já têm.

## Implicações para o harness (propostas da triagem; ver [Confirmação](#confirmação) para o que foi adotado)

- **Anthropic:** manter o Code Mode como está. A economia já é significativa nos 3 modelos (p ≤ 0,0022). O ganho residual possível são os 0,75 requests/run causados pela renderização, que H1 (lean) deve atacar. Isso não foi testado nesses modelos.
- **OpenAI/Codex:** ligar H3 + H4 + H1. Para sol, considerar também H2. A combinação é a variante C1/C2 da confirmação. São os únicos modelos com vários resultados significativos (sol H1–H4, terra H1/H3/H4).
- **Open-weights flash:** H3 para glm é o maior efeito isolado da triagem (−7,5 req). Para deepseek nenhuma hipótese foi significativa. Não ligar H2 nem H5 para flash enquanto o outlier do deepseek-h2 não for separado do efeito real. Para glm, avaliar orientação específica sobre Python/`tool.bash`: H5 não bastou, e o `os.chdir` hardcoded continua.
- **Todas as famílias:** H1 não tem efeito negativo significativo em nenhum modelo. É uma candidata a default do harness, não a uma variação por modelo.

## Isolamento de workspace

- **O que aconteceu.** Em `deepseek-h2 cli-r1` (22 requests, 386k tokens), o raciocínio do deepseek decidiu procurar testes ocultos do avaliador fora do workspace. O modelo:
  - fez grep em `/tmp`;
  - leu workspaces de outras runs;
  - leu logs de artifacts de eval.
  
  Foram 17 tool calls fora do workspace. É uma run única, mas é ela que faz H2 parecer ruim para o deepseek.
- **Causa.** As fixtures ficam em `/tmp/omp-code-mode-ab-*`, e os diretórios irmãos ficam visíveis.
- **Risco.**
  - **Medição:** custo inflado e possível contaminação entre runs (gabarito ou artifacts alheios).
  - **Uso real:** um modelo com esforço `max` explora o sistema de arquivos além do cwd quando acha que está sendo avaliado.
- **Correção (adotada).** Cada run roda sob `bwrap` com um `/tmp` novo em tmpfs, onde só a raiz privada da própria run (`omp-ws-*/w-*`: workspace + cópia do agent dir) é montada de volta (`code-mode-ab.ts#sandboxed`). Dentro do sandbox, `/tmp` e o diretório pai mostram apenas a própria run; os artifacts de eval também ficam no `/tmp` privado. Os nomes de diretório são neutros (sem modelo, braço ou experimento); o rótulo da run fica num arquivo `.run` fora do sandbox. `escapeCalls` agora conta tentativas, que o sandbox já bloqueia. Rodada de qualidade (112 runs): 0 tentativas.

## Confirmação

Rodada com 3 reps × 4 tarefas, baselines novos (normal e code) na mesma janela. C1 = lean + recipe + todo (H1 + H3 + H4), com a receita anexada ao system prompt (`packages/metaharness/scripts/code-mode-ab/variants/c1-recipe-todo.md`); C2 = C1 + describe (H2). Os resultados ficam em `packages/metaharness/scripts/code-mode-ab/results/v3-2026-11-21-confirm/`. Todas as runs listadas tiveram sucesso 12/12 e zero chamadas fora do workspace. Para deepseek/glm/haiku/sonnet, o braço code da tabela é o harness antigo; o efeito do harness novo nesses modelos foi medido via C1 (mesma receita, colocada no system prompt em vez da descrição do `eval`).

| modelo | normal | code (antes) | C1 | C1 vs normal | C1 vs code | C2 vs normal |
|---|---|---|---|---|---|---|
| deepseek | 78,2k | 61,8k | 33,9k | −57% (p<0,001) | −45% (p=0,001) | −46% (p<0,001) |
| glm | 75,2k | 112,7k | 29,4k | −61% (p<0,001) | −74% (p<0,001) | −52% (p<0,001) |
| haiku | 116,6k | 63,4k | 54,2k | −53% (p<0,001) | −14% (p=0,092) | — |
| sonnet | 85,4k | 40,3k | 44,5k | −48% (p=0,002) | +10% (p=0,288) | — |

- **Open-weights flash:** C1 transforma empate/perda em ganho do tamanho do Anthropic. glm passa de +50% (pior que normal) para −61%.
- **Anthropic:** C1 não muda nada significativo. A receita descreve o que esses modelos já fazem; o texto extra só custa prompt.
- **C2 < C1** nos dois flash: o `describe` completo não ajuda quando a receita já evita edits pequenos.
- **sol/terra:** duas tentativas bateram no limite de uso do provedor Codex (`429 usage limit`) e foram descartadas inteiras. A terceira rodou uma tarefa por vez, esperando o reset e refazendo qualquer tarefa com 429. Ela começou depois que H1 e o bloco `<cell-workflow>` já estavam no código, então o braço code dessa rodada mede o harness novo, e o "antes" vem da rodada v2 (2026-11-20, mesmas tarefas e reps):

| modelo | code antes (v2) | code com o harness novo | C1 (harness novo + receita no system prompt) | normal (novo) |
|---|---|---|---|---|
| sol | 116,4k / 12,8 req | 52,2k / 6,6 req (−55% vs antes; −33% vs normal, p=0,001) | 38,8k / 4,9 req (−50% vs normal, p<0,001) | 77,4k / 7,2 req |
| terra | 108,1k / 12,1 req | 36,2k / 5,1 req (−67% vs antes; −70% vs normal, p<0,001) | 46,3k / 5,5 req | 119,4k / 11,8 req |

  - O valor de sol no harness novo usa o texto final do `<cell-workflow>` (igual ao da receita C1). Um texto anterior, mais curto, deu 69,9k / 8,2 req: dizer que cada célula extra reenvia a conversa e "No extra re-reads" mudou sol em −25%.
  - sol ainda fica melhor com a receita repetida no system prompt (C1 −34% vs o harness novo, p=0,053, no limite). terra não ganha nada com a repetição. Não adotado: duplicar texto em dois lugares por um ganho marginal em um modelo.
  - sol passou de 3,5 turnos só de `todo` por run para 0,8 com o harness novo e 0 com C1.

### Adotado no harness

- **H1 para todos os modelos:** `print(resultado)` mostra `.text` (com `[tool error]` quando falha) em JS (`eval/js/shared/runtime.ts#leanToolResult`) e Python (`eval/py/prelude.py#_ToolResult`, que também ganha `r.text`). `details` continua acessível e o JSON não muda.
- **Guidance por família** (`code-mode/workflow.ts#codeModeGuidance`, a partir de `identity.class` do modelo, o mesmo sinal que `utils/edit-mode.ts` usa; funciona atrás de proxies, `9router/cc/*` resolve `anthropic`):

  | família | `<cell-workflow>` (H3 + H4) | `<code-mode-scope>` |
  |---|---|---|
  | Anthropic | não (já trabalha assim) | sim |
  | OpenAI/Codex | sim | sim |
  | qualquer outro modelo (open-weights, não classificado, desconhecido) | sim | não |

  O default para os demais só reduz tokens: a regra de escopo custou +58% de tokens no deepseek sem ganho de qualidade. Ver [Regra de escopo](#regra-de-escopo).
- **Runner:** `escapeCalls` por run (chamadas com argumentos fora do workspace) aparece na tabela de runs do resumo; detectou exatamente a run `deepseek-h2 cli-r1` (17) e nenhuma outra em 216 transcripts.

## Qualidade (Code Mode vs normal)

Rodada com o harness atual: 7 modelos × 4 tarefas × 2 reps × 2 braços = 112 runs em sandbox, todas com sucesso no checker e 0 tentativas de fuga. Dados: `packages/metaharness/scripts/code-mode-ab/results/v4-2026-11-21-quality/`.

**Testes ocultos** (36 sondas que os agentes nunca viram, `hidden-probes.ts`: casos-limite de associatividade, `--limit 1.5`/`--limit --json`, chave de protótipo `toString`, mensagens de erro exatas). Os fixtures originais falham a maioria (3/8, 6/10, 7/11, 1/7).

| modelo | normal | code |
|---|---|---|
| opus, haiku, sonnet, sol, terra, deepseek | 72/72 cada | 72/72 cada |
| glm | 70/72 | 70/72 (mesma falha nos dois braços: aceita `formatMoney(100, "toString")`) |

Nenhuma run, em nenhum braço, afirmou que os testes passavam sem tê-los rodado.

**Revisão cega pareada** (4 revisores Opus, 56 pares normal vs code do mesmo modelo/tarefa/rep, ordem A/B aleatória, sem saber qual é qual; notas 1–5 em correção, escopo mínimo, clareza, robustez e relato final):

| família | prefere code | prefere normal | empate | sign test p | Δcorreção | Δescopo | Δclareza | Δrobustez | Δrelato |
|---|---|---|---|---|---|---|---|---|---|
| Anthropic | 3 | 5 | 16 | 0,73 | −0,12 | −0,08 | +0,17 | −0,12 | −0,08 |
| OpenAI/Codex | 1 | 3 | 12 | 0,62 | −0,12 | −0,38 | +0,12 | −0,25 | −0,44 |
| open-weights | 2 | 5 | 9 | 0,45 | +0,06 | −0,38 | +0,00 | +0,06 | −0,31 |
| **total** | **6** | **13** | **37** | **0,17** | | | | | |

- Nenhuma diferença é significativa; 66% dos pares empatam (vários com diffs idênticos).
- A tendência contra o code concentra-se na tarefa `cli` (code 2, normal 7, empate 5). O defeito recorrente: trocar `else if (argument.startsWith("-"))` por um `else` que rejeita argumentos posicionais antes ignorados ("Unknown flag: jobs"). Aconteceu em 5/14 runs code e 1/14 normal, quase sempre quando a célula reescreve o arquivo inteiro em vez de editar o trecho. Por família: Anthropic 4/6 code vs 1/6 normal; open-weights 1/4 vs 0/4; OpenAI 0/4 vs 0/4.
- Outros defeitos citados aparecem nos dois braços: `--limit` validado com `Number()` (aceita `0x10`, `1e2`), remoção do guard `missing currency` em `receipt.ts`, relatos finais com explicação errada do bug original.
- Leitura: o Code Mode não piora a correção medida (testes ocultos idênticos). Há um sinal fraco, não significativo, de mais mudança fora do escopo, e ele aparece mais nos modelos Anthropic, que não recebem o `<cell-workflow>`. Logo não é efeito da receita: é o hábito do Code Mode de reescrever o arquivo inteiro numa célula (`tool.write`/`Bun.write`) em vez de um edit localizado.

## Regra de escopo

Bloco `<code-mode-scope>` (texto em `variants/s1-scope.md`): editar só as linhas necessárias, não reescrever arquivo existente inteiro, manter guards/mensagens/caminhos que a tarefa não menciona, não adicionar tratamento de erro/exit/arquivos não pedidos, reler o diff antes de responder. Rodado só nos 6 modelos com mudanças fora do escopo (glm ficou de fora: o único defeito dele foi um newline final). 48 runs em sandbox, todas com sucesso, testes ocultos 430/432 (as 2 falhas são o caso `toString`, que o glm também erra nos dois braços). Dados: `results/v5-2026-11-21-scope/`.

Runs que reescreveram um arquivo existente inteiro:

| modelo | normal | code (como estava) | code + escopo |
|---|---|---|---|
| opus | 2/8 | 5/8 | 1/8 |
| haiku | 2/8 | 4/8 | 2/8 |
| sonnet | 0/8 | 6/8 | 4/8 |
| deepseek | 4/8 | 3/8 | 1/8 |
| sol, terra | 0/8 | 0/8 | 0/8 |

Revisão cega contra o braço normal da rodada de qualidade (mesmo modelo/tarefa/rep), mesmos 6 modelos (vitórias code – vitórias normal – empates):

| família | code como estava vs normal | code + escopo vs normal | tokens vs code como estava |
|---|---|---|---|
| Anthropic | 3 – 5 – 16 | 8 – 4 – 12 | opus +6%, haiku −10%, sonnet −24% (p=0,01) |
| OpenAI/Codex | 1 – 3 – 12 | 2 – 0 – 14 | sol +6%, terra +5% (n.s.) |
| open-weights (deepseek) | 2 – 2 – 4 | 2 – 3 – 3 | +58% (p=0,09) |

- Anthropic e OpenAI passam de "normal preferido" para empate ou melhor, sem custo de tokens: a regra foi adotada para essas famílias.
- deepseek para de reescrever arquivos, mas compensa com mais ciclos de edit/verificação (+58% tokens) e relatos piores (Δrelato −1,12); a preferência não melhora. Por isso o default para qualquer modelo fora de Anthropic/OpenAI fica só com a redução de tokens.
- O defeito do `cli` (rejeitar argumentos posicionais) caiu de 5/12 para 2/12 runs code; os 2 restantes são do haiku.

## Repositório real

Medição no próprio oh-my-pi, com o Code Mode já como default e o prompt adaptado por família. Quatro tarefas reais em `packages/utils` (`formatBytes`, `formatAge`, `LRUCache.oldestKeys()`, `truncate`), 7 modelos × 2 reps × normal/code = 112 runs. Cada run usa um `git worktree` novo de HEAD, a CLI roda em `bwrap` com `/tmp` privado e o checador oculto roda probes de borda, `bun test` em `packages/utils` e a lista de arquivos tocados. Dados e scripts: `results/v6-2026-11-21-real-repo/`.

| modelo | tokens normal→code (mediana) | Δ por par (mediana) | requests normal→code | checagens ocultas normal / code |
|---|---|---|---|---|
| opus | 124k → 59k | −52% | 6 → 4,5 | 108/108 / 108/108 |
| haiku | 145k → 78k | −56% | 7 → 5,5 | 108/108 / 108/108 |
| sonnet | 97k → 102k | −32% | 5 → 7,5 | 108/108 / 108/108 |
| deepseek | 260k → 137k | −59% | 15,5 → 12 | 106/108 / 98/108 |
| glm | 223k → 232k | +3% | 15,5 → 16,5 | 108/108 / 108/108 |
| terra | 128k → 63k | −56% | 11 → 7 | 108/108 / 108/108 |
| sol | 97k → 59k | −47% | 7,5 → 6,5 | 108/108 / 108/108 |

- O Code Mode foi mais barato em 44 de 54 pares completos; glm segue sem ganho, como nas rodadas sintéticas.
- Correção igual nos dois braços, exceto deepseek: um run code de `bytes` não corrigiu nada (6/16) e um run normal de `age` errou `0`/`NaN`.
- Diferença que o checador não pega: tirar o `.0` de `formatBytes` quebra asserções em `packages/coding-agent` (`50.0KB limit`). O braço normal atualizou esses testes em 5 de 14 runs de `bytes`; o code, em 0 de 14. Os dois braços atualizaram `packages/utils/test/ar/tar.test.ts`. Ou seja, em mudanças que vazam para outros pacotes o modo normal seguiu o efeito mais longe.
