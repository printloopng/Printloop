# PrintLoop

Multi-tenant campus print marketplace (Nigeria-first, Naira). Students
upload from a phone, pay with Paystack, pick up with a 6-character code.
Shops keep printers on their LAN; the cloud never talks to the printer
directly. Revenue = per-job commission (default 10%), not a subscription.

## Repo layout

| Path | What it is |
|---|---|
| `printloop-api/` | **Current** Express 5 + TypeORM API (neurapath-style modules) |
| `01-backend/` | Deprecated predecessor — keep until cutover is verified, then remove |
| `printloop-new-frontend/` | React + Vite web app |
| `render-worker/` | Cloud PDF → PWG render consumer (**needed** for real prints) |
| `printloop-kiosk-app/` | Electron shop kiosk |
| `docs/` | Documentation |
| `deploy/` | Caddy / Fly / Render config samples |

## Local setup (5 minutes)

Needs **Node 20+**. Without `DATABASE_URL` the API uses SQLite.

```powershell
# 1. API
cd printloop-api
Copy-Item .env.example .env
npm install
$env:SEED_DEMO='1'; $env:PORT='4000'; npm run boot
# http://localhost:4000/health

# 2. Frontend (new terminal)
cd printloop-new-frontend
npm install
npm run dev
# http://localhost:5173
```

Demo logins (`SEED_DEMO=1` only):

- Customer: `student@printloop.test` / `Password1!`
- Admin: `admin@printloop.test` / `Admin1234!`

Full stack (Postgres + Redis + render-worker): `docker compose up --build`

## Docs

See **[`docs/README.md`](docs/README.md)**.

- Eng runbook → [`docs/DEV-HANDOVER.md`](docs/DEV-HANDOVER.md)
- Deploy (v2) → [`docs/deploy/saas.md`](docs/deploy/saas.md)
- Kiosk package → `cd printloop-kiosk-app && npm run package`
