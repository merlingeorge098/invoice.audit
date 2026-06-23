# Invoice.Audit Master Production Implementation Plan (`final_steps.md`)

This document details the exact technical phases, database schemas, API contracts, and implementation steps required to transform the current Invoice.Audit prototype into a production-grade, multi-tenant B2B SaaS application. 

> [!IMPORTANT]
> **Core Architectural Rule:** The existing guided demo workspace (`/demo/*`) and its mock API handlers must remain untouched. They serve as a sales/onboarding experience. The steps below apply exclusively to building the secure, persistent enterprise system located at `/app/:tenantSlug/*` and its corresponding `/api/*` backend routes.

---

## Technical Stack Architecture

* **Frontend:** React 18, TypeScript, Vite, React Router v6, Tailwind CSS, TanStack React Query v5.
* **Backend:** Node.js Express API server (packaged with `tsx`).
* **Database & ORM:** PostgreSQL database with Prisma ORM.
* **Storage:** S3-compatible Object Storage (AWS S3, MinIO, or Cloudflare R2) for secure invoice documents.
* **Queue / Job Processing:** BullMQ (powered by Redis) or a database-backed transaction-safe job worker for extraction and validation pipelines.

---

# Phase 1: Enterprise Identity, SSO, and RBAC (Foundation)

Before building features, the platform must have a secure, multi-tenant security envelope.

## 1.1 Multi-Tenant Database Schema (Identity & Auth)
Add these models to your Prisma schema in `prisma/schema.prisma`:

```prisma
model Organization {
  id         String      @id @default(uuid())
  name       String
  domain     String      @unique // e.g. "acme.com" for organization discovery
  tenantSlug String      @unique // e.g. "acme" for routing
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt
  workspaces Workspace[]
  users      User[]
}

model Workspace {
  id             String       @id @default(uuid())
  name           String       @default("Default Workspace")
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  invoices       Invoice[]
  rulesets       Ruleset[]
}

model User {
  id             String       @id @default(uuid())
  email          String       @unique
  name           String?
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  role           SystemRole   @default(AP_REVIEWER)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  sessions       Session[]
  assignments    Invoice[]    @relation("ReviewerAssignments")
  actions        AuditLog[]
}

enum SystemRole {
  AP_REVIEWER
  FINANCE_MANAGER
  CONTROLLER
  AUDITOR
  ADMIN
}

model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt    DateTime
  createdAt    DateTime @default(now())
}
```

## 1.2 Enterprise SSO Integration (OIDC/SAML)
1. **SSO Discovery Endpoint (`POST /api/auth/discover`):**
   * Accept an email address.
   * Search `Organization` by the email domain.
   * Return the mapped Identity Provider (IdP) URL or config.
2. **Auth Start (`POST /api/auth/start`):**
   * Redirect user to Okta, Microsoft Entra ID (Azure AD), or Google Workspace SSO endpoint using passport-saml or openid-client.
3. **SSO Callback Handler (`POST /api/auth/callback`):**
   * Receive identity token/assertion from the IdP.
   * Verify cryptographic signature of the token.
   * Extract user email, name, and groups.
   * JIT (Just-in-Time) Provisioning: If user doesn't exist, create the `User` and map them to the corresponding `Organization` based on domain.
   * Generate a secure, high-entropy `sessionToken`.
   * Write session to the database with a 24-hour expiration.
   * **Security Rule:** Return the token in a secure, `HttpOnly`, `SameSite=Strict`, `Secure` cookie named `__Host-InvoiceAudit-Session`.

## 1.3 Tenant Routing & Frontend Guards
1. **Tenant Validation Guard (`RequireTenantAccess.tsx`):**
   * Intercept all routes matching `/app/:tenantSlug/*`.
   * Fetch the current session details from the backend.
   * Check if the authenticated user's organization `tenantSlug` matches the route `:tenantSlug`.
   * If mismatched, immediately redirect the user to `/app/unauthorized` or their correct workspace.
2. **SSO Session Lifecycles:**
   * Implement token refresh flows and inactivity timeouts. If expired, redirect to `/` with a query parameter showing session expiry.

## 1.4 API-Level RBAC Enforcement Middleware
Implement authorization decorators or middleware on Express route definitions:

```typescript
// server/auth/middleware.ts
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sessionToken = req.cookies['__Host-InvoiceAudit-Session'];
    if (!sessionToken) return res.status(401).json({ error: "Session missing" });

    const session = await db.session.findUnique({
      where: { sessionToken },
      include: { user: { include: { organization: true } } }
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }

    const tenantSlug = req.params.tenantSlug;
    if (session.user.organization.tenantSlug !== tenantSlug) {
      return res.status(403).json({ error: "Access denied to tenant" });
    }

    // Map Roles to Permission Matrix
    const userRole = session.user.role;
    const permissions = ROLE_PERMISSIONS[userRole] || [];
    if (!permissions.includes(permission)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    req.user = session.user; // Attach resolved user context
    next();
  };
}

const ROLE_PERMISSIONS = {
  AP_REVIEWER: ["invoice:read", "invoice:request-evidence", "invoice:apply-correction"],
  FINANCE_MANAGER: ["invoice:read", "invoice:request-evidence", "invoice:apply-correction", "invoice:approve", "invoice:assign"],
  CONTROLLER: ["invoice:read", "invoice:request-evidence", "invoice:apply-correction", "invoice:approve", "invoice:escalate", "invoice:assign", "settings:manage"],
  AUDITOR: ["invoice:read", "reports:export"],
  ADMIN: ["invoice:read", "settings:manage", "users:manage"]
};
```

---

# Phase 2: Core Database Modeling & Multi-Tenant Scoping

Ensure all operational data has database persistence linked strictly to a Workspace/Tenant.

## 2.1 Complete Core Database Schema
Add these models to your Prisma schema:

```prisma
model Invoice {
  id               String            @id @default(uuid())
  workspaceId      String
  workspace        Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  invoiceNumber    String
  vendorName       String
  amount           Decimal           @db.Decimal(12, 2)
  taxAmount        Decimal           @db.Decimal(12, 2)
  invoiceDate      DateTime
  dueDate          DateTime
  poNumber         String?
  grnNumber        String?
  status           InvoiceStatus     @default(PROCESSING)
  riskScore        Int               @default(0)
  riskLevel        RiskLevel         @default(LOW)
  confidenceScore  Int               @default(100)
  documentUrl      String // Secure storage link
  assignedToId     String?
  assignedTo       User?             @relation("ReviewerAssignments", fields: [assignedToId], references: [id])
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  lineItems        LineItem[]
  checks           ValidationCheck[]
  flags            InvoiceFlag[]
  comparisons      FieldComparison[]
  auditLogs        AuditLog[]

  @@unique([workspaceId, invoiceNumber, vendorName])
}

enum InvoiceStatus {
  PROCESSING
  AUTO_APPROVED
  PENDING_REVIEW
  NEEDS_EVIDENCE
  ESCALATED
  APPROVED
  BLOCKED
}

enum RiskLevel {
  LOW
  MEDIUM
  HIGH
}

model LineItem {
  id          String   @id @default(uuid())
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  description String
  quantity    Decimal  @db.Decimal(10, 2)
  unitPrice   Decimal  @db.Decimal(12, 2)
  totalPrice  Decimal  @db.Decimal(12, 2)
}

model ValidationCheck {
  id          String   @id @default(uuid())
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  name        String // e.g. "VENDOR_VALIDATION", "DUPLICATE_CHECK"
  status      CheckStatus
  message     String
}

enum CheckStatus {
  PASSED
  FAILED
  WARNING
}

model InvoiceFlag {
  id          String   @id @default(uuid())
  invoiceId   String
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  code        String // e.g., "BANK_DETAILS_MODIFIED"
  severity    String // "CRITICAL", "WARNING"
  message     String
}

model FieldComparison {
  id             String  @id @default(uuid())
  invoiceId      String
  invoice        Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  fieldName      String // e.g. "invoiceNumber", "amount"
  submittedValue String
  extractedValue String
  suggestedValue String
  reason         String?
  isApplied      Boolean @default(false)
}

model AuditLog {
  id         String   @id @default(uuid())
  invoiceId  String
  invoice    Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String // e.g. "APPROVED", "CORRECTION_APPLIED"
  details    String // JSON metadata (original state, modifications, logic logs)
  ipAddress  String?
  userAgent  String?
  timestamp  DateTime @default(now())
}
```

## 2.2 Strict Tenant Data Scoping Policy
* Every SQL query MUST include `workspaceId` (or `organizationId`) in its `WHERE` clause.
* Never expose raw database keys directly in frontend API paths. Wrap or filter parameters by `workspaceId` resolved server-side from the authenticated session cookie.

---

# Phase 3: Ingestion and Pipeline Execution

This phase builds the secure entry of documents and the automated extraction engine.

## 3.1 Secure Document Upload Queue
* **Endpoint:** `POST /api/:tenantSlug/upload`
  * Authorized roles: `AP_REVIEWER`, `FINANCE_MANAGER`, `CONTROLLER`, `ADMIN`.
  * Multi-part form-data handler using `multer` configured with memory-storage limits (max 15MB/file, strict PDF/PNG MIME filters).
  * Generate a unique SHA-256 hash of the file buffer to prevent double uploads at the file-level.
  * Save the file to Object Storage under path `/{tenantId}/invoices/{uuid}.pdf`.
  * **Critical:** Write placeholder record in `Invoice` table with status `PROCESSING`.
  * Push a new job containing `{ invoiceId, s3Path, tenantId }` onto the background processing queue.

## 3.2 Background Processing and Worker Setup
Set up a robust async task runner to keep processing decoupled from the web server thread:

```typescript
// server/workers/invoice-worker.ts
import { Queue, Worker } from 'bullmq';
import { extractInvoiceData } from '../services/extraction';
import { runControlRules } from '../services/rules-engine';

const invoiceQueue = new Queue('invoice-processing');

const worker = new Worker('invoice-processing', async (job) => {
  const { invoiceId, s3Path, tenantId } = job.data;
  
  try {
    // Stage 1: Extraction
    const extractionResult = await extractInvoiceData(s3Path);
    
    // Stage 2: Save Extracted Fields to db
    await saveExtractedData(invoiceId, extractionResult);

    // Stage 3: Control Rules Validation
    const validationOutcome = await runControlRules(invoiceId, tenantId);

    // Stage 4: Risk scoring, flags attachment, status update
    await finalizeInvoiceStatus(invoiceId, validationOutcome);

    // Stage 5: Write System Audit Event
    await writeSystemAuditLog(invoiceId, "PROCESSING_COMPLETE", "System extracted and validated controls.");
  } catch (error) {
    await updateInvoiceStatus(invoiceId, "FAILED", error.message);
  }
});
```

## 3.3 OCR & AI Extraction Integration
Create a standardized parser interface using enterprise document extractors (Azure AI Document Intelligence, AWS Textract, or OpenAI structured JSON extraction):
* **Parser Outputs Required:**
  * Invoice Number, Dates (Issue, Due).
  * Vendor Bank Details (IBAN, Routing, Account Number).
  * Line items array (description, quantity, unit price, totals).
  * Tax breakdown details.
  * Statistical OCR text line coordinate confidence metrics.

---

# Phase 4: Business Rules and Control Engine

Implement validation rules and risk assessment before human review occurs.

## 4.1 Persisted Settings and Rulesets
Add database models for rule templates:

```prisma
model Ruleset {
  id          String        @id @default(uuid())
  workspaceId String
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  version     Int           @default(1)
  isActive    Boolean       @default(false)
  rules       RuleConfig[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

model RuleConfig {
  id        String   @id @default(uuid())
  rulesetId String
  ruleset   Ruleset  @relation(fields: [rulesetId], references: [id], onDelete: Cascade)
  ruleKey   String // e.g., "DUPLICATE_CHECK"
  isEnabled Boolean  @default(true)
  config    String // JSON block for custom parameters (e.g. threshold amounts)
}
```

## 4.2 Standard Control Operations
1. **Duplicate Check:** Match current invoice SHA-256 hash, or triple match (same vendor + invoice date + amount within range) against previous table entries.
2. **Vendor Validation:** Match extracted vendor tax IDs, names, and bank information against an approved Vendor Master Table.
3. **Three-Way Matching:** Look up corresponding PO/GRN identifiers from ERP tables. If line quantities or total prices deviate beyond configured tolerances, mark check as `FAILED`.
4. **Approval Matrix Check:** Check the total amount. If it exceeds threshold limits configured in ruleset settings, flag for escalation.

## 4.3 Risk & Status Determination Routing
* If a critical validation check fails (e.g., `BANK_DETAILS_MODIFIED`):
  * Set status to `PENDING_REVIEW` or `ESCALATED`.
  * Flag Severity: `CRITICAL`.
  * Set Risk Level: `HIGH` (Risk Score: 80-100).
* If non-critical validations fail (e.g., matching PO line details mismatch below threshold):
  * Set status to `PENDING_REVIEW`.
  * Risk Level: `MEDIUM` (Risk Score: 40-79).
* If all validation checks pass:
  * Set status to `AUTO_APPROVED`.
  * Risk Level: `LOW` (Risk Score: 0-10).

---

# Phase 5: Exception Queues & Reviewer Action Workspace

Establish the core operational workflows where reviewers interact with and approve invoices.

## 5.1 Real Exceptions API (`GET /api/:tenantSlug/exceptions`)
* Query invoices belonging to the workspace with status `PENDING_REVIEW` or `ESCALATED`.
* Implement Server-side pagination, search (by vendor name, invoice number), and filters (by severity, assignee, aging).

## 5.2 Action Mutations (`POST /api/:tenantSlug/invoices/:id/actions`)
Protect all state transitions. The API must enforce that the caller possesses correct roles.

```typescript
// server/routes/invoice-actions.ts
router.post('/api/:tenantSlug/invoices/:id/actions', requirePermission('invoice:approve'), async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body; // e.g., action: "APPROVE", "ESCALATE", "REQUEST_EVIDENCE"
  
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  let targetStatus: InvoiceStatus;
  
  switch(action) {
    case "APPROVE":
      // Verify Manager approval if limit exceeded
      if (invoice.amount.gt(10000) && req.user.role === 'AP_REVIEWER') {
        return res.status(403).json({ error: "Approval limit exceeded. Must escalate instead." });
      }
      targetStatus = "APPROVED";
      break;
    case "ESCALATE":
      targetStatus = "ESCALATED";
      break;
    case "REQUEST_EVIDENCE":
      targetStatus = "NEEDS_EVIDENCE";
      break;
    default:
      return res.status(400).json({ error: "Invalid action" });
  }

  // Transaction block: Update status + write audit event
  const updatedInvoice = await db.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { id },
      data: { status: targetStatus }
    });

    await tx.auditLog.create({
      data: {
        invoiceId: id,
        userId: req.user.id,
        action,
        details: JSON.stringify({ reason, previousStatus: invoice.status, actorRole: req.user.role })
      }
    });

    return inv;
  });

  res.json(updatedInvoice);
});
```

---

# Phase 6: Human-in-the-Loop Corrections

Ensure that adjustments made to OCR data models are logged and attributed.

## 6.1 Persistent Corrections Workbench API
* **Get Comparison Data (`GET /api/:tenantSlug/invoices/:id/comparison`):**
  * Read from the `FieldComparison` table to retrieve submitted, system-extracted, and suggested correction arrays.
* **Apply Suggestion API (`POST /api/:tenantSlug/invoices/:id/comparison/:field/apply`):**
  * Require Permission: `invoice:apply-correction`.
  * Update `FieldComparison` record where `fieldName = :field` to `isApplied = true`.
  * Update the main `Invoice` table record data (e.g. updating `invoiceNumber` with the new value).
  * Write a detailed entry to `AuditLog` preserving the original value, modified value, the editor's userId, and the reason.

---

# Phase 7: Tamper-Evident Audit Evidence

Provide data integrity guarantees for critical financial events.

## 7.1 Append-Only Audit Trail Service
* **Mechanism:** Create a dedicated helper class `AuditTrailService` to write logs.
* **Database Constraint:** Enforce a strict backend application block preventing any SQL updates or deletes on the `AuditLog` table.
* **Cryptographic Signatures:**
  * For critical events (e.g., Invoice Approval, Bank Details Update, Correction Application):
    * Gather session user ID, timestamp, target invoice status, and transaction details.
    * Generate a SHA-256 hash representing this state.
    * Combine it with the hash of the *previous* audit log record (creating a cryptographic hash chain).
    * Store this signature directly in the `AuditLog` row. This validates that historical logs cannot be secretly altered or deleted without breaking the chain.

## 7.2 Evidence Package Compiler
* **Trigger:** When status moves to `APPROVED` or `BLOCKED`.
* **Action:** Generate an exportable PDF/JSON zip file containing:
  * Extracted invoice metadata, lines, and tax records.
  * Validation run results (checks passed and failed).
  * Full, chronologically ordered, signed `AuditLog` timeline.
  * Cryptographic checksum hash of the uploaded invoice source file.
* Store this evidence pack securely in S3 with a read-only policy for future compliance retrieval.

---

# Phase 8: Reports, Analytics, & Governance

Convert tenant metrics into aggregated analytics and management reports.

## 8.1 Real-Time Analytics Queries
Write optimized SQL queries scoped strictly to the workspace:
* **Metric Cards:** Sum processing volumes, calculate processing times, duplicate volume count, SLA breaches.
* **Vendor Anomaly Matrix:** Rank vendor profiles with high risk scores or frequent validation failures.
* **Compliance Distribution:** Track passed-vs-failed control policies over custom date spans.

## 8.2 Exporters
* Build APIs to compile and download Excel/CSV reports for the dashboard and invoice listings. Use a library like `exceljs` to generate formatted workbooks showing all invoice actions and risk scores within a chosen date range.

---

# Phase 9: Settings Configuration Admin

Build governance controls for the workspace.

## 9.1 Ruleset Lifecycle API
* **Drafting:** Let administrators customize rules, toggle checks, and modify approval limits.
* **Publishing:**
  * When a rule configuration is saved, create a new draft of the `Ruleset` in the database.
  * When the administrator clicks "Publish", set the active flag to `false` on the old ruleset and set the new draft ruleset `isActive` to `true`.
  * Enforce that the ruleset publication event creates a signed `AuditLog` entry detailing what settings changed.

## 9.2 Integrations & ERP Credentials Storage
* Support configuring ERP connections, notification channels (Slack, Email), and AP mailboxes.
* **Security Rule:** Any secure API keys or database connection strings for integrations must be encrypted using AES-256-GCM before writing to the database.

---

# Phase 10: Production Hardening, Observability, & CI/CD

Ready the application for secure deployment and continuous integration.

## 10.1 Security Hardening Checklist
* Configure `Helmet` to set secure HTTP headers (including CSP, HSTS, and Frameguard to prevent clickjacking).
* Enforce CORS policies allowing only registered application domain requests.
* Set up a rate limiter middleware on paths like `/api/auth/*` (max 5 attempts per IP per minute) and `/api/:tenantSlug/upload` (max 30 uploads per user per minute).
* Set database connection string environment variables securely in production (never hardcode in code or config files).

## 10.2 Logging & Observability
* Install `winston` or `pino` for structured JSON logging.
* Log incoming request IDs, session context details, and transaction timestamps.
* Set up alert rules for API response codes of `500` or database transaction failures.

## 10.3 CI/CD Verification & Testing
* Ensure automated test suites block merges if:
  * TypeScript typechecks fail.
  * ESLint returns syntax errors.
  * Unit tests (`vitest`) or route access integration tests fail.
  * E2E tests (`playwright`) checking tenant guards or SSO routing fail.
