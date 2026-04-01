# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

## Traffic Dashboard — Features

The `artifacts/traffic-dashboard` React app and `artifacts/api-server` Express API serve a live traffic analytics dashboard for Jordan (Airport Road + Amman networks, 92 AdMobilize screens).

**Key features:**
- Live screen health monitoring (92 devices, 5-min refresh)
- Hourly traffic volume chart (today, both networks)
- Traffic Pattern — Last 7 Days chart (7-day avg + per-day overlay toggle)
- Year-over-Year overlay chart (2022–2026, Amman solid + Airport Road dashed from Jun 2025)
- Ramadan impact analysis (2022–2026)
- Weather correlation (Open-Meteo, Pearson r)
- Screen Performance vs Last Week (top movers)
- Live map of all 92 screen locations (react-leaflet, color-coded by network + status)

**Data exclusions:** Street Count devices and Irbid excluded from all calculations via `isExcluded()` regex.

**API caches:** Hourly 30min · Weekly pattern 3h · Monthly/analysis/weather 6h · Device health 5min

---

## Planned: Role-Based Access Control (SharePoint + Active Directory)

**Deployment model:** Dashboard embedded in SharePoint as iframe. AD security groups control which SharePoint page each user can access. Each page embeds a different role URL.

**Roles and URL params:**

| Role | URL param | AD Group (suggested) |
|------|-----------|----------------------|
| Viewer | `?role=viewer` | `Dashboard-Viewers` |
| Analyst | `?role=analyst` | `Dashboard-Analysts` |
| Admin | `?role=admin` | `Dashboard-Admins` |

**Feature access per role:**

| Feature | Viewer | Analyst | Admin |
|---------|--------|---------|-------|
| Overview KPIs + hourly chart | ✅ | ✅ | ✅ |
| Traffic Pattern 7-day chart | ✅ | ✅ | ✅ |
| Screen health banner | Summary only | Full detail | Full detail |
| Insights tab (YoY, Ramadan, Weather) | ❌ | ✅ | ✅ |
| Map tab | ❌ | ✅ | ✅ |
| CSV download buttons | ❌ | ✅ | ✅ |
| Screen Performance vs Last Week | ❌ | ✅ | ✅ |
| Offline screen alerts (prominent) | ❌ | ❌ | ✅ |

**Implementation approach when ready:**
1. Read `role` from `new URLSearchParams(window.location.search).get('role')` in Dashboard.tsx
2. Gate tabs, downloads, and detail views behind role checks
3. IT sets each SharePoint page to embed a specific role URL — no AD SDK integration needed in the app

---

## Planned: Offline Screen Email Alerts

When a screen stops sending traffic counts, send an email notification automatically.

**How it works:**
- API server already polls device health every 5 minutes
- Add a background monitor that compares current offline devices against a known-offline set
- Send one email when a device **goes offline** (not every poll — only on state change)
- Send a recovery email when it **comes back online**

**Email delivery:** Office 365 SMTP (`smtp.office365.com:587`) via `nodemailer`

**Secrets needed (add once on custom domain):**
- `SMTP_USER` — sender email address (e.g. alerts@yourcompany.com)
- `SMTP_PASS` — password or app password for that account
- `ALERT_EMAIL_TO` — recipient(s), comma-separated

**Env vars to set (not sensitive):**
- `SMTP_HOST=smtp.office365.com`
- `SMTP_PORT=587`

**Implementation location:** `artifacts/api-server/src/routes/traffic.ts` — add a `startOfflineMonitor()` call after server start that wraps the existing `fetchDeviceHealth()` with state-diffing logic.

NOTE: Outlook OAuth integration was dismissed — using SMTP fallback instead.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
