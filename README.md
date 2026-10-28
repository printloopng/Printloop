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

Everything runs on Render (API with its background workers, Postgres, Redis) and Vercel (the four web apps). No Docker.

1. **Push this repo to GitHub.** Render deploys from the default branch.
2. **Create the object storage first.** Uploads must not live on Render's disk (it is wiped on every deploy). Use a Cloudinary account and note its cloud name, API key and API secret. Documents are stored privately (signed delivery only), so no Cloudinary security setting needs changing. The free plan caps raw files at about 10 MB, below the app's 50 MB limit, so use a paid plan if shops print large files.
3. **Render: New → Blueprint**, pick the repo, and Render reads `render.yaml`. It creates Postgres, Redis and `printloop-api` (all on the free plan), and asks for every variable marked `sync: false`. `printloop-api/.env.production.example` lists them all with example values. The ones that must match across services:
   - `JWT_SECRET`: a long random value (`openssl rand -hex 32`).
   - `PL_EDGE_SECRET`: the same value on the API and in every Vercel app.
   - `PUBLIC_BASE_URL`: the API's own public URL (for example `https://printloop-api.onrender.com`). Kiosks download files from it.
4. **Vercel: one project per app**, root directory `printloop-web/apps/<app>`. Each needs `PL_API_URL` and `NEXT_PUBLIC_API_URL` (the API URL), `PL_APEX_DOMAINS`, `PL_EDGE_SECRET`, and the four `NEXT_PUBLIC_*_URL` origins (see `printloop-web/.env.example`).
5. **Go back to Render** and set `LANDING_URL`, `CUSTOMER_APP_URL`, `SHOP_APP_URL`, `BACKOFFICE_URL` and `ALLOWED_ORIGINS` to the real Vercel URLs, then redeploy the API. (The two sides need each other's URLs, so this loop is unavoidable.)
6. **Paystack:** set the webhook to `https://<api-host>/api/webhooks/paystack`.
7. **First staff account:** the free plan has no Shell, so run it from `printloop-api` on your machine with `DATABASE_URL` set to the database's external connection string: `npm run admin:create -- <email> <password>`. Then sign in at the backoffice, which asks you to turn on two-step sign-in. Free-plan caveats: the API sleeps after 15 minutes idle (the first request then takes about a minute), and the free Postgres is deleted after 30 days, so upgrade it before real use.
8. **Check:** `https://<api-host>/health` returns ok, and a test signup on the shop app sends its verification email.

Notes: the API refuses to start in production without `DATABASE_URL`, `REDIS_URL`, `PAYSTACK_SECRET_KEY`, `PRINTLOOP_APEX_DOMAINS`, `JWT_SECRET` and storage (or `PUBLIC_BASE_URL`), and its log says which one is missing. The background workers run inside the API (`EMBED_WORKERS=1`), so keep exactly one API instance. When you outgrow that, set `EMBED_WORKERS=0` and add a Render worker service running `npm run start:worker`. Migrations run on boot. Never set `SEED_DEMO=1`.
Kiosks print by polling the API (`PRINT_DISPATCH_MODE=kiosk-pull`), so shops need no open ports. Word and PowerPoint uploads need a Gotenberg service (`GOTENBERG_URL`); PDFs and images work without it. The `render-worker/` is optional and off by default (`RENDER_ENABLED`), so it isn't in the blueprint.
