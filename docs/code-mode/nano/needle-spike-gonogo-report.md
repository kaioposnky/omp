# Latência e veredito go/no-go — Nano

Parent: [micro/needle-latency-gonogo.md](../micro/needle-latency-gonogo.md)

Code: `needle-spike/run_needle.py`, `needle-spike/README.md`, `needle-spike/cases.jsonl`

## How it works

O mesmo runner da acurácia mede, por caso, o tempo de parede de uma chamada (excluindo cold start) e agrega p50/p95 com estatística simples (sem dependência pesada). O gate é booleano e explícito:

```
GO   se accuracy >= 0.95 nas tools-alvo E p95 < 150 ms (CPU, por chamada)
NO-GO caso contrário
```

Cold start é reportado em linha separada (carregar o modelo de 8–29 MB em CQ2), fora do critério. O README registra plataforma, CPU, versão do runtime e o comando, para que o número seja reproduzível.

## Invariants

- p95 é calculado sobre chamadas por-tool, não sobre a média dos usos.
- O gate usa os dois critérios; nenhum sozinho produz GO.
- Cold start nunca entra no p95 por chamada.
- Todo número no README tem comando e ambiente declarados.
- Amostra pequena é marcada "inconclusivo", nunca GO.

## Gotchas

- Medir a primeira chamada junto com as demais infla p95 com o carregamento do modelo; aquecer antes e descartar o warmup.
- `time.perf_counter` é o relógio certo; `time.time` tem granularidade ruim em Windows/CI.
- Se o runtime usar threads internas, latência varia com carga da máquina; rodar com máquina ociosa e registrar `nproc`.
- Arredondar p95 para baixo perto de 150 ms muda o veredito; reportar ms com uma casa decimal.
- GO não autoriza integração direta: RF5.3 exige integração opcional, desligada por padrão, sem Python obrigatório.

## Tarefa de implementação

- **Arquivos**: `needle-spike/run_needle.py`, `needle-spike/README.md`.
- **Passos**:
  1. Instrumentar cada chamada com `perf_counter` (warmup descartado).
  2. Calcular p50/p95 por uso e por tool.
  3. Calcular o gate com os limiares de RF5.2 e imprimir `GO`/`NO-GO` com a justificativa.
  4. Anexar a tabela + ambiente + comando ao README.
- **Test IDs**: `NDL-3` em `needle-spike/run_needle.py` (veredito em `needle-spike/README.md`).
- **Done when**: o runner imprime o veredito e o README contém a tabela com p50/p95, ambiente e comando.
