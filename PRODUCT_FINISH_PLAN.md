# Invoice.Audit Product Finish Plan

## Purpose

This document assesses the current Invoice.Audit website against `PRODUCT_GUIDE.md` and `ENTERPRISE_PRODUCT_ROADMAP.md`, then defines the work required to turn the current prototype into a finished enterprise-ready product.

The current product already communicates the right category: an intelligent pre-payment invoice assurance platform. The work ahead is less about redesigning the site and more about replacing simulated layers with production-grade auth, tenancy, persistence, integrations, controls, and evidence workflows.

## Current Website Assessment

### Overall status

Invoice.Audit is currently a polished guided demo with a local Express API and in-memory workflow state. It has a strong end-to-end product story, meaningful route coverage, invoice review actions, correction actions, settings toggles, and a mock enterprise authentication flow.

It is not yet a production SaaS product because customer data is not persisted in a database, tenant routes are reserved but not implemented, RBAC is modeled but not enforced across APIs, uploaded files are not stored or processed, audit evidence is mutable in memory, and enterprise identity providers are simulated.

### Verified technical health

- `npm test` passes: 2 test files, 4 tests.
- `npm run build` passes.
- `npm run lint` completes with 7 warnings from reusable shadcn/ui component exports.
- Vite build reports a large JavaScript chunk warning, which is acceptable for the prototype but should be addressed before production.

### Existing routes

| Area | Current route | Current status |
| --- | --- | --- |
| Entry page | `/` | Implemented with dual entry: demo and workspace sign-in |
| Demo dashboard | `/demo/dashboard` | Implemented with metrics, workflow lanes, queue, insights |
| Demo upload | `/demo/upload` | Implemented as UI intake simulation with local browser file queue |
| Demo processing | `/demo/processing` | Implemented as simulated staged processing |
| Demo exceptions | `/demo/exceptions` | Implemented with filters, exception cards, summaries |
| Demo invoice review | `/demo/invoice/:id` | Implemented with invoice detail, validations, flags, line items, audit trail, actions |
| Demo correction workbench | `/demo/comparison/:id` | Implemented with field comparison and apply-suggestion action |
| Demo reports | `/demo/reports` | Implemented with charts and summary analytics |
| Demo settings | `/demo/settings` | Implemented with rule toggles, notifications, integrations, roles, publish action |
| Auth start | `/auth/start` | Implemented as mock organization discovery and provider routing |
| Auth callback | `/auth/callback` | Implemented as mock session establishment |
| Legacy routes | `/dashboard`, `/upload`, etc. | Redirect to demo routes |
| Tenant workspace | `/app/:tenantSlug/*` | Planned but not implemented, except reserved target paths in session data |

### Existing backend/API behavior

The local Express API currently supports:

- Health check: `GET /api/health`
- Mock organization discovery: `POST /api/auth/discover`
- Mock enterprise auth start: `POST /api/auth/start`
- Mock auth callback/session creation: `POST /api/auth/callback`
- Mock session resolution/logout: `GET /api/auth/session`, `POST /api/auth/logout`
- Dashboard data: `GET /api/dashboard`
- Invoice list/detail: `GET /api/invoices`, `GET /api/invoices/:id`
- Invoice actions: `PATCH /api/invoices/:id/actions`
- Comparison correction: `PATCH /api/invoices/:id/comparisons/:field/apply`
- Exceptions: `GET /api/exceptions`
- Ingestion, processing, reports, settings: `GET /api/ingestion`, `/processing`, `/reports`, `/settings`
- Settings mutations: rule toggles, notification toggles, publish ruleset

The backend is useful for demo and early behavior testing, but it is still an in-memory store. Restarting the server resets state.

## What Already Works Well

### Product narrative

The website clearly positions Invoice.Audit as a control-first finance product, not a generic OCR uploader. The page flow matches the intended assurance journey: ingest, process, validate, triage, review, correct, report, govern.

### Demo mode

Demo mode is now formalized under `/demo/*`, and legacy routes redirect cleanly. The shared demo workspace label is visible in the shell, which supports the roadmap principle that demo and real customer data must be separate.

### Workflow actions

Invoice actions are not just visual. Approve, request evidence, escalate, assign reviewer, and apply correction mutate server-side in-memory state and update React Query caches. This makes the demo feel coherent.

### Enterprise auth foundation

The app has a realistic mock enterprise auth shape:

- email domain discovery
- provider mapping for Entra ID, Okta, and Google Workspace
- mock session token
- organization, workspace, tenant slug, role, and permissions
- local session persistence
- reserved tenant target path

This is a good foundation for real SSO and tenant routing.

## Main Product Gaps

### 1. Tenant workspace routes are not active

The session returns targets like `/app/acme/dashboard`, but React Router does not yet define `/app/:tenantSlug/*` pages. Signed-in users are currently sent back to demo mode after callback.

### 2. Data is not tenant-scoped

The same in-memory invoice records power all views. There is no real customer data boundary, no workspace-scoped repository layer, and no API enforcement of tenant ownership.

### 3. RBAC is modeled but not enforced

Roles and permissions exist in the session payload, but API endpoints do not require a session token and do not check whether the actor can perform a mutation.

### 4. Persistence is missing

Invoices, settings, sessions, audit events, corrections, and workflow state are held in process memory. A finished product needs PostgreSQL-backed persistence with migrations, transactions, tenant filters, and backups.

### 5. Upload is only a frontend queue

The upload page accepts browser files into local component state, but there is no upload API, storage object, document metadata record, malware/type validation, extraction job creation, or processing linkage.

### 6. Processing is simulated

The processing page displays staged progress but does not reflect real jobs, queues, extraction status, validation runs, or workflow routing results.

### 7. Audit trail is not tamper-evident

Audit entries are visible and useful in the demo, but they are mutable in-memory arrays. Enterprise audit evidence needs append-only storage, actor/session attribution, event hashes, export packages, and retention controls.

### 8. Settings are not governance-grade

Rules and notifications can be toggled, but there is no versioned ruleset model, approval workflow for rule changes, effective dates, rollback, or audit event for every governance mutation.

### 9. Integrations are catalog-only

ERP, inbox, API, SFTP, vendor portal, and notification integrations are represented visually, but no connector setup, credentials, polling, webhook, mapping, or sync state exists.

### 10. Test coverage is early

Tests cover a small set of store behaviors. Production readiness needs API authorization tests, route guard tests, UI workflow tests, upload tests, settings tests, and end-to-end tests for both demo and enterprise paths.

## Definition of Finished Product

Invoice.Audit should be considered finished when it supports these capabilities end to end:

1. A user can explore a polished demo without credentials.
2. A real enterprise user can sign in through a supported identity provider.
3. The backend maps the user to the correct tenant, workspace, role, and permissions.
4. Every enterprise route is guarded by session and tenant checks.
5. Every API request is tenant-scoped and permission-enforced.
6. Invoices and documents can be uploaded, stored, processed, reviewed, corrected, approved, escalated, blocked, and reported.
7. All important user and system actions create durable audit events.
8. Rules, approval policies, notifications, users, roles, and integrations are persisted and governed.
9. Dashboards, exception queues, invoice views, reports, and settings use real tenant data.
10. The product has reliable tests, observability, error handling, security controls, deployment configuration, and operational documentation.

## Recommended Build Phases

## Phase 1: Stabilize Demo and App Shell

### Goal

Preserve the current demo as the sales and onboarding experience while preparing shared components for both demo and tenant workspaces.

### Work items

- Keep `/demo/*` routes as the canonical demo experience.
- Add a clear `WorkspaceMode` concept: `demo` or `enterprise`.
- Update query keys to include workspace mode and tenant slug.
- Extract page data dependencies behind a provider/repository boundary.
- Keep legacy redirects for backwards compatibility.
- Add route-level metadata for page title, required permissions, and mode.
- Add Playwright smoke tests for all demo routes.

### Acceptance criteria

- Demo mode works exactly as it does today.
- Demo data remains explicitly labeled and isolated.
- Shared UI components can render from either demo data or enterprise API data.

## Phase 2: Implement Tenant Routing and Guards

### Goal

Activate `/app/:tenantSlug/*` routes for authenticated workspace usage.

### Work items

- Add route definitions for:
  - `/app/:tenantSlug/dashboard`
  - `/app/:tenantSlug/upload`
  - `/app/:tenantSlug/processing`
  - `/app/:tenantSlug/exceptions`
  - `/app/:tenantSlug/invoice/:id`
  - `/app/:tenantSlug/comparison/:id`
  - `/app/:tenantSlug/reports`
  - `/app/:tenantSlug/settings`
- Create `RequireSession` and `RequireTenantAccess` guards.
- Validate that route tenant slug matches the authenticated session tenant.
- Add unauthorized and expired-session pages.
- Make the app shell show enterprise workspace name, user role, and sign-out action.
- Keep demo navigation separate from enterprise navigation.

### Acceptance criteria

- A mock signed-in user can enter `/app/acme/dashboard`.
- A user from `northwind` cannot open `/app/acme/dashboard`.
- Unauthenticated users are redirected to `/auth/start`.

## Phase 3: Add Production Persistence

### Goal

Replace the in-memory enterprise path with a real PostgreSQL persistence layer while keeping seeded demo data available.

### Work items

- Add PostgreSQL and migration tooling.
- Create initial schema for:
  - organizations
  - workspaces
  - users
  - identities
  - memberships
  - roles
  - permissions
  - sessions
  - invoices
  - invoice_documents
  - invoice_line_items
  - invoice_validation_checks
  - invoice_flags
  - invoice_field_comparisons
  - invoice_actions
  - processing_jobs
  - rulesets
  - rule_versions
  - notification_settings
  - approval_policies
  - audit_events
- Add repository functions that require `workspaceId` or `tenantId`.
- Seed demo-like tenant data for local development.
- Add transaction boundaries for invoice actions and audit logging.

### Acceptance criteria

- Enterprise data survives server restarts.
- All enterprise repository calls require tenant scope.
- Demo data does not write into enterprise tenant tables unless explicitly seeded for development.

## Phase 4: Enforce Backend Authentication and RBAC

### Goal

Move security from UI convention to backend enforcement.

### Work items

- Add auth middleware to resolve session from secure cookie or bearer/session token.
- Add permission middleware for every protected route.
- Replace frontend-provided `actor` with session-derived actor identity.
- Enforce role permissions for:
  - invoice approval
  - evidence request
  - escalation
  - reviewer assignment
  - correction application
  - report export
  - settings management
  - ruleset publication
- Add API tests for allowed and denied actions.

### Acceptance criteria

- An AP Reviewer cannot approve if the policy requires Finance Manager.
- An Auditor can view evidence and reports but cannot mutate invoices.
- Every mutation records the authenticated actor.

## Phase 5: Build Real Upload and Document Intake

### Goal

Turn the upload page into a real ingestion layer.

### Work items

- Add upload session API.
- Store files in object storage or a local development storage adapter.
- Persist document metadata with workspace, uploader, source channel, checksum, MIME type, size, and status.
- Validate supported file types and size limits.
- Add malware scanning hook or placeholder adapter.
- Create processing jobs after successful upload.
- Show real uploaded document status in the upload page.
- Add error states for failed validation and failed upload.

### Acceptance criteria

- A tenant user can upload an invoice file.
- The file is stored and linked to a tenant-scoped document record.
- A processing job is created and visible from the processing route.

## Phase 6: Implement Processing, Extraction, and Validation Jobs

### Goal

Make the processing pipeline reflect real job state.

### Work items

- Add a background worker or job runner abstraction.
- Persist processing stages and timestamps.
- Add extraction adapter interface for OCR/document intelligence.
- Start with a deterministic parser or mock extraction adapter for development.
- Persist extracted invoice fields and confidence scores.
- Run validation checks for vendor, duplicate, tax, PO, GRN, evidence, and approval policy.
- Generate invoice flags and risk score from validation outputs.
- Route invoices to auto-approved, pending review, needs evidence, escalated, or blocked.
- Emit audit events for each processing stage.

### Acceptance criteria

- Uploaded documents move through persisted job states.
- Processing produces an invoice record with extracted fields, checks, flags, risk, and workflow recommendation.
- Dashboard and exceptions update from the new record.

## Phase 7: Finish Invoice Review and Corrections

### Goal

Make the reviewer workspace production-grade.

### Work items

- Load invoice document preview from secured storage.
- Add reviewer notes and required reason fields for sensitive actions.
- Add policy checks before approval.
- Support evidence request records and status.
- Persist correction proposals, accepted corrections, original values, and reasons.
- Add invoice version history.
- Add assignment and queue ownership records.
- Add optimistic UI with rollback on API error.
- Disable or hide actions based on role and invoice state.

### Acceptance criteria

- Every invoice action is permission-checked, persisted, and audited.
- Corrections preserve original, extracted, suggested, accepted, actor, reason, and timestamp.
- Reviewers cannot silently alter invoice data.

## Phase 8: Governance, Settings, and Controls

### Goal

Turn settings into a real control administration area.

### Work items

- Persist tenant rulesets and rule versions.
- Add draft, published, archived ruleset states.
- Add approval thresholds and approval matrix persistence.
- Add notification settings by channel and recipient group.
- Add integration settings with secure secret storage.
- Add role and permission visibility.
- Add audit events for every settings mutation.
- Add publish confirmation with version summary.

### Acceptance criteria

- Admins can edit and publish a ruleset version.
- Published rules are used by validation jobs.
- Settings changes are visible in audit history.

## Phase 9: Reports, Analytics, and Audit Evidence

### Goal

Make analytics and evidence export reliable for finance leaders and auditors.

### Work items

- Build tenant-scoped aggregation queries.
- Add date range filters and saved views.
- Add report export authorization.
- Persist report snapshots when needed.
- Build audit event search and filtering.
- Add evidence package generation for an invoice.
- Include invoice metadata, document references, validations, flags, actions, corrections, timestamps, and actor identities in evidence packages.
- Add hash chaining or signed evidence manifest for tamper-evident exports.

### Acceptance criteria

- Reports reflect only the current tenant.
- Auditors can export read-only evidence packages.
- Evidence packages can be traced back to immutable audit events.

## Phase 10: Real Enterprise Identity and Admin

### Goal

Replace mock identity flows with real enterprise SSO and admin controls.

### Work items

- Add OIDC provider integration first.
- Support Microsoft Entra ID, Okta, and Google Workspace through provider configuration.
- Add generic SAML support after OIDC flow is stable.
- Add organization domain verification.
- Add admin pages for users, roles, identity provider settings, and access logs.
- Add invitation or just-in-time provisioning policy.
- Store identity provider metadata per tenant.
- Move session token from local storage to secure HTTP-only cookie for production.
- Add logout, session expiry, refresh, and revoked-session handling.

### Acceptance criteria

- Enterprise users can sign in through a configured IdP.
- Users are provisioned into the correct tenant and role.
- Admins can manage workspace access.

## Phase 11: Security, Observability, and Production Operations

### Goal

Prepare the application to run safely in production.

### Work items

- Add environment variable validation.
- Add structured logging.
- Add request IDs and audit correlation IDs.
- Add rate limits for auth, upload, and mutation endpoints.
- Add CSRF strategy if using cookies.
- Add secure headers.
- Add error monitoring.
- Add performance monitoring.
- Add database backup and migration runbook.
- Add deployment configuration for frontend, API, worker, database, and object storage.
- Add CI checks for lint, tests, typecheck, build, and Playwright.

### Acceptance criteria

- Production deployment can be reproduced from documentation.
- Security-sensitive routes are protected.
- Operational issues are observable and diagnosable.

## Feature Completion Matrix

| Feature | Current state | Finish requirement |
| --- | --- | --- |
| Demo mode | Strong guided demo | Preserve and test as official demo workspace |
| Enterprise auth | Mock discovery/session | Real OIDC/SAML, secure cookie session, domain verification |
| Tenant routing | Reserved paths only | Full `/app/:tenantSlug/*` guarded workspace |
| RBAC | Role data exists | Backend permission enforcement and role-aware UI |
| Dashboard | Demo/API metrics | Tenant-scoped aggregation and role-specific widgets |
| Upload | Browser-local queue | Stored tenant documents, upload API, validation, processing jobs |
| Processing | Simulated stages | Persisted job pipeline with extraction and validation results |
| Exceptions | Filtered demo queue | Tenant queue, paging, search, saved views, SLA ownership |
| Invoice review | Functional demo actions | Policy-enforced production decisions and secured document preview |
| Corrections | Apply suggestion in memory | Versioned, attributed, auditable field correction workflow |
| Reports | Demo analytics | Tenant-safe reports, filters, exports, snapshots |
| Settings | Toggles and publish action | Versioned controls, approval policies, integrations, audit events |
| Audit trail | Visible mutable arrays | Append-only/tamper-evident audit evidence |
| Integrations | Catalog display | ERP, inbox, SFTP, API, portal, notification connector foundations |
| Tests | Early unit tests | API, UI, e2e, RBAC, upload, tenant isolation coverage |

## Immediate Next Sprint Recommendation

The next sprint should focus on the enterprise foundation rather than advanced OCR:

1. Activate `/app/:tenantSlug/*` tenant routes.
2. Add route guards using the existing mock session.
3. Make AppShell mode-aware for demo vs enterprise.
4. Add tenant-aware React Query keys.
5. Add backend auth middleware that resolves the mock session token.
6. Enforce tenant and permission checks on invoice actions.
7. Add tests proving cross-tenant access is blocked.

This gives the product a real SaaS skeleton while preserving the polished demo experience.

## Suggested New Files and Modules

Recommended frontend additions:

- `src/routes/AppRoutes.tsx`
- `src/components/RequireSession.tsx`
- `src/components/RequirePermission.tsx`
- `src/lib/workspace-context.tsx`
- `src/lib/permissions.ts`
- `src/hooks/useWorkspaceApi.ts`

Recommended backend additions:

- `server/auth/middleware.ts`
- `server/auth/providers.ts`
- `server/auth/session.ts`
- `server/db/client.ts`
- `server/db/schema.ts`
- `server/repositories/invoices.ts`
- `server/repositories/audit-events.ts`
- `server/repositories/settings.ts`
- `server/services/invoice-actions.ts`
- `server/services/processing-jobs.ts`
- `server/services/audit-evidence.ts`

Recommended documentation additions:

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `docs/TESTING.md`

## Final Product Direction

Invoice.Audit should be finished as two connected but clearly separated experiences:

- A polished shared demo workspace for product discovery.
- A secure tenant workspace for real enterprise finance teams.

The current website already proves the workflow and product story. The remaining work is to make the same experience durable, secure, tenant-safe, auditable, and integration-ready.
