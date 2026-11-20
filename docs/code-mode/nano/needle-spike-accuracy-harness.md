# Harness de acurácia do spike — Nano

Parent: [micro/needle-arg-validity.md](../micro/needle-arg-validity.md)

Code: `needle-spike/run_needle.py`, `needle-spike/cases.jsonl`, `needle-spike/fixtures/tool-schemas.json`, `packages/ai/src/utils/schema/wire.ts#toolWireSchema`

## How it works

O runner carrega a fixture de schemas e os casos rotulados, monta um prompt por caso e chama a Needle pelo runtime Python (`cactus-needle`). Para cada resposta:

1. Parseia o JSON; falha de parse conta como inválida.
2. Uso A (seletor): compara os nomes retornados com a tool esperada e calcula recall@k (k ≤ 5).
3. Uso B (reparo): valida os args contra o JSON Schema da tool esperada (a mesma fixture do wire) e conta campos inválidos.
4. Agrega por tool e por uso: `válidos / total`, com N explícito.
5. Anexa os resultados ao `README.md` (seção "Resultados") com o comando usado.

## Invariants

- A validação usa o schema da fixture, nunca uma cópia simplificada.
- Cada caso tem gabarito (tool esperada + args esperados); sem gabarito, fica fora da taxa.
- A taxa é sempre reportada com o N que a produziu.
- Uso A e uso B são reportados separadamente; um não compensa o outro.
- Nenhum caso de tool com efeito (`edit`, `bash`, `write`) é promovido a integração sem confirmação (RF5.4).

## Gotchas

- Schema do omp usa `$ref`/`additionalProperties` em formas que validadores Python tratam de modo diferente; fixar o validador (`jsonschema` com draft correto) para o número ser comparável.
- O `edit` hashline tem schema grande e aninhado; se o modelo devolver args "quase certos", a taxa cai rápido — reportar por tool evita esconder o problema na média.
- Prompt com o schema inteiro pode estourar a janela da Needle; truncar o schema muda o experimento — registrar a variante.
- Amostra < 30 casos por tool é inconclusiva; não emitir GO com N pequeno.
- O runner não pode importar código do fork; a fixture é a fronteira.

## Tarefa de implementação

- **Arquivos**: `needle-spike/run_needle.py`, `needle-spike/cases.jsonl`, `needle-spike/README.md`.
- **Passos**:
  1. Definir o formato de `cases.jsonl` (prompt, uso, tool esperada, args esperados).
  2. Implementar parse + validação + agregação por tool/uso.
  3. Emitir tabela com `válidos/total` e N.
  4. Registrar comando e versão do runtime no README.
- **Test IDs**: `NDL-2` em `needle-spike/run_needle.py` (casos em `needle-spike/cases.jsonl`).
- **Done when**: rodar o runner produz a tabela com N por tool e o comando documentado; nenhum número sem N.
