Este diretório é o omp-metrics, um painel já existente (backend em Rust, frontend em Astro + React) que lê o uso do oh-my-pi em `data/stats.db`. É um repositório git. Leia o código antes de mudar.

## Bugs relatados por quem usa

1. Clicar em "7 dias", "30 dias", "90 dias" ou "Tudo" não muda nada na tela.
2. O card "Sessões" mostra uma dúzia de sessões, mas o banco tem centenas.
3. Somando o custo de cada modelo na tabela de modelos, não chego no custo total do topo.
4. O período de 7 dias mostra 8 barras no gráfico diário. Um período de N dias deve cobrir exatamente N dias corridos, terminando no dia do registro mais recente.

## Funcionalidades novas

1. `GET /api/sessions?days=N&sort=S&limit=K` responde JSON:
   `{"total": <número de sessões com mensagens no período>, "sessions": [{"session_file", "folder", "model", "messages", "total_tokens", "cost", "first_ts", "last_ts", "tool_calls", "tool_errors"}]}`
   - Os agregados de cada sessão consideram só as mensagens e tool calls dentro do período. `model` é o modelo com mais mensagens na sessão. `first_ts` e `last_ts` são timestamps em ms.
   - `days`: como no dashboard; ausente ou 0 = todo o período.
   - `sort`: `cost` (maior custo primeiro), `tokens` (mais tokens primeiro) ou `recent` (`last_ts` mais recente primeiro). Padrão: `recent`.
   - `limit`: padrão 20, de 1 a 200.
   - Parâmetro inválido (sort desconhecido, limit fora da faixa, days negativo) responde 400 com `{"error": "<mensagem>"}`.
2. `GET /api/export.csv?days=N` responde `text/csv` com o cabeçalho exato `date,messages,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,total_tokens,cost` e uma linha por dia do período (incluindo dias sem atividade), em ordem crescente de data (`AAAA-MM-DD`).
3. Uma página `/sessions` no site: tabela das sessões vinda da API, com seletor de ordenação (custo, tokens, recentes) e o mesmo seletor de período do painel. O painel principal tem um link para ela.

## Regras

- Testes automatizados no backend (`cargo test` em `backend/`) cobrindo a janela de período e o endpoint de sessões.
- `./start.sh` continua subindo tudo em http://localhost:4321.
- Atualize o README com os endpoints novos.
- Faça commits do seu trabalho com mensagens descritivas. Ao terminar, a árvore de trabalho deve estar limpa.
