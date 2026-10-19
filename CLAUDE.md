# CLAUDE.md — orientation for future Claude sessions

**PrintLoop SaaS v2** — multi-tenant campus print marketplace.
Human entry: `README.md`. Doc index: `docs/README.md`.
Eng runbook: `docs/DEV-HANDOVER.md`.

## Where to start each session

1. `README.md` — what runs, how to boot it.
2. `docs/DEV-HANDOVER.md` — verified commands, env, tests.
3. `docs/ARCHITECTURE.md` — cloud-render → kiosk-spool (when touching print).
4. `docs/JOURNAL.md` (top) — latest phase; append new work on top.

## Folder layout (live surface)

- `printloop-api/` — **current** Express 5 + TypeORM API (neurapath
  layout: `modules/{public,customer,saas,platform,kiosk}` —
  `platform` owns SUPER_ADMIN + shared OpenAPI/files).
  Driver from `DATABASE_URL`: **Postgres in prod / Docker, SQLite for
  local dev**. Multi-tenancy shipped (`tenantId NOT NULL`;
  `common/middleware/tenant.middleware.ts`). Webhooks live under
  `modules/public`. No legacy `/api/admin` or `devApi`.
- `01-backend/` — **deprecated** predecessor; see its `DEPRECATED.md`.
  Do not add features; remove after cutover is verified.
- `printloop-new-frontend/` — React + Vite + RTK Query.
  `/` landing, `/find` marketplace, `/saas/*` tenant admin,
  `/platform` SUPER_ADMIN, `/print/new` upload.
- `printloop-kiosk-app/` — Electron kiosk (UI + local print + cloud poll).
- `render-worker/` — BullMQ PDF → PWG consumer; HMAC callback to API
  via `core/services/renderEnqueue.service.ts`. **Keep this**.
- `docs/` — living docs; `docs/archive/` is historical only;
  `docs/deploy/` is the deploy runbook.
- `deploy/` — platform config samples (Caddy, Fly, Render).
- `vendor/` — gitignored OpenPrinting reference clones (optional).

## Conventions

- **Cloud render, kiosk spool.** Heavy work in `render-worker/`.
- **Vendor, don't fork** OpenPrinting under `vendor/`.

## Design system (frontend)

Extend the editorial-brutalist system — never invent a new aesthetic:

- **Palette:** Ink `#1A1410`, Paper `#F8F4ED`, Persimmon `#D14B2C`,
  Ochre `#C7944A`, Sage `#6B7A5C`, Fog `#888888`
  (`printloop-new-frontend/tailwind.config.js`).
- **Type:** Fraunces (`pl-serif`), Inter, JetBrains Mono (`pl-mono`).
- **Components:** `pl-btn-*`, `pl-input`, `pl-card`, `pl-chip`,
  `editorial-label` in `src/index.css`.
- **Motion:** `src/components/ui/scrollFx.tsx` only; respect
  `prefers-reduced-motion`.

## When taking actions

- Explain in plain English; currency is Naira (NGN); first geography
  is Nigerian universities.
- Don't push / open PRs without explicit instruction.
- Don't commit secrets (`.env`, live Paystack keys, etc.).

## Agent skills

- Issue tracker: `docs/agents/issue-tracker.md` (`gh` CLI).
- Domain docs: `docs/agents/domain.md`.
