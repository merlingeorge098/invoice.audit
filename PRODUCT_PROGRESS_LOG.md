# Invoice.Audit Progress Log

This file tracks what has been completed as the product moves from guided prototype toward enterprise-ready SaaS. It should be updated after every meaningful implementation pass.

## Phase 1: Demo Stabilization

### Achieved

- Preserved the current guided demo experience under `/demo/*`.
- Kept legacy routes such as `/dashboard`, `/upload`, `/processing`, `/exceptions`, `/reports`, and `/settings` redirecting into demo mode.
- Confirmed the demo covers the product journey described in `PRODUCT_GUIDE.md`: dashboard, ingestion, processing, exceptions, invoice review, correction workbench, reports, and settings.
- Verified the local Express API supports demo state changes for invoice actions, corrections, settings toggles, and ruleset publishing.
- Confirmed the project health before Phase 2:
  - `npm test` passed.
  - `npm run build` passed.
  - `npm run lint` completed with only existing shadcn/ui fast-refresh warnings.
- Added `PRODUCT_FINISH_PLAN.md` as the detailed execution plan for finishing the product.

### Remaining Phase 1 Hardening

- Add Playwright smoke tests for all demo routes.
- Add `docs/DEMO_MODE.md`.
- Add stronger route metadata for page mode, permissions, and navigation.

## Phase 2: Tenant Routing and Guards

### Achieved So Far

- Added guarded tenant workspace routes:
  - `/app/:tenantSlug/dashboard`
  - `/app/:tenantSlug/upload`
  - `/app/:tenantSlug/processing`
  - `/app/:tenantSlug/exceptions`
  - `/app/:tenantSlug/invoice/:id`
  - `/app/:tenantSlug/comparison/:id`
  - `/app/:tenantSlug/reports`
  - `/app/:tenantSlug/settings`
- Added `RequireSession` to protect tenant workspace routes.
- Added cross-tenant frontend protection:
  - A signed-in Northwind user who opens `/app/acme/dashboard` is redirected back to `/app/northwind/dashboard`.
- Added workspace-aware route helpers for demo and enterprise paths.
- Added `useCurrentWorkspace` so shared pages can detect demo vs enterprise mode.
- Updated AppShell to show enterprise workspace context when inside `/app/:tenantSlug/*`.
- Updated page links and processing redirects so enterprise navigation stays inside `/app/:tenantSlug/*`.
- Updated React Query keys to include workspace identity, preventing demo and enterprise cache mixing.
- Updated mock auth callback so the success action opens the tenant workspace instead of returning to demo.
- Verified through browser smoke test:
  - Sign in with seeded Northwind identity.
  - Open `/app/northwind/dashboard`.
  - Attempt `/app/acme/dashboard`.
  - Confirm redirect back to `/app/northwind/dashboard`.

### Current Phase 2 Work In Progress

- Add dedicated unauthorized and expired-session pages.
- Add automated tests for tenant route guards and API authorization.

### Remaining Phase 2 Work

- Replace local storage session handling with a production-ready secure cookie strategy in a later auth phase.

### Latest Phase 2 Update: Enterprise API Enforcement

- Added workspace/session headers for enterprise-mode frontend API requests:
  - `X-Workspace-Mode`
  - `X-Tenant-Slug`
  - `X-Session-Token`
- Kept demo-mode API calls open so the guided demo continues to work without authentication.
- Added backend enterprise access middleware that:
  - resolves the mock enterprise session from `X-Session-Token`
  - rejects missing or expired sessions with `401`
  - rejects tenant mismatches with `403`
  - checks route permissions when a permission is required
- Protected enterprise-mode API reads for dashboard, invoices, exceptions, ingestion, processing, reports, and settings.
- Protected enterprise-mode API mutations for invoice actions, correction application, settings toggles, notification toggles, and ruleset publishing.
- Changed enterprise invoice action attribution so the backend uses the authenticated session user instead of trusting a frontend-provided actor.
- Added action-level permission checks:
  - approve requires `invoice:approve`
  - request evidence requires `invoice:request-evidence`
  - escalate requires `invoice:escalate`
  - assign reviewer requires `invoice:assign`
  - apply correction requires `invoice:apply-correction`
  - settings mutations require `settings:manage`
- Verified API behavior manually:
  - Missing enterprise session on dashboard returns `401`.
  - Valid Northwind enterprise session can read dashboard data.
  - Northwind session calling Acme tenant returns `403`.
  - AP Reviewer attempting approve action returns `403`.
- Re-ran project checks:
  - `npm test` passed.
  - `npm run build` passed.
  - `npm run lint` completed with only the existing shadcn/ui fast-refresh warnings.
