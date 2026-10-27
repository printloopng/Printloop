# PrintLoop

Multi-tenant campus print marketplace (Nigeria-first, Naira). Students
upload from a phone, pay with Paystack, pick up with a 6-character code.
Shops keep printers on their LAN; the cloud never talks to the printer
directly. Revenue = per-job commission (default 10%), not a subscription.

## Repo layout

| Path | What it is |
|---|---|
| `printloop-api/` | Express 5 + TypeORM API. Its OpenAPI spec is generated from code. |
| `printloop-web/` | Turborepo with four Next.js apps and the packages they share |
| `render-worker/` | Cloud PDF → PWG render consumer (**needed** for real prints) |
| `printloop-kiosk-app/` | Electron shop kiosk |
| `docs/` | Documentation |
| `deploy/` | Caddy / Fly / Render config samples |

The four web apps (`printloop-web/apps/`):

| App | Port | For |
|---|---|---|
| `landing` | 3000 | Marketing site, blog, shop finder |
| `customer` | 3001 | Students: print, pay, jobs, groups |
| `shop` | 3002 | Shop owners and staff: queue, kiosks, prices, payouts, Edit & Print |
| `backoffice` | 3003 | PrintLoop staff: shops, people, disputes, payouts, blog |

## Local setup (5 minutes)

Needs **Node 20.19+** and **pnpm** (for the web apps). Without
`DATABASE_URL` the API uses SQLite.

```powershell
# 1. API
cd printloop-api
Copy-Item .env.example .env
npm install
$env:SEED_DEMO='1'; $env:PORT='4000'; npm run boot
# http://localhost:4000/health

# 2. Web apps (new terminal)
cd printloop-web
pnpm install
pnpm dev
# landing :3000  customer :3001  shop :3002  backoffice :3003
```

Demo data (`SEED_DEMO=1` only) lives on one shop, `campus-print`. Open
the customer app at `http://localhost:3001/?shop=campus-print` to print
there.

| Account | Email | Password | Where |
|---|---|---|---|
| Student | `student@printloop.test` | `Password1!` | customer app |
| Shop owner | `owner@printloop.test` | `Admin1234!` | shop console |
| Shop admin | `ops@printloop.test` | `Admin1234!` | shop console |
| PrintLoop staff | `admin@printloop.test` | `Admin1234!` | backoffice |

There is no default shop: a request that doesn't say which shop it is
for gets `400 TENANT_REQUIRED`.

## Checks

```powershell
cd printloop-api; npm run typecheck; npm test
cd printloop-web; pnpm lint; pnpm typecheck; pnpm test; pnpm build
cd printloop-web; pnpm --filter @printloop/e2e e2e:install   # once
cd printloop-web; pnpm e2e    # builds must exist; starts its own API on SQLite
```

After changing an API route or response, regenerate the typed client:
`cd printloop-api; npm run openapi:export`, then `cd printloop-web; pnpm api:generate`.

First production staff account: `cd printloop-api; npm run admin:create -- <email> <password>`.

Full stack (Postgres + Redis + render-worker): `docker compose up --build`

## Docs

See **[`docs/README.md`](docs/README.md)**.

- Eng runbook → [`docs/DEV-HANDOVER.md`](docs/DEV-HANDOVER.md)
- Deploy (v2) → [`docs/deploy/saas.md`](docs/deploy/saas.md)
- Kiosk package → `cd printloop-kiosk-app && npm run package`
