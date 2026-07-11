# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Visitors** — multi-tenant SaaS for small Croatian renters (private landlords + flat-rate trades):
invoicing, fiscalization (JIR/ZKI/QR), financial-protection tooling, analytics, and an admin
backoffice. UI text is Croatian; code/identifiers are English.

npm-workspaces monorepo:
- `client/` — Vite + React 18 + TypeScript + Tailwind v4, installable PWA (`vite-plugin-pwa`).
- `server/` — Express + `mysql2` + TypeScript (CommonJS, run via `tsx`).

## Commands

Run from the repo root unless noted.

```bash
npm install                 # installs both workspaces (hoisted node_modules)
npm run dev                 # server (:4000) + client (Vite, :5173→first free port) concurrently
npm run dev:server          # server only  (tsx watch)
npm run dev:client          # client only  (vite)
npm run migrate             # apply pending SQL migrations (see below)
npm run build               # client (tsc -b && vite build) then server (tsc)
npm run build -w server     # typecheck/compile server only
npm run build -w client     # typecheck + bundle client only
npm run start               # run compiled server (dist/index.js)
```

- **There is no test suite.** "Verification" = `npm run build` (full TypeScript typecheck of both
  workspaces) plus driving the app in a browser. Do not invent a test command.
- The Vite dev server proxies `/api` → `http://localhost:4000`, so the client and API are
  same-origin in dev and the httpOnly session cookie just works. Ports 5173–5175 are often taken by
  other local projects, so Vite frequently lands on **5176**.

## Database & migrations

- Local dev expects MySQL reachable as configured in `server/.env` (defaults: `127.0.0.1:3306`,
  user `root`, no password, db `visitors_dev`). Copy `.env.example` → `server/.env`.
- Migrations are plain SQL in `server/migrations/*.sql`, applied in filename order. The runner
  ([server/src/db/migrate.ts](server/src/db/migrate.ts)) **creates the database if missing**, tracks
  applied files in `schema_migrations`, and runs each pending file in a transaction — so
  `npm run migrate` is idempotent and safe to re-run. Add a new numbered file to add schema; never
  edit an already-applied migration.
- Admin users are created **out of band**: `UPDATE users SET platform_role='admin' WHERE email=…`.

## Architecture (the parts that span multiple files)

**Multi-tenancy is manual and pervasive.** Every domain table has a `tenant_id`. `requireAuth`
([server/src/middleware/auth.ts](server/src/middleware/auth.ts)) verifies the JWT session cookie and
sets `req.auth = { userId, tenantId, platformRole }`; **every query must scope by `req.auth.tenantId`**
— there is no ambient tenant and no ORM. Platform-wide admin routes live under `/api/admin/*` behind
`requireAuth + requireAdmin` (`platform_role='admin'`). Auth is a JWT in an httpOnly cookie
(`AUTH_COOKIE`), bcrypt-hashed passwords; see `services/auth.service.ts`.

**Fiscalization is a replaceable component.** The app only ever talks to the `FiscalizationProvider`
interface ([server/src/fiscal/types.ts](server/src/fiscal/types.ts)); `getFiscalProvider()` selects a
concrete provider by the `FISCAL_PROVIDER` env var. Currently only `MockProvider` exists (returns
plausible JIR/ZKI; an invoice whose note contains `MOCKFAIL` fails its first attempt to exercise the
retry queue). A real Croatian provider is added as another adapter without touching callers.

**Invoices are append-only; correctness is date-based.** `invoice.service.ts` is the core:
- Numbering is transactional and gap-free — the sequence lives in `invoice_sequences`, incremented
  under `FOR UPDATE`; the number (`N/PREMISE_CODE/DEVICE_CODE`) is assigned **only at issue**, never
  for drafts. The `uq_invoice_number` unique key is the backstop.
- Issuing **freezes** the tax context: the VAT rate effective on the issue date (`resolveVatRate` in
  `pricing.service.ts`, from the effective-dated `tax_rates` table) and the VAT status effective on
  that date (`resolveVatStatusOnDate` in `vat.service.ts`, from `vat_status_changes`). Non-payers get
  the exemption clause instead of VAT. Later rate/status changes never touch already-issued invoices.
- Fiscalization runs **after** the DB commit, so a numbered invoice always persists even if the tax
  authority is unreachable (it becomes `fiscal_status='pending'` in `fiscal_requests` for later
  "naknadna fiskalizacija"). A correction is a **storno**: a new linked negative document; the
  original flips to `cancelled` but is never mutated.
- The **onboarding gate** (`onboarding.service.ts`, `getOnboardingStatus`) is the single source of
  truth for "can this tenant issue invoices yet"; both the dashboard checklist and the invoice
  gate read it, so the rule can't drift.

**Documents & exports** are generated server-side without a browser: PDFs via `pdfkit` with a bundled
Croatian-capable font in `server/assets/fonts/` (must be shipped on deploy); QR via `qrcode`; XLSX via
`exceljs`. The analytics endpoints (`analytics.service.ts` / `analyticsExport.service.ts`) share one
filter builder so the numbers on screen match all three export formats exactly.

**Background work**: `server/src/jobs/scheduler.ts` runs an in-process `setInterval` (~6h) that
applies due future-dated VAT-status changes and generates in-app reminders
(`notifications.service.ts`, deduped via a unique `dedupe_key`).

### Client

- Routing/layout: `App.tsx` wraps everything in `QueryClient → Theme → Toast → Confirm → Router →
  Auth`. Guards: `ProtectedRoute` / `AdminRoute` / `PublicOnlyRoute`. `AppShell` renders a pinned
  sidebar on `lg+`, a hamburger drawer below `lg`, and a bottom nav on mobile portrait.
- Data layer: `@tanstack/react-query` over a thin fetch wrapper (`lib/api.ts`, `credentials:'include'`,
  throws `ApiError`). Feature code lives in `client/src/features/<domain>/` (each usually has an
  `api.ts` of hooks + page/components); admin UI in `client/src/admin/`.
- Theming: design tokens are CSS variables in `client/src/index.css` mapped into Tailwind v4 via
  `@theme`; dark mode is the `.dark` class toggled by `theme/ThemeProvider.tsx`, with a pre-paint
  script in `index.html` to avoid a flash.
- Heavy routes are code-split with `React.lazy` (Analytics/recharts, the Help modal/react-markdown) —
  keep new chart/markdown-heavy screens lazy so the main PWA bundle stays lean.
- The user manual is `UPUTA.md` at the repo root, imported `?raw` into the Help modal (single source;
  `vite.config.ts` `server.fs.allow` includes the repo root for this).

## Conventions

- **No native dialogs.** Use the in-app `Modal`, `ToastProvider`/`useToast`, and
  `ConfirmProvider`/`useConfirm` (`components/ui/`) — never `window.alert/confirm`.
- Validate request bodies with `zod` in the route; wrap async handlers with `wrap()`
  (`utils/wrap.ts`) so rejections reach the error middleware.
- Audit every state-changing action via `audit()` (`services/audit.service.ts`).
- No CI/deploy pipeline exists yet (`.github/workflows/` is intentionally absent), so pushing does
  not trigger a deploy. Deployment target is a Hetzner VPS (aaPanel + MySQL) — set up later.
