Crie neste diretório um site simples para consultar o uso de tokens e as métricas gerais do oh-my-pi (omp).

Requisitos:
- Frontend em Astro + React.
- Backend em Rust.
- Os dados vêm de `data/stats.db`, uma cópia do banco SQLite em que o oh-my-pi registra o uso (`~/.omp/stats.db`). O backend lê desse arquivo.
- O site tem gráficos.
- O site tem algum tipo de animação 3D.
- `./start.sh`, na raiz, sobe tudo o que for necessário e deixa o site acessível em http://localhost:4321.
- Um README curto explicando como rodar.

Todas as outras decisões são suas.
