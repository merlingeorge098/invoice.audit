# InvoiceAudit Pro — Full SaaS Implementation Plan

**Stack confirmed:** Supabase (PostgreSQL + Storage) · Google OAuth + Email OTP · Stripe billing · Railway deployment  
**Rule:** Demo workspace (`/demo/*`, `src/data/`, `server/store.ts` demo entries) is never touched.  
**Completion target:** Every feature reads/writes real data. Zero mock baselines in production paths.

---

## APIs & Credentials You Must Provide

Before any phase can go live, collect these. Keep them in `.env` (never commit):

| Variable | Where to get it | Used in |
|---|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (Transaction mode) | Prisma, all DB queries |
| `SUPABASE_URL` | Supabase → Settings → API | File storage, realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Server-side storage operations |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API | Client-side storage uploads |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 credentials | SSO login |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 credentials | SSO login |
| `RESEND_API_KEY` | resend.com → API Keys | Email OTP + notifications |
| `OPENAI_API_KEY` | platform.openai.com → API Keys | GPT-4o invoice extraction |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys | Billing backend |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys | Billing frontend |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → signing secret | Billing webhook verification |
| `SESSION_SECRET` | Generate: `openssl rand -hex 32` | JWT session signing |
| `AUDIT_SIGNING_KEY` | Generate: `openssl rand -hex 64` | Audit trail cryptographic signing |
| `APP_URL` | e.g. `https://invoiceaudit.up.railway.app` | OAuth redirect URIs, email links |

---

## Phase 0 — Security Hardening & Project Cleanup
**Goal:** Remove all exposed secrets, set up `.env.example`, protect git history.

### Steps

**0.1 — Revoke and rotate all exposed keys**
- The current `.env` file contains a live `OPENAI_API_KEY` and `RESEND_API_KEY` committed to the project folder. Revoke both immediately from their dashboards and generate new ones.
- File to fix: `invoice-auditor-pro/.env` → move all values out, replace with empty placeholders.

**0.2 — Create `.env.example`**
- Create `invoice-auditor-pro/.env.example` listing every variable from the table above with empty values and a comment explaining each.
- Add `.env` to `invoice-auditor-pro/.gitignore` if not already present.

**0.3 — Create `.env.production`**
- Separate file for Railway environment injection (not committed). Documents which vars go on Railway.

**0.4 — Audit `server/store.ts`**
- The `store.ts` file contains both demo data (keep) and mock enterprise org seeds (`acme.com`, `northwind.com`, `globex.com`, `startup.com`). These mock orgs need to be removed from production boot — they currently auto-create sessions and bypass real auth. Add a `DEMO_SEED_ENABLED=true` env guard around all mock-org seeding so production runs with `DEMO_SEED_ENABLED=false`.
- Files: `server/store.ts`, `server/index.ts`

**0.5 — Remove hardcoded baseline metric padding**
- `server/store.ts` exports `baselineMetricValues` (2487 invoices, 42 pending, etc.) that are added to real tenant counts. Remove this padding from all enterprise metric queries.
- Files: `server/store.ts`, `server/enterprise.ts` (search for `baseline`)

---

## Phase 1 — Database Migration (SQLite → Supabase PostgreSQL)
**Goal:** All production data lives in Supabase PostgreSQL. SQLite stays for local dev only.

### Steps

**1.1 — Update Prisma schema for PostgreSQL**
- File: `prisma/schema.prisma`
- Change `provider = "sqlite"` to `provider = "postgresql"`.
- Add `@db.Text` annotations where needed for long string fields.
- Change `AuditEvent.signature` field type if SQLite-specific.
- Add `createdAt` default timezone considerations (`@default(now())` already correct).

**1.2 — Add connection pooling config**
- Supabase uses PgBouncer. Set `DATABASE_URL` to the **Transaction mode** connection string (port 6543).
- Add `connection_limit=1` for serverless/Railway environments.
- File: `prisma/schema.prisma` → `datasource db { url = env("DATABASE_URL") }`

**1.3 — Run initial migration**
```bash
# In invoice-auditor-pro/
npx prisma migrate dev --name init_postgres
npx prisma generate
```
- This creates the full schema in Supabase: Tenant, User, WorkspaceMembership, Session, VerificationToken, Invoice, ValidationCheck, InvoiceFlag, StructuredField, LineItem, FieldComparison, AuditEvent, RuleSetting, NotificationSetting, InvoiceAnomaly.

**1.4 — Add missing tables to schema**
The following tables don't exist yet but are required for full SaaS:
- `StripeCustomer` — maps Tenant → Stripe customer/subscription IDs
- `PlanLimit` — stores per-plan feature limits (max invoices/month, max seats, etc.)
- `UsageEvent` — tracks billable usage per tenant per month
- `VendorMaster` — real vendor records per tenant (replaces mock vendor validation)
- `PurchaseOrder` — PO records for PO/GRN matching
- `GoodsReceipt` — GRN records for 3-way matching
- `NotificationEvent` — in-app notification inbox per user
- `InviteToken` — pending team invitations
- `AuditSnapshot` — periodic metric snapshots for trend charts
- Add all these to `prisma/schema.prisma` and run `npx prisma migrate dev --name add_saas_tables`.

**1.5 — Seed initial plan definitions**
- Create `prisma/seed.ts` that inserts `PlanLimit` rows for Free, Pro, Enterprise tiers.
- Free: 50 invoices/month, 3 seats, no SSO, no GST reconciliation.
- Pro: 500 invoices/month, 10 seats, Google SSO, GST reconciliation.
- Enterprise: unlimited, unlimited seats, all SSO providers, all features.
- Run with `npx prisma db seed`.

---

## Phase 2 — Real Authentication System
**Goal:** Replace all mock SSO callbacks and hardcoded sessions with real Google OAuth 2.0 + Email OTP. RBAC enforced everywhere.

### 2A — Google OAuth 2.0

**2A.1 — Install passport + google strategy**
```bash
npm install passport passport-google-oauth20 express-session connect-pg-simple
npm install -D @types/passport @types/passport-google-oauth20 @types/express-session
```

**2A.2 — Create `server/auth/google.ts`**
Implement:
- `GET /api/auth/google` — redirect to Google consent screen with scopes: `openid email profile`.
- `GET /api/auth/google/callback` — receive OAuth code, exchange for tokens, extract `email`, `name`, `picture`.
- On callback:
  1. Look up Tenant by email domain.
  2. If no tenant: redirect to `/auth/org-not-found?domain=<domain>` (user's org isn't registered yet — prompt them to start a trial).
  3. If tenant found: upsert User record (name, email, picture), create WorkspaceMembership with default role if first login, create Session in DB, set secure HttpOnly cookie.
  4. Redirect to `/app/:tenantSlug/dashboard`.

**2A.3 — Configure Google Cloud Console**
- Authorized redirect URIs: `${APP_URL}/api/auth/google/callback`
- Authorized JavaScript origins: `${APP_URL}`
- Tell the user to add these when they set up credentials.

**2A.4 — Frontend: Google sign-in button**
- File: `src/pages/AuthStart.tsx` (or current auth page)
- Add `<a href="/api/auth/google">` button styled with Google branding guidelines.
- Keep Email OTP path alongside it.

### 2B — Email OTP

**2B.1 — Harden OTP flow in `server/auth.ts`**
Current issues:
- OTP is logged to console only when `RESEND_API_KEY` is missing.
- No rate limiting per email address (only global rate limit).
- OTP has no expiry check in validation.

Fixes:
- Enforce 10-minute expiry on `VerificationToken.expiresAt` (already in schema, but verify the check exists in `POST /api/auth/verify-otp`).
- Add per-email rate limit: max 3 OTP requests per 10 minutes using an in-memory or Redis counter keyed by email.
- Remove console fallback — if `RESEND_API_KEY` is missing, return HTTP 503 with message "Email service not configured."
- Send real email via Resend with a branded HTML template (InvoiceAudit Pro logo, 6-digit code, expiry notice).

**2B.2 — Create `server/email/templates/otp.ts`**
HTML email template with:
- Company logo (or name).
- "Your login code is: **XXXXXX**".
- "This code expires in 10 minutes."
- "If you didn't request this, ignore this email."

### 2C — Session Management

**2C.1 — Replace dual-mode sessions**
Currently `server/store.ts` has in-memory `MockSession` mixed with DB sessions. The enterprise path already uses DB sessions (`Session` table). Clean this up:
- All enterprise sessions → DB only.
- Session token = secure random 32-byte hex string (not JWT for now, to keep it simple and revocable).
- Store: `sessionToken`, `userId`, `tenantId`, `expiresAt` (8 hours), `ipAddress`, `userAgent`.
- Middleware `requireEnterpriseAccess` already reads from DB — verify it handles expired sessions (delete + 401).

**2C.2 — Secure cookie configuration**
- `HttpOnly: true`, `Secure: true` (production), `SameSite: 'lax'`.
- Cookie name: `ia_session`.
- Set on all auth success redirects.
- Clear on logout: `POST /api/auth/logout` deletes DB session + clears cookie.

### 2D — RBAC Enforcement Audit

**2D.1 — Audit every API route**
File: `server/index.ts`, `server/routes/`, `server/enterprise.ts`

Every route that returns or mutates tenant data must:
1. Call `requireEnterpriseAccess(permission?)` middleware.
2. Scope all DB queries with `where: { tenantId: session.tenantId }`.
3. Return 403 (not 404) on permission failure so the client can show the right error.

Create a checklist of all routes and their required permissions:

| Route | Method | Required Permission |
|---|---|---|
| `/api/dashboard/metrics` | GET | `dashboard:view` |
| `/api/invoices` | GET | `invoice:view` |
| `/api/invoices/:id` | GET | `invoice:view` |
| `/api/invoices/:id/actions` | POST | varies by action |
| `/api/invoices/:id/approve` | POST | `invoice:approve` |
| `/api/invoices/:id/escalate` | POST | `invoice:escalate` |
| `/api/invoices/:id/assign` | POST | `invoice:assign` |
| `/api/invoices/:id/request-evidence` | POST | `invoice:request-evidence` |
| `/api/invoices/upload` | POST | `invoice:upload` (new) |
| `/api/reports/*` | GET | `reports:view` |
| `/api/settings/*` | GET/POST | `settings:view` / `settings:manage` |
| `/api/users` | GET/POST/DELETE | `identity:manage` |
| `/api/audit` | GET | `audit:view` |
| `/api/reconciliation/*` | GET/POST | `reconciliation:view` (new) |
| `/api/billing/*` | GET/POST | `billing:manage` (new) |

**2D.2 — Add missing permissions to role definitions**
File: `server/auth.ts` or a new `server/rbac.ts`
Add `invoice:upload`, `reconciliation:view`, `billing:manage` to the roles that should have them.

---

## Phase 3 — Tenant Onboarding & Signup Flow
**Goal:** Any company can sign up, create a workspace, and start a trial — without manual seeding.

### Steps

**3.1 — Signup page: `src/pages/Signup.tsx`**
Route: `/signup`
Fields:
- Work email address.
- Company name.
- How many invoices per month (dropdown: <50, 50-500, 500+).
- Name.
Submit creates a new Tenant + User + WorkspaceMembership (role: Admin) in DB.
Auto-generates `tenantSlug` from company name (slugify, ensure unique).
Starts Stripe Free trial (see Phase 5).
Sends welcome email via Resend.
Redirects to `/app/:tenantSlug/dashboard`.

**3.2 — Organization discovery improvement**
File: `server/auth.ts` — `POST /api/auth/discover`
Current: looks up tenant by exact email domain.
Improvement:
- Handle subdomains (strip leading `mail.`, `corp.`, etc.).
- If no org found: return `{ found: false }` with a CTA link to `/signup`.
- If org found but user has no WorkspaceMembership: return `{ found: true, requiresInvite: true }` — user must be invited by an admin.

**3.3 — Invite system**
New route: `POST /api/invites` (requires `identity:manage`)
- Creates `InviteToken` record with email, role, tenantId, 72-hour expiry, secure random token.
- Sends invite email via Resend: "You've been invited to join [Org] on InvoiceAudit Pro."
- Link: `${APP_URL}/invite/:token`

New route: `GET /api/invites/:token/accept`
- Validates token not expired.
- If user already exists (by email): creates WorkspaceMembership and deletes token.
- If new user: creates User + WorkspaceMembership, deletes token.
- Redirects to auth flow.

New page: `src/pages/InviteAccept.tsx` (route: `/invite/:token`)
- Shows org name and inviting user's name.
- "Accept & Sign In" → triggers Google OAuth or OTP for the invited email.

**3.4 — Workspace settings page (real)**
Route: `/app/:tenantSlug/settings/workspace`
Persist to DB (Tenant table):
- Organization name, logo URL (uploaded to Supabase Storage).
- Fiscal year start month.
- Default currency.
- Invoice approval threshold amounts per role.
- Allowed email domains (for auto-join vs invite-only).

---

## Phase 4 — File Storage Migration (Local → Supabase Storage)
**Goal:** All uploaded invoice files (PDF, PNG, JPEG) stored in Supabase Storage with per-tenant isolation and signed access URLs.

### Steps

**4.1 — Install Supabase client**
```bash
npm install @supabase/supabase-js
```

**4.2 — Create `server/storage.ts`**
```typescript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```
Expose functions:
- `uploadInvoiceFile(tenantId, fileBuffer, mimeType, originalName)` → returns `storagePath`.
- `getSignedUrl(storagePath, expiresInSeconds)` → returns temporary download URL.
- `deleteFile(storagePath)` → for GDPR deletion.

**4.3 — Supabase Storage bucket setup**
- Create one bucket: `invoices` with private access (no public URLs).
- File path pattern: `{tenantId}/{year}/{month}/{sha256hash}.{ext}`.
- RLS policy: service role key bypasses RLS (server-side only — never expose service key to client).

**4.4 — Update invoice upload route**
File: `server/routes/ingestion.ts` — `POST /api/invoices/upload`
Current: saves to local `storage/` directory.
Change:
1. Receive file via Multer (keep in memory, not disk: `storage: multer.memoryStorage()`).
2. Compute SHA-256 of buffer.
3. Check for duplicate in DB (`where: { tenantId, sha256Hash }`).
4. If duplicate: return 409 with existing invoice ID.
5. Upload buffer to Supabase Storage via `uploadInvoiceFile()`.
6. Store `storagePath` in Invoice record (not a local file path).
7. Pass buffer to GPT-4o extraction (unchanged).

**4.5 — Update file download/preview**
Any route that serves invoice file content must:
- Call `getSignedUrl(invoice.storagePath, 3600)` to generate a 1-hour signed URL.
- Return the signed URL to the client; client fetches directly from Supabase CDN.
- Never proxy the file content through the Express server.

**4.6 — Migrate existing local files (if any)**
Write a one-time script `scripts/migrate-files-to-supabase.ts` that:
- Reads all Invoice records with local `storagePath` values.
- Uploads each file to Supabase Storage.
- Updates the DB record with the new Supabase path.
- Marks migrated files for deletion.

---

## Phase 5 — Stripe Billing & Subscription Management
**Goal:** Full subscription lifecycle — free trial, paid plans, seat limits, usage enforcement, customer portal.

### Steps

**5.1 — Install Stripe SDK**
```bash
npm install stripe
npm install -D @types/stripe
```

**5.2 — Create Stripe products and prices**
In Stripe Dashboard (or via API), create:
- **Free plan**: $0/month, 50 invoices/month, 3 seats.
- **Pro plan**: $99/month, 500 invoices/month, 10 seats. Annual option: $990/year.
- **Enterprise plan**: custom pricing, contact sales.
- Enable metered billing add-on for invoices over plan limit.

Save the Stripe Price IDs to environment variables:
```
STRIPE_PRICE_FREE=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx
```

**5.3 — Create `server/billing.ts`**
Functions:
- `createStripeCustomer(tenant)` → creates Stripe customer, saves to `StripeCustomer` table.
- `startFreeTrial(tenantId)` → creates Stripe subscription on Free plan with 14-day trial.
- `createCheckoutSession(tenantId, priceId, successUrl, cancelUrl)` → Stripe Checkout for upgrades.
- `createPortalSession(tenantId, returnUrl)` → Stripe Customer Portal for self-service.
- `cancelSubscription(tenantId)` → cancels at period end.
- `getCurrentPlan(tenantId)` → reads from `StripeCustomer` table.

**5.4 — Stripe webhook handler**
Route: `POST /api/billing/webhook` (no auth middleware — uses Stripe signature verification)
Handle events:
- `checkout.session.completed` → activate subscription, update `StripeCustomer.status`.
- `customer.subscription.updated` → update plan, seat limit, feature flags.
- `customer.subscription.deleted` → downgrade to Free or lock account.
- `invoice.payment_failed` → send payment failure email, set grace period (7 days).
- `invoice.payment_succeeded` → reset monthly usage counter.

**5.5 — Plan enforcement middleware**
Create `server/middleware/planEnforcement.ts`:
- `checkInvoiceLimit(tenantId)` — before upload: count invoices this calendar month from `UsageEvent` table. If at plan limit, return 402 with upgrade prompt.
- `checkSeatLimit(tenantId)` — before invite: count active WorkspaceMembership rows. If at plan limit, return 402.
- `checkFeatureAccess(tenantId, feature)` — before SSO setup, GST reconciliation, etc. If plan doesn't include feature, return 402.

**5.6 — Billing pages**

`src/pages/app/Billing.tsx` (route: `/app/:tenantSlug/settings/billing`):
- Current plan, usage this month (invoices processed / limit).
- Seat usage (active members / limit).
- "Upgrade" button → calls `createCheckoutSession`, redirects to Stripe Checkout.
- "Manage subscription" → calls `createPortalSession`, redirects to Stripe Portal.
- Payment history (Stripe invoices list via API).

`src/pages/Pricing.tsx` (route: `/pricing`):
- Public pricing page showing Free/Pro/Enterprise plans.
- "Start Free Trial" on Pro → if logged in, direct to Checkout; if not, go to Signup.

**5.7 — Trial expiry handling**
- When trial ends and no payment: Stripe fires `customer.subscription.updated` with `status: 'past_due'` or `'canceled'`.
- Backend sets tenant to locked state. All enterprise API routes return 402 for locked tenants.
- Frontend detects 402 and shows "Your trial has ended — upgrade to continue" banner.

---

## Phase 6 — Dashboard (Remove All Mock Data)
**Goal:** Every number on the dashboard is computed from the Tenant's real Invoice data.

### Steps

**6.1 — Replace baseline metric padding**
File: `server/enterprise.ts` — `GET /api/dashboard/metrics`
Remove all references to `baselineMetricValues`. Replace with real aggregations:

```sql
-- Total invoices this month
SELECT COUNT(*) FROM "Invoice" WHERE "tenantId" = $1 AND "createdAt" >= start_of_month

-- By status
SELECT "status", COUNT(*) FROM "Invoice" WHERE "tenantId" = $1 GROUP BY "status"

-- Total amount pending approval
SELECT SUM("amount") FROM "Invoice" WHERE "tenantId" = $1 AND "status" = 'pending-review'

-- Average processing time (upload → first action)
SELECT AVG(EXTRACT(EPOCH FROM (first_action_at - "createdAt"))/3600) 
FROM "Invoice" WHERE "tenantId" = $1

-- Risk score distribution
SELECT 
  COUNT(*) FILTER (WHERE "riskScore" >= 70) as high_risk,
  COUNT(*) FILTER (WHERE "riskScore" >= 40 AND "riskScore" < 70) as medium_risk,
  COUNT(*) FILTER (WHERE "riskScore" < 40) as low_risk
FROM "Invoice" WHERE "tenantId" = $1
```

**6.2 — Real trend data**
- Create `AuditSnapshot` records via a nightly cron job (or on first request of each day).
- `POST /api/internal/snapshot` — protected by internal API key, called by Railway cron.
- Snapshot stores: date, tenantId, totalInvoices, pendingCount, autoApprovedCount, blockedCount, totalAmount, avgRiskScore.
- Dashboard trend charts query `AuditSnapshot` instead of mock platformData arrays.

**6.3 — Workflow lanes (real)**
File: current `workflowLanes` mock → replace with real query:
```
Ingested → count of invoices with status 'processing'
In Validation → count with status 'validating'
Pending Review → count with status 'pending-review'
Approved → count with status 'approved' this month
```

**6.4 — Real-time updates**
- Use Supabase Realtime: subscribe to changes on `Invoice` table filtered by `tenantId`.
- On any `INSERT` or `UPDATE`: refetch dashboard metrics.
- Frontend: `useEffect` subscribes via Supabase JS client.
- Fallback: React Query `refetchInterval: 30000` for environments without websocket.

---

## Phase 7 — Invoice Ingestion Pipeline (Complete Real Flow)
**Goal:** Upload → OCR → Validation → Queue — fully automated with real status tracking.

### Steps

**7.1 — Processing status machine**
Add `processingStep` column to `Invoice` table (migration):
Values: `queued | ocr_processing | ocr_complete | validating | validation_complete | complete | failed`

**7.2 — Async processing queue**
- After upload: invoice saved with status `queued`, return 202 to client immediately.
- Use `setImmediate` or a simple in-process queue for now (upgrade to BullMQ + Redis in Phase 19 for scale).
- Queue worker: OCR extract → save StructuredField/LineItem rows → run validation → save ValidationCheck rows → set final status.

**7.3 — Real-time upload progress**
- `GET /api/invoices/:id/status` — server-sent events (SSE) or polling endpoint.
- Returns `{ step, progress, message }` for the frontend progress bar.
- File: `src/pages/app/Processing.tsx` — replace mock `processingStages` with real SSE/polling.

**7.4 — Batch upload**
- Allow multiple files in one `POST /api/invoices/upload` request.
- Process each file sequentially in the queue.
- Return array of `{ filename, invoiceId, status }`.

**7.5 — Ingestion channel stubs → real**
The UI shows SFTP, AP Inbox, API Intake as future channels. Implement API Intake now:
- `POST /api/ingestion/api-intake` — accepts JSON invoice payload (vendorName, amount, date, lineItems, reference).
- Authenticated via tenant API key (`TenantApiKey` table — new table needed).
- Creates Invoice record directly from structured data (skips OCR).
- Returns invoice ID + status.
SFTP and AP Inbox remain UI-only stubs for now.

---

## Phase 8 — Validation Engine (Complete Real Data)
**Goal:** All 6 validation checks use real tenant data, not hardcoded patterns.

### Steps

**8.1 — Vendor Master (real)**
New table `VendorMaster`: tenantId, vendorName, gstin, panNumber, bankAccount, ifscCode, isApproved, addedBy, addedAt.

- `GET /api/vendors` — list all vendors for tenant.
- `POST /api/vendors` — add vendor (requires `settings:manage`).
- `PUT /api/vendors/:id` — update vendor details.
- `DELETE /api/vendors/:id` — soft delete (mark inactive).

Validation check "Vendor Registered": look up `VendorMaster` by vendorName (fuzzy match using `ILIKE '%name%'`). Fail if not found.

**8.2 — PO/GRN matching (real)**
New tables `PurchaseOrder` and `GoodsReceipt`:
- PO: tenantId, poNumber, vendorId, totalAmount, currency, issuedAt, status.
- GRN: tenantId, grnNumber, poId, receivedAt, receivedAmount.

- `POST /api/purchase-orders` — import PO (manual entry or CSV import).
- `POST /api/goods-receipts` — import GRN.
- CSV import endpoint: `POST /api/purchase-orders/import` — accepts Excel/CSV file, parses, bulk inserts.

Validation check "PO Match": look up PO by `poNumber` extracted from invoice. Compare amounts within 5% tolerance. Fail if no matching PO.

**8.3 — Approval policy (from RuleSetting)**
Replace hardcoded threshold values with `RuleSetting` records per tenant.
`GET /api/settings/rules` already reads RuleSetting. Ensure validation engine calls this at validation time (not on server start).

**8.4 — Duplicate detection improvement**
Current: exact match on invoiceNumber + vendorName.
Add fuzzy duplicate: Levenshtein distance on (vendorName + normalizedAmount + invoiceDate within 3 days). Flag as "possible duplicate" at risk score 40+ rather than hard block.

---

## Phase 9 — Exceptions Queue (Complete)
**Goal:** Full workflow management — assign, SLA tracking, bulk actions, filters.

### Steps

**9.1 — SLA rules (from settings)**
New `RuleSetting` type: `sla_hours_by_risk`. Default: High risk = 4h, Medium = 24h, Low = 72h.
`GET /api/exceptions` returns each invoice with:
- `slaDeadline` = createdAt + slaHours.
- `slaBreached` = slaDeadline < now.
- `slaHoursRemaining` = max(0, (slaDeadline - now) / 3600).

**9.2 — Assignment workflow**
- `POST /api/invoices/:id/assign` already exists. Add:
  - Auto-assignment rules in RuleSetting (e.g., "Invoices > $10,000 auto-assign to Controller").
  - `GET /api/users?role=finance_manager` — list assignable users for dropdown.
  - Assigned user gets notification (see Phase 12).

**9.3 — Bulk actions**
- `POST /api/exceptions/bulk` — accepts `{ invoiceIds: string[], action: 'approve'|'escalate'|'assign', payload?: any }`.
- Runs permission check once, then applies action to all invoices in a transaction.
- Returns `{ succeeded: number, failed: { id, reason }[] }`.

**9.4 — Advanced filters**
`GET /api/exceptions?status=&assignedTo=&vendorId=&dateFrom=&dateTo=&riskMin=&riskMax=&slaBreached=`
All filter params scoped to tenantId. Prisma `where` clause built dynamically.

---

## Phase 10 — Invoice Detail & Corrections (Complete Real Flow)
**Goal:** Field comparison suggestions come from GPT-4o extraction, not platformData templates. Corrections save to DB and trigger re-validation.

### Steps

**10.1 — Field comparison from real extraction**
File: `server/routes/ingestion.ts` — after GPT-4o returns extracted fields, save each field as `FieldComparison` record:
- `fieldName`: e.g., `invoiceNumber`, `vendorName`, `amount`, `taxAmount`, `dueDate`.
- `extractedValue`: GPT-4o output.
- `systemValue`: value from vendor master or PO (if available, else null).
- `confidence`: GPT-4o confidence score (0-1).
- `status`: `pending` | `accepted` | `rejected`.

**10.2 — Correction apply endpoint (real)**
`POST /api/invoices/:id/corrections` — accepts `{ fieldName, correctedValue, reason }`:
1. Update `FieldComparison.status = 'accepted'`, `correctedValue = correctedValue`.
2. Update corresponding field on `Invoice` record.
3. Re-run validation on the updated invoice (call validation service).
4. Capture `AuditEvent` with actor, old value, new value, reason.
5. Return updated invoice with new validation results.

**10.3 — Evidence attachment (real)**
- `POST /api/invoices/:id/evidence` — upload supporting document (max 10MB, PDF/PNG).
- Upload to Supabase Storage at path `{tenantId}/evidence/{invoiceId}/{filename}`.
- Create `EvidenceAttachment` record (new table: invoiceId, fileName, storagePath, uploadedBy, uploadedAt).
- Return signed URL for preview.

**10.4 — Evidence request email (real)**
`POST /api/invoices/:id/request-evidence` — currently mocked. Real flow:
1. Look up vendor email from `VendorMaster` or invoice's extracted `vendorEmail`.
2. Send real Resend email with: invoice number, list of required documents, upload link.
3. Upload link = `${APP_URL}/vendor-portal/:token` (new public route — see Phase 15).
4. Capture AuditEvent.

---

## Phase 11 — Reports (Remove All Mock Data)
**Goal:** Every chart and table in the Reports section uses real tenant data.

### Steps

**11.1 — Vendor risk leaderboard (real)**
Current: reads `vendorRiskLeaderboard` mock array.
Replace with DB query:
```sql
SELECT v."vendorName", 
  COUNT(i.id) as invoice_count,
  AVG(i."riskScore") as avg_risk,
  COUNT(i.id) FILTER (WHERE i.status = 'blocked') as blocked_count,
  SUM(i.amount) as total_amount
FROM "Invoice" i
JOIN "VendorMaster" v ON v."vendorName" ILIKE i."vendorName"
WHERE i."tenantId" = $1
GROUP BY v."vendorName"
ORDER BY avg_risk DESC
LIMIT 20
```

**11.2 — Compliance summary (real)**
Real computation from ValidationCheck table:
- Pass rate = checks passed / total checks.
- Top failure reasons = GROUP BY check type WHERE status = 'failed'.
- Trend: use AuditSnapshot data.

**11.3 — GST summary (real)**
- Store GST reconciliation results in new `GstReconciliationRun` table.
- Fields: tenantId, period, totalInward, totalOutward, cgst, sgst, igst, mismatches, runAt, runBy.
- Reports page reads from this table instead of re-running extraction.

**11.4 — Excel export (real)**
File: `server/routes/` — export endpoint.
Currently exports with padded fields. Replace:
- Query real invoices with all fields.
- Build Excel with ExcelJS using real data.
- Include: invoice number, vendor, amount, tax breakdown, status, risk score, assigned to, approved by, approved at.
- Stream response: `res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx')`.

**11.5 — Audit snapshot cron**
- Schedule: daily at midnight (Railway cron syntax: `0 0 * * *`).
- New endpoint: `POST /api/internal/snapshot` (protected by `X-Internal-Key` header).
- Reads current state per tenant, writes AuditSnapshot row.
- Dashboard trend charts query last 30 AuditSnapshot rows.

---

## Phase 12 — Notification System (Real)
**Goal:** Users get real email + in-app notifications for invoice actions, SLA breaches, assignment.

### Steps

**12.1 — Notification event table**
Already have `NotificationSetting` (config). Add `NotificationEvent`:
- userId, tenantId, type, title, body, invoiceId (nullable), readAt (nullable), createdAt.

**12.2 — Notification triggers**
Create `server/services/notifications.ts`:
- `notifyAssigned(invoiceId, assignedUserId)` — "Invoice #X assigned to you".
- `notifySlaBreached(invoiceId, assignedUserId)` — "Invoice #X SLA breached".
- `notifyEscalated(invoiceId, escalatedTo)` — "Invoice #X escalated to your queue".
- `notifyApproved(invoiceId, uploadedBy)` — "Your invoice #X was approved".
- `notifyRejected(invoiceId, uploadedBy)` — "Your invoice #X was rejected".

Each function:
1. Inserts `NotificationEvent` row.
2. If user's `NotificationSetting.emailEnabled = true` → send Resend email.
3. If user's `NotificationSetting.slackWebhookUrl` set → POST to Slack webhook.

**12.3 — SLA breach scanner**
- Cron job: every 15 minutes.
- `POST /api/internal/check-slas` (internal endpoint).
- Finds invoices where `slaDeadline < now AND status = 'pending-review' AND slaNotifiedAt IS NULL`.
- Sends notifications, sets `slaNotifiedAt`.

**12.4 — In-app notification bell**
- `GET /api/notifications` — returns unread notifications for current user.
- `POST /api/notifications/:id/read` — marks as read.
- Frontend: notification bell icon in nav with unread count badge.
- Poll every 60 seconds or use Supabase Realtime subscription.

**12.5 — Slack integration (per workspace)**
- In Settings → Notifications: enter Slack webhook URL.
- "Test connection" button → sends test message.
- Save to `NotificationSetting.slackWebhookUrl`.

---

## Phase 13 — GST Reconciliation (Harden)
**Goal:** Multi-period GST reconciliation with GSTIN validation, mismatch reporting, and persistence.

### Steps

**13.1 — GSTIN validation**
- Implement real GSTIN format validation (15-char pattern: `\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}`).
- Validate each extracted GSTIN before saving.
- Flag invoices with invalid or missing GSTIN as a validation failure.

**13.2 — Return period selection**
- UI: date range picker for reconciliation period (from/to month).
- `POST /api/reconciliation/run` — accepts `{ period: { from, to }, fileIds?: string[] }`.
- Filters invoices by `invoiceDate` in period.
- Runs GPT-4o classification on invoices without existing GST data.

**13.3 — Mismatch report**
Compare:
- GSTR-2A inward supplies (import from Excel upload).
- Vendor-submitted invoices in system.
- Highlight: invoices in system but not in GSTR-2A, vice versa, amount mismatches.

**13.4 — Persist reconciliation runs**
- Create `GstReconciliationRun` record with all results.
- `GET /api/reconciliation/history` — list past runs.
- `GET /api/reconciliation/:runId` — get full results of a specific run.

**13.5 — Enhanced Excel export**
- Separate sheets: CGST Summary, SGST Summary, IGST Summary, Mismatches, Full Detail.
- Add pivot tables via ExcelJS.
- Include GSTIN column, return period, matched/unmatched flag.

---

## Phase 14 — Audit Trail (Complete)
**Goal:** Full immutable audit trail with viewer, export, and tamper verification.

### Steps

**14.1 — Capture all missing events**
Current: captures login, invoice actions. Add:
- Tenant settings changes (which field, old value, new value).
- User invite sent, accepted, rejected.
- Role changes.
- Rule setting changes.
- Billing plan changes.
- Evidence uploads.
- File deletions.
- GST reconciliation runs.

**14.2 — Audit trail viewer**
Route: `/app/:tenantSlug/audit`
- Timeline view: sorted by createdAt DESC.
- Filters: actor, event type, date range, invoice ID.
- Each entry shows: timestamp, actor, event type, description, invoiceId (if applicable), IP address.
- Click entry → expand to show full JSON payload.

**14.3 — Tamper detection UI**
- "Verify integrity" button runs the hash-chain verification.
- Shows: "✓ All N events verified. No tampering detected." or highlights the first broken link.

**14.4 — Audit export**
- `GET /api/audit/export?from=&to=` — streams NDJSON or CSV.
- Protected by `audit:view` permission.
- Exports include signature for each event.

---

## Phase 15 — Vendor Portal (New Feature)
**Goal:** Vendors can upload documents directly via a secure, tokenized link — no account needed.

### Steps

**15.1 — New public route**
Route: `/vendor-portal/:token` (no auth required — token is the credential)

`GET /api/vendor-portal/:token/info` — returns:
- Invoice number, amount, what documents are requested.
- Token expiry (72 hours from request).
- Returns 404 if expired.

`POST /api/vendor-portal/:token/upload` — vendor uploads files:
- Rate limited: 10 uploads per token.
- Files go to Supabase Storage: `{tenantId}/vendor-uploads/{invoiceId}/{filename}`.
- Creates EvidenceAttachment record.
- Notifies assigned reviewer via notification system.
- Marks invoice as "evidence received".

**15.2 — Vendor portal page**
`src/pages/VendorPortal.tsx`:
- Shows invoice details (read-only, no sensitive tenant data exposed).
- Upload dropzone for required documents.
- Confirmation screen after upload.
- No InvoiceAudit Pro branding leaked — white-label with tenant logo.

---

## Phase 16 — Evidence Package Export (Complete)
**Goal:** Generate tamper-evident PDF evidence packages for auditors.

### Steps

**16.1 — Install PDF generation**
```bash
npm install puppeteer-core @sparticuz/chromium
```
(Use `@sparticuz/chromium` for Railway/serverless compatibility instead of full Puppeteer.)

**16.2 — Complete `server/services/evidence.ts`**
`generateEvidencePackage(invoiceId, tenantId)`:
1. Fetch invoice + all related records (ValidationChecks, AuditEvents, FieldComparisons, EvidenceAttachments).
2. Download all attached files from Supabase Storage.
3. Render HTML evidence report with: invoice summary, validation results, audit trail, correction log.
4. Print HTML to PDF via Puppeteer.
5. Combine PDF + attachments into a ZIP archive (`archiver` library).
6. Compute SHA-256 of the ZIP.
7. Upload ZIP to Supabase Storage at `{tenantId}/evidence-packages/{invoiceId}-{timestamp}.zip`.
8. Create `EvidencePackage` record (new table: invoiceId, storagePath, sha256, generatedBy, generatedAt).
9. Return signed download URL.

**16.3 — Evidence package endpoint**
`POST /api/invoices/:id/evidence-package`:
- Requires `audit:view` permission.
- Triggers async generation.
- Returns `{ packageId, status: 'generating' }`.

`GET /api/invoices/:id/evidence-package/:packageId`:
- Returns status and download URL when ready.

---

## Phase 17 — User Management Admin Panel
**Goal:** Admins can manage team members, roles, and SSO settings within their tenant.

### Steps

**17.1 — Team management page**
Route: `/app/:tenantSlug/settings/team`
Requires: `identity:manage`

Features:
- List all WorkspaceMembership rows with user details.
- Change role dropdown (AP Reviewer / Finance Manager / Controller / Auditor / Admin).
- Remove member (soft delete WorkspaceMembership, send notification).
- Pending invites list with resend/revoke options.
- "Invite member" form → calls `POST /api/invites`.

**17.2 — Role change audit**
Every role change captured as AuditEvent with old_role, new_role, changed_by.

**17.3 — SSO domain management**
Route: `/app/:tenantSlug/settings/sso`
- List allowed email domains for auto-join.
- Add/remove domains.
- Toggle between "auto-join" and "invite-only" per domain.
- For Google OAuth tenants: show callback URL for their records.

**17.4 — API keys management**
Route: `/app/:tenantSlug/settings/api`
- List `TenantApiKey` records (masked, only last 4 chars visible).
- Generate new key → shown once, stored as bcrypt hash.
- Revoke key.
- Each key has a label and optional expiry.

---

## Phase 18 — Super-Admin Console
**Goal:** Platform-level admin panel for managing all tenants (you, as the operator).

### Steps

**18.1 — Super-admin role**
- Add `isSuperAdmin: Boolean` to `User` table.
- Set via direct DB update for the operator's account.
- All super-admin routes gated behind `requireSuperAdmin` middleware.

**18.2 — Super-admin routes**
```
GET  /api/admin/tenants          — list all tenants with plan, usage, status
GET  /api/admin/tenants/:id      — tenant detail
POST /api/admin/tenants/:id/lock — lock tenant (e.g. payment failure, fraud)
POST /api/admin/tenants/:id/unlock
GET  /api/admin/users            — search all users by email
POST /api/admin/impersonate/:userId — create impersonation session (logs to audit trail)
GET  /api/admin/metrics          — platform-wide metrics (total tenants, invoices, revenue)
```

**18.3 — Super-admin UI**
Route: `/admin` (separate from `/app/:tenantSlug/`)
Pages:
- Tenant list with search, plan filter, status filter.
- Tenant detail: usage stats, billing status, team members.
- User search.
- Platform metrics dashboard.

**18.4 — Impersonation**
- Super-admin can impersonate any tenant user.
- Creates a special session flagged as `isImpersonation: true`.
- Visible banner in UI: "You are viewing as [user@tenant.com]. [Exit impersonation]".
- All actions during impersonation are captured in AuditEvent with `impersonatedBy: superAdminId`.

---

## Phase 19 — Deployment on Railway
**Goal:** Both frontend and backend running in production on Railway with environment variables, custom domains, and health checks.

### Steps

**19.1 — Repository structure for Railway**
Railway can deploy from a monorepo. Create two Railway services from the same repo:
- **Backend service**: root directory `invoice-auditor-pro`, start command `npm run start:server`, build command `npm run build:server`.
- **Frontend service**: root directory `invoice-auditor-pro`, build command `npm run build`, start command `npx serve dist -l $PORT`.

**19.2 — Add build scripts to `package.json`**
```json
"build:server": "tsc -p tsconfig.server.json",
"start:server": "node dist/server/index.js",
"build": "vite build",
"db:migrate": "prisma migrate deploy"
```

**19.3 — Railway environment variables**
Set all variables from the credentials table at the top of this document in Railway service environment settings. Never commit these.

**19.4 — Database migration on deploy**
Add a Railway deploy command or start script that runs `prisma migrate deploy` before starting the server. This ensures schema is always up-to-date on deploy.

**19.5 — Health check endpoint**
`GET /api/health`:
```json
{ "status": "ok", "db": "connected", "version": "1.0.0", "timestamp": "..." }
```
Railway will ping this to determine service health.

**19.6 — Static file serving**
- Backend serves Vite build from `dist/` directory: `app.use(express.static('dist'))`.
- Catch-all route: `app.get('*', (req, res) => res.sendFile('dist/index.html'))`.
- This means one Railway service can serve both frontend and API — or split into two for scaling.

**19.7 — Custom domain**
- In Railway: Settings → Custom Domain → add your domain.
- Update `APP_URL` env var to your custom domain.
- Update Google OAuth redirect URIs in Google Cloud Console to use the custom domain.

**19.8 — Supabase IP allow-listing**
- Railway services have static outbound IPs (available in Railway settings).
- Add these to Supabase's IP allow-list for database connections.

---

## Phase 20 — Production Hardening
**Goal:** The system is secure, monitored, and resilient before real users onboard.

### Steps

**20.1 — Error monitoring**
```bash
npm install @sentry/node @sentry/react
```
- Initialize Sentry in `server/index.ts` and `src/main.tsx`.
- Set `SENTRY_DSN` env var.
- Capture all unhandled exceptions and rejected promises.
- Source maps uploaded to Sentry during build.

**20.2 — Rate limiting audit**
Current rate limits: auth (5/min), uploads (30/min). Add:
- Global API limit: 300 requests/min per IP.
- Per-tenant limit: 1000 requests/min per tenantId.
- Billing endpoints: 10/min.
- Use `express-rate-limit` with in-memory store (upgrade to Redis for multi-instance).

**20.3 — Security headers audit**
Already using Helmet. Verify:
- Content-Security-Policy set correctly for Supabase Storage domains.
- HSTS enabled.
- X-Frame-Options: DENY.
- Referrer-Policy: strict-origin-when-cross-origin.

**20.4 — GDPR compliance**
`DELETE /api/account` — tenant admin can delete their account:
1. Delete all Invoice files from Supabase Storage.
2. Delete all DB records for the tenant (cascade delete via Prisma).
3. Cancel Stripe subscription.
4. Send confirmation email.
5. This cannot be undone — require password confirmation + typed confirmation string.

`GET /api/account/export` — export all tenant data as JSON (GDPR "right to portability").

**20.5 — Backup strategy**
- Supabase: enable Point-in-Time Recovery (PITR) in project settings.
- Supabase Storage: enable versioning on the `invoices` bucket.
- Run a weekly DB export script to a separate storage location.

**20.6 — Logging**
- Winston already configured. Add:
  - Structured JSON logs in production.
  - Log rotation via Railway's built-in log retention.
  - Add `requestId` to all log entries (UUID generated per request in middleware).

**20.7 — Performance**
- Add Prisma query logging in development, disable in production.
- Add indexes for common query patterns:
  - `Invoice(tenantId, status, createdAt)` — exceptions queue.
  - `Invoice(tenantId, vendorName)` — vendor grouping.
  - `AuditEvent(tenantId, createdAt)` — audit log.
  - `Session(token, expiresAt)` — auth.
- Add to `prisma/schema.prisma` as `@@index` annotations.

---

## Phase 21 — ERP Integration Connectors
**Goal:** Real data ingestion from SAP, NetSuite, and generic CSV/API sources.

### Steps

**21.1 — Generic CSV/Excel import**
Route: `POST /api/ingestion/csv`
- Accept CSV or XLSX file.
- Column mapping UI: user maps their columns to InvoiceAudit fields.
- Save mapping as `ImportMapping` record (reusable).
- Process each row → create Invoice records.

**21.2 — Webhook receiver (API Intake)**
Route: `POST /api/ingestion/webhook/:apiKeySlug`
- Authenticated by TenantApiKey.
- Accepts JSON payload matching documented schema.
- Creates Invoice directly from structured data.
- Useful for connecting any system that can send webhooks.

**21.3 — SAP connector (basic)**
- SAP Business One has a Service Layer REST API.
- Create `server/connectors/sap.ts` with:
  - OAuth2 authentication to SAP Service Layer.
  - Fetch AP invoices: `GET /b1s/v1/PurchaseInvoices`.
  - Map SAP fields to InvoiceAudit schema.
  - Delta sync: track `lastSyncAt` per tenant, fetch only new/modified invoices.
- UI: Settings → Integrations → SAP → enter Service Layer URL + credentials.

**21.4 — NetSuite connector (basic)**
- NetSuite TBA (Token-Based Authentication) OAuth 1.0a.
- Create `server/connectors/netsuite.ts`:
  - Authenticate with TBA tokens.
  - Fetch vendor bills via SuiteQL: `SELECT * FROM transaction WHERE type = 'VendBill'`.
  - Map fields to InvoiceAudit schema.
  - Delta sync same as SAP.

**21.5 — Sync scheduler**
- `POST /api/integrations/:connectorId/sync` — trigger manual sync.
- Background sync: configurable cron per connector (e.g., every 6 hours).
- Sync status stored in `IntegrationSync` table (new): connectorId, tenantId, startedAt, completedAt, invoicesImported, errors.

---

## Implementation Order & Dependencies

```
Phase 0 (Security)  ← Start here immediately. Blocks everything.
    ↓
Phase 1 (Database)  ← Required before any real data can be stored.
    ↓
Phase 2 (Auth)      ← Required before any user can log in for real.
    ↓
Phase 3 (Onboarding)    Phase 4 (Storage)    Phase 5 (Billing)
    ↓                        ↓                    ↓
Phase 6 (Dashboard) ← Depends on Phase 1, 2, 3 complete.
    ↓
Phase 7 (Ingestion) ← Depends on Phase 4 (storage).
    ↓
Phase 8 (Validation) ← Depends on Phase 7 (ingestion gives us real invoices).
    ↓
Phase 9 (Exceptions)     Phase 10 (Corrections)    Phase 11 (Reports)
    ↓                           ↓                        ↓
Phase 12 (Notifications) ← Depends on Phases 9, 10.
    ↓
Phase 13 (GST)      Phase 14 (Audit Trail)    Phase 15 (Vendor Portal)
    ↓
Phase 16 (Evidence)     Phase 17 (User Mgmt)    Phase 18 (Super Admin)
    ↓
Phase 19 (Deployment) ← Can be set up in parallel from Phase 1 onward.
    ↓
Phase 20 (Hardening)
    ↓
Phase 21 (ERP Connectors)
```

---

## Files Never to Touch (Demo Workspace)

These files and routes must remain untouched throughout all phases:

**Routes (frontend):**
- `/demo/*` — all demo routes in `src/App.tsx`

**Pages:**
- `src/pages/demo/` — all demo page components (Dashboard, Upload, Processing, Exceptions, InvoiceDetail, Comparison, Reports, Settings)

**Data:**
- `src/data/platformData.ts` — all mock invoice and platform data
- `src/data/mockInvoices.ts` — mock invoice records

**Backend:**
- `server/store.ts` — demo data arrays (only add a guard flag around mock org seeding, never delete demo data)

**Rationale:** The demo workspace is the product's public showcase and sales tool. It must always be functional and independent of the enterprise backend state.

---

## Key API Calls to Make Before Starting

1. **Supabase**: Create a new project at supabase.com. Once created, go to Settings → Database to get the `DATABASE_URL` (use Transaction mode, port 6543). Get `SUPABASE_URL` and both keys from Settings → API.

2. **Google Cloud Console**: Create an OAuth 2.0 Client ID at console.cloud.google.com. Application type: Web application. Add authorized redirect URI: `https://yourdomain.com/api/auth/google/callback`. You'll get `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

3. **Stripe**: Create a free account at stripe.com. Get Secret and Publishable keys from Developers → API Keys. Create the three products (Free, Pro, Enterprise) in Products. Set up a webhook endpoint pointing to `https://yourdomain.com/api/billing/webhook` listening for the events listed in Phase 5.4.

4. **Railway**: Create an account at railway.app. Install Railway CLI: `npm install -g @railway/cli`. Login: `railway login`. Create a new project: `railway init`.

5. **Resend**: Already have an API key — just ensure it's rotated (since it was exposed in the old `.env`).
