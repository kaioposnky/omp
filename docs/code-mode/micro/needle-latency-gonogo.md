# Needle 3 — Latência e go/no-go — Micro

Parent: [macro/needle.md](../macro/needle.md)

## Requirement statement

O spike mede p50/p95 de latência em CPU e emite um veredito GO/NO-GO explícito segundo RF5.2: ≥ 95% de args válidos nas tools-alvo e p95 < 150 ms; abaixo disso, descartar.

## Acceptance criteria

- [ ] `needle-spike/run_needle.py` reporta p50 e p95 de latência em CPU por uso (A e B), emite GO/NO-GO calculado a partir das duas métricas, e o veredito com as tabelas fica registrado em `needle-spike/README.md` (seção "Resultados") — `NDL-3`, `needle-spike/run_needle.py`.

## Constraints

- Limiares fixos de RF5.2: acurácia ≥ 95% **e** p95 < 150 ms; um critério não compensa o outro.
- Medição em CPU, sem GPU, com o mesmo host para os dois usos; declarar o hardware no relatório.
- Latência inclui carga do modelo? Não: reportar separadamente "cold start" e "por chamada" — o critério de 150 ms é por chamada.
- Se GO, a integração futura é opcional, desligada por padrão, sem dependência Python obrigatória (RF5.3).
- Se NO-GO, o spike não é apagado: a fixture e os casos ficam como base de reavaliação; a decisão D5.1 continua "não integrar".
- Qualquer número no README precisa citar o comando que o produziu.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Amostra pequena (< 30 casos por tool) | Reportar como inconclusivo, não GO |
| p95 puxado por um outlier de GC/carregamento | Reportar a distribuição completa; não remover outlier sem registrar |
| Acurácia ≥ 95% mas p95 ≥ 150 ms | NO-GO (falha o critério de latência) |
| p95 < 150 ms mas acurácia < 95% | NO-GO (falha o critério de acurácia) |
| Runtime Python indisponível | Erro explícito; nenhum veredito emitido |
| WebAssembly medido em vez de Python | Permitido como linha separada; o gate usa uma plataforma declarada |

## Implementation parts

- [nano/needle-spike-gonogo-report.md](../nano/needle-spike-gonogo-report.md)
