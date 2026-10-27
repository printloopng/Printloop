# Deploy docs

| File | Use when |
|---|---|
| [`saas.md`](saas.md) | **Canonical v2** — Postgres multi-tenant SaaS |
| [`checklist.md`](checklist.md) | Pre-launch production checklist |
| [`render-platform.md`](render-platform.md) | Hosting on Render.com specifically |

Infra samples (Caddyfile, Fly, Render yaml) → [`../../deploy/`](../../deploy/).

Local full stack: `docker compose up --build` from the repo root.
Production compose: `docker compose -f docker-compose.prod.yml up`.
