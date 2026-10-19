# Deploy config samples

Not applied automatically — copy / adapt for your host.

| File | Purpose |
|---|---|
| `Caddyfile.example` | Reverse proxy + on-demand TLS for custom domains |
| `fly.toml` | Fly.io app sample |
| `render.yaml` | Render.com blueprint sample |

Compose files stay at the **repo root** (`docker-compose.yml`,
`docker-compose.prod.yml`) so `docker compose` works without flags.

Written runbooks → [`../docs/deploy/`](../docs/deploy/).
