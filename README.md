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
| `render-worker/` | Cloud PDF → PWG render consumer (needed for real prints) |
| `printloop-kiosk-app/` | Electron shop kiosk |
| `render.yaml` | Render Blueprint for the API, workers, Postgres and Redis |

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

Demo data (`SEED_DEMO=1` on an empty database only) lives on one shop,
`campus-print`. Open the customer app at
`http://localhost:3001/?shop=campus-print` to print there.

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
cd printloop-web; pnpm --filter @printloop/e2e exec playwright install chromium   # once
cd printloop-web; pnpm e2e    # starts its own API on SQLite; set E2E_LANDING_PORT if 3000 is taken
```

After changing an API route or response, regenerate the typed client:
`cd printloop-api; npm run openapi:export`, then `cd printloop-web; pnpm api:generate`.

## Deploying

- **API, worker, render-worker, Postgres, Redis → Render.** In Render choose
  *New → Blueprint* and point it at `render.yaml`. Every variable marked
  `sync: false` is filled in the dashboard; `printloop-api/.env.production.example`
  lists them with explanations. `JWT_SECRET` and `RENDER_CALLBACK_SECRET` must be
  the same value on every service that has them. Run exactly one `printloop-worker`
  (it owns the scheduled jobs). Migrations run on boot.
- **Web apps → Vercel**, one project per app with its root directory set to
  `printloop-web/apps/<app>`. Each needs `PL_API_URL`, `NEXT_PUBLIC_API_URL`,
  `PL_APEX_DOMAINS`, `PL_EDGE_SECRET` (same as the API), and the four
  `NEXT_PUBLIC_*_URL` origins (`printloop-web/.env.example`).
- **Paystack webhook:** `https://<api-host>/api/webhooks/paystack`.
- **First staff account:** `cd printloop-api; npm run admin:create -- <email> <password>`
  (run it as a Render one-off job or shell). Never set `SEED_DEMO=1` in production.
- **Kiosk:** `cd printloop-kiosk-app && npm run package`.
- The render-worker is the one service built from a Dockerfile (it needs
  Ghostscript and cups-filters, which Render's Node runtime can't install).
