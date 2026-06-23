# Invoice.Audit Enterprise Product Roadmap

## Purpose

This document defines how Invoice.Audit should be developed from the current working prototype into an enterprise-ready B2B SaaS product without breaking the existing workflow or design language.

The current frontend and prototype backend are a strong starting point. They already communicate the right product story and should be preserved as the guided demo experience. The next layer is not a redesign. It is an enterprise architecture expansion:

- keep demo mode
- add real workspace entry
- introduce enterprise auth
- add tenant isolation
- enforce RBAC
- persist data in a database
- prepare the platform for secure production usage

This roadmap is intentionally ordered from login and entry experience through the rest of the product pages, so we build the product in the same order users will experience it.

---

## Strategic Product Positioning

### Category framing

Invoice.Audit should not be positioned as generic invoice OCR or standard AP automation.

The correct category framing is:

**Intelligent Pre-Payment Invoice Assurance Platform**

### Why this matters

This product is differentiated because it is not just about processing invoices. It is about controlling payment risk before release.

### Differentiation pillars

- Pre-payment assurance layer
- Control-first architecture
- Explainable risk scoring
- Tamper-evident audit evidence
- Fraud and anomaly detection before payment release
- Continuous control and audit intelligence

### Product moat to build toward

- Control Graph Engine
- Explainable Decisioning
- Immutable Audit Evidence
- Fraud and risk detection before payment release

### Practical implication for development

Every backend and UX decision should reinforce this positioning:

- validation before approval
- visible control reasoning
- auditable decision paths
- enterprise trust
- tenant-safe operations

---

## Non-Negotiable Product Principles

1. Demo mode must remain available.
2. Demo data must stay fully separate from real customer data.
3. Signed-in users must only access their own tenant workspace.
4. Authentication must be enterprise-ready from the architecture level.
5. MFA should be enforced by the identity provider where possible.
6. Authorization must be role-based and tenant-scoped.
7. Audit evidence must be treated as a first-class product capability.
8. Current frontend workflow and visual direction should be preserved and extended, not discarded.

---

## Product Modes

Invoice.Audit will operate in two clearly separated modes.

### 1. Demo Mode

Purpose:

- sales showcase
- onboarding preview
- product discovery
- low-friction exploration

Behavior:

- uses seeded enterprise sample data
- does not require real customer credentials
- remains shared and non-persistent
- allows walkthrough of dashboard, exceptions, invoice review, reports, settings, and processing flow

### 2. Enterprise Workspace Mode

Purpose:

- real customer usage
- tenant-isolated workspaces
- production workflows
- authenticated and authorized access

Behavior:

- requires enterprise sign-in
- tenant-specific data only
- role-aware actions and permissions
- persistent records, audit logs, and workspace-scoped settings

---

## High-Level User Journey

The intended product journey is:

1. User lands on the entry page.
2. User sees two clear paths:
   - Explore Demo
   - Enter Your Workspace
3. If the user chooses demo, they enter the seeded sample environment.
4. If the user chooses workspace, they start enterprise sign-in.
5. Identity is validated by enterprise auth.
6. Backend maps the user to tenant, workspace, and role.
7. User is routed into their own workspace.
8. All data access after login is tenant-scoped and permission-checked.

---

## End-to-End Page Development Order

This section defines the recommended product build order, starting from the login page and moving through the rest of the experience.

## 1. Entry / Landing Page

### Current state

Current route:

- `/`

The page already has the right tone and trust posture. It introduces the platform well and already hints at secure workspace access.

### Required future behavior

This page should become the dual-entry gateway to the whole product.

Primary actions:

- **Explore Demo**
- **Enter Your Workspace**

Recommended UX behavior:

- keep the current product showcase and trust messaging
- keep the workspace preview panel
- make demo and enterprise entry equally clear
- visually separate demo exploration from authenticated workspace access

### Entry page functional design

#### Explore Demo

- routes to the demo workspace
- can continue using current demo routes initially
- should clearly label the environment as demo

#### Enter Your Workspace

- starts enterprise login
- may begin with work email entry for organization discovery
- then routes to SSO or enterprise authentication

### Suggested route strategy

Keep the current root route:

- `/`

Add clear destination paths:

- `/demo/dashboard`
- `/auth/start`
- `/auth/callback`
- `/app/:tenantSlug/dashboard`

### Transitional implementation note

To avoid breaking the current flow, the first implementation can keep existing demo screens on current routes while also introducing the future route structure. Then we progressively migrate demo paths to `/demo/*` and enterprise paths to `/app/:tenantSlug/*`.

---

## 2. Authentication Start and Organization Discovery

This is the first new enterprise layer after the entry page.

### Goal

Determine how the user should authenticate based on their organization.

### Desired behavior

User clicks **Enter Your Workspace** and sees one of these paths:

- enter work email
- backend identifies organization domain
- route user to the correct identity provider

Examples:

- `@acme.com` -> Microsoft Entra ID
- `@northwind.com` -> Okta
- `@globex.com` -> Google Workspace

### Required auth capabilities

- SSO
- OIDC
- SAML compatibility
- MFA handled by IdP when available
- tenant discovery
- session creation

### Recommended architecture

Do not hardcode auth logic into page components.

Create an auth abstraction layer with:

- auth controller
- identity provider mapping
- session service
- user provisioning logic

### First implementation recommendation

Start with a simplified enterprise-ready model:

- one mock enterprise sign-in path
- tenant lookup by email domain
- mock callback that provisions workspace session

Then evolve to real provider integrations.

---

## 3. Auth Callback and Session Establishment

### Purpose

Handle the provider response and establish a secure application session.

### Responsibilities

- validate identity token or assertion
- map user to organization
- map user to workspace
- map user to role
- create secure session
- redirect to tenant route

### Required backend outputs

- `userId`
- `organizationId`
- `workspaceId`
- `tenantSlug`
- `role`
- `permissions`
- session token or secure cookie

### Post-login route target

Examples:

- `/app/acme/dashboard`
- `/app/northwind/dashboard`

### Security rules

- no direct tenant selection from the client without backend verification
- no trusting frontend-only role checks
- all session resolution must occur server-side

---

## 4. Workspace Shell and Tenant Routing

This becomes the foundation for all enterprise pages.

### Goal

Preserve the current page designs while introducing tenant-aware routing and authorization.

### Route structure

Demo:

- `/demo/dashboard`
- `/demo/upload`
- `/demo/processing`
- `/demo/exceptions`
- `/demo/invoice/:id`
- `/demo/comparison/:id`
- `/demo/reports`
- `/demo/settings`

Enterprise:

- `/app/:tenantSlug/dashboard`
- `/app/:tenantSlug/upload`
- `/app/:tenantSlug/processing`
- `/app/:tenantSlug/exceptions`
- `/app/:tenantSlug/invoice/:id`
- `/app/:tenantSlug/comparison/:id`
- `/app/:tenantSlug/reports`
- `/app/:tenantSlug/settings`

### Important rule

The same visual components can be reused, but their data context must be different:

- demo pages read demo data
- enterprise pages read tenant-scoped data only

### Required shared infrastructure

- app context for current mode: demo or tenant
- tenant-aware query keys
- route guards
- session guard
- permission guard

---

## 5. Dashboard

### Current role in the product

The dashboard is already the operations command center.

### Enterprise extension

In enterprise mode, the dashboard becomes tenant-specific.

### What must change in the backend

- all metrics must be computed for one tenant only
- reviewer queue must be filtered by tenant and permissions
- control insights must use tenant-scoped invoice population
- widgets must respect user role

### Role behavior examples

- AP Reviewer sees assigned work and review backlog
- Finance Manager sees team workload and approvals
- Controller sees escalations and high-risk cases
- Auditor sees read-only visibility and evidence trends
- Admin sees workspace-wide activity and control posture

### Backend requirements

- tenant filter on all dashboard queries
- role-aware widget visibility
- secure aggregation queries

---

## 6. Upload / Ingestion

### Current role in the product

The upload page represents intake channels and document onboarding.

### Enterprise extension

In enterprise mode this becomes tenant-controlled invoice intake.

### Required capabilities

- workspace-specific ingestion settings
- uploader attribution
- storage isolation
- file and metadata linkage to tenant
- future integration configuration per tenant

### Backend requirements

- object storage strategy
- upload session records
- source channel registry per tenant
- document metadata persistence
- virus / type / integrity checks

### Security notes

- uploaded documents must never land in shared demo storage
- document access must always validate tenant and permission

---

## 7. Processing Pipeline

### Current role in the product

The current page explains the multi-stage flow.

### Enterprise extension

In enterprise mode it should reflect real tenant processing jobs.

### Backend responsibilities

- create processing jobs
- track job state
- link jobs to uploaded documents
- emit stage transitions
- record processing audit events

### Long-term direction

Later this page can show:

- extraction status
- validation runs
- risk scoring completion
- evidence collection status
- integration pushback to ERP

For now, the architecture only needs to be ready for this.

---

## 8. Exceptions Queue

### Current role in the product

The exceptions page is already the main triage workspace for flagged invoices.

### Enterprise extension

This becomes one of the most important tenant-scoped operational pages.

### Backend requirements

- tenant-scoped exception listing
- role-based visibility
- filter and search support
- paging and sorting
- SLA and ownership tracking

### Role behavior

- reviewers see assigned or team-visible exception work
- managers see queue health and routing
- controllers see escalations and blocked invoices
- auditors see read-only evidence and history

### Additional future enhancements

- saved views per role
- ownership reassignment
- approval delegation
- queue policies by business unit

---

## 9. Invoice Review Workspace

### Current role in the product

This is the heart of the product.

### Enterprise extension

This page becomes the primary control decisioning workspace inside a tenant.

### Backend requirements

- secure invoice retrieval by tenant and permission
- session-aware action enforcement
- reviewer attribution on every action
- approval policy checks before mutations
- evidence access control
- full audit event creation

### Critical enterprise behaviors

- only authorized roles can approve, escalate, or request evidence
- every action must capture actor, timestamp, tenant, invoice, and reason
- reviewers must never cross tenant boundaries

### Future differentiators to strengthen here

- explainable decisioning
- policy trace for every control result
- graph-based vendor and fraud relationships
- immutable audit evidence package generation

---

## 10. Correction Workbench

### Current role in the product

The comparison page handles field-level correction and explanation.

### Enterprise extension

This becomes a controlled human-in-the-loop review tool.

### Backend requirements

- store correction proposals
- store accepted corrections
- attribute actor and reason
- persist version history
- link correction events into invoice audit trail

### Important design principle

Correction must never feel like silent data editing.

Every change should answer:

- what changed
- who changed it
- why it changed
- what the original value was

---

## 11. Reports

### Current role in the product

Reports already present operational and compliance insight.

### Enterprise extension

Reports become tenant-level intelligence and audit reporting.

### Backend requirements

- tenant-safe aggregation queries
- export authorization
- role-based report access
- historical trend persistence
- audit event summaries

### Future reporting extensions

- approval turnaround by business unit
- repeat anomaly clusters
- vendor risk heatmaps
- controller override trends
- audit evidence export packs

---

## 12. Settings

### Current role in the product

Settings already shows rule and governance concepts.

### Enterprise extension

This becomes the control governance area for each tenant.

### Backend requirements

- tenant-scoped rules
- notification configuration
- approval matrix persistence
- integrations per tenant
- role and permission policy display

### Access rules

- Admin can manage workspace configuration
- Finance Manager can view or manage approval policies depending on tenant policy
- Controller may manage escalation rules
- Auditor typically gets read-only visibility

### Important future split

Eventually separate this into:

- Workspace Settings
- Controls Administration
- Identity and Access
- Integrations

That split can happen later without changing the design direction today.

---

## 13. Future Admin and Identity Pages

These do not need to ship immediately, but the architecture should expect them.

Recommended future pages:

- `/app/:tenantSlug/admin/users`
- `/app/:tenantSlug/admin/roles`
- `/app/:tenantSlug/admin/identity`
- `/app/:tenantSlug/admin/audit`

Purpose:

- manage tenant users
- map roles
- configure SSO metadata
- inspect access events
- review audit evidence and security logs

---

## Backend Architecture Direction

The current backend should now evolve into a layered enterprise backend.

## Core layers

### 1. Auth and Session Layer

Responsibilities:

- initiate login
- handle IdP callback
- create sessions
- resolve current user
- support logout and session expiry

### 2. Tenant and Workspace Layer

Responsibilities:

- map user to organization
- map organization to workspace
- isolate tenant data
- support future multi-workspace organizations

### 3. RBAC and Authorization Layer

Responsibilities:

- map roles to permissions
- enforce API-level authorization
- scope permissions per tenant
- support future custom role policies

### 4. Workflow Domain Layer

Responsibilities:

- invoices
- exceptions
- approvals
- corrections
- reports
- rules

### 5. Audit and Evidence Layer

Responsibilities:

- capture user and system events
- preserve approval reasoning
- support tamper-evident evidence strategy
- support exportable audit packages

### 6. Persistence Layer

Responsibilities:

- database access
- tenancy-aware queries
- transaction boundaries
- soft deletion where appropriate

### 7. Integration Layer

Responsibilities:

- ERP connectors
- inbox ingestion
- SFTP
- vendor portal
- future document intelligence services

---

## Recommended Backend Data Model

The exact schema can evolve, but the product should be designed around these entities.

### Identity and tenancy entities

- `organizations`
- `workspaces`
- `users`
- `user_identities`
- `memberships`
- `roles`
- `permissions`
- `role_permissions`
- `sessions`
- `identity_providers`

### Workflow entities

- `invoices`
- `invoice_documents`
- `invoice_line_items`
- `invoice_validation_checks`
- `invoice_flags`
- `invoice_field_comparisons`
- `invoice_actions`
- `invoice_assignments`
- `processing_jobs`
- `evidence_requests`

### Governance and reporting entities

- `rulesets`
- `rule_versions`
- `notification_settings`
- `approval_policies`
- `audit_events`
- `audit_evidence_packages`
- `report_snapshots`

### Multi-tenant rule

Every business entity that belongs to customer data should be tenant- or workspace-scoped.

---

## RBAC Model

Initial enterprise roles:

- AP Reviewer
- Finance Manager
- Controller
- Auditor
- Admin

### Example permission direction

#### AP Reviewer

- view assigned invoices
- request evidence
- apply corrections
- cannot manage identity or tenant settings

#### Finance Manager

- approve eligible invoices
- reassign review work
- view dashboard and reports
- manage some workflow controls

#### Controller

- handle escalations
- approve high-risk cases
- override policy where permitted

#### Auditor

- read-only access to invoice evidence, audit events, and reports
- no workflow mutation permissions

#### Admin

- manage workspace configuration
- manage users and access
- manage identity integrations
- manage controls and settings

### Enforcement rule

Permissions must be enforced in the backend API, not only in the frontend.

---

## Enterprise Authentication Design

### Target identity compatibility

- Microsoft Entra ID
- Okta
- Google Workspace
- generic SAML
- generic OIDC

### Design recommendation

Build the application around an auth provider abstraction rather than binding the product deeply to one sign-in vendor.

That abstraction should support:

- tenant discovery
- provider metadata lookup
- login initiation
- callback handling
- user provisioning
- session establishment

### MFA stance

Preferred enterprise model:

- MFA enforced by the identity provider
- application respects provider claims
- application logs session and assurance context

### First implementation expectation

Simplified but forward-compatible:

- mock or single-provider sign-in first
- tenant-aware session model from day one
- role mapping from backend

---

## Persistence Strategy

The current in-memory backend is useful for demoing flow, but enterprise mode requires persistence.

### Recommended next persistence layer

Use a relational database with strong tenancy support.

Recommended direction:

- PostgreSQL

Reasons:

- strong relational model
- safe transactions
- good fit for audit data
- suitable for tenant-scoped business workflows
- works well with TypeScript backends and ORM/query layers

### Important rule

Demo data and production tenant data should not use the same persistence path.

Recommended split:

- demo data stays seeded and controlled
- enterprise data uses database-backed repositories

---

## Audit and Evidence Direction

Audit is not a side feature for this product. It is part of the product core.

### Minimum enterprise audit requirements

- login event logging
- session event logging
- invoice action logging
- rule publication logging
- correction logging
- assignment logging
- export logging

### Long-term evidence direction

Build toward tamper-evident evidence packages containing:

- invoice metadata
- control outcomes
- reviewer actions
- timestamps
- attached evidence
- decision rationale

---

## Demo Preservation Strategy

This is critical.

We must not replace the demo flow just because enterprise auth is added.

### Correct pattern

- demo remains public or low-friction
- enterprise workspace requires sign-in
- demo pages and tenant pages can reuse the same UI layer
- data providers differ by mode

### Implementation recommendation

Introduce a top-level app mode concept:

- `demo`
- `workspace`

The UI shell stays visually consistent. The backend source and route namespace change by mode.

---

## Suggested Development Phases

## Phase 1. Preserve and formalize demo mode

Deliverables:

- keep current demo entry on `/`
- formally label demo mode
- add dedicated demo route namespace
- make demo data provider explicit

## Phase 2. Add enterprise entry path

Deliverables:

- add **Enter Your Workspace**
- add organization discovery
- add auth start and auth callback routes
- create session model

## Phase 3. Introduce tenant-aware routing

Deliverables:

- `/app/:tenantSlug/*` route shell
- route guards
- session guards
- unauthorized and expired-session handling

## Phase 4. Add persistence and tenant data model

Deliverables:

- database schema
- repositories
- tenant-scoped invoice storage
- tenant-scoped settings and audit events

## Phase 5. Add RBAC enforcement

Deliverables:

- roles and permissions tables
- API authorization middleware
- role-aware UI states

## Phase 6. Upgrade each workspace page to tenant-backed mode

Page order:

1. dashboard
2. exceptions
3. invoice review
4. correction workbench
5. upload
6. processing
7. reports
8. settings

## Phase 7. Add enterprise admin controls

Deliverables:

- user management
- role assignment
- identity provider settings
- audit access page

## Phase 8. Add advanced control differentiation

Deliverables:

- explainable decisioning improvements
- control graph engine foundations
- immutable evidence strategy
- fraud relationship analysis

---

## Environment Variable Strategy

Any provider credentials, secrets, or integration keys must be stored in environment variables and never hardcoded in the client.

### Planned `.env` categories

#### App and session

- `APP_URL`
- `API_URL`
- `SESSION_SECRET`
- `COOKIE_DOMAIN`

#### Database

- `DATABASE_URL`

#### Auth providers

- `AUTH_PROVIDER_MODE`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_ISSUER_URL`
- `SAML_ENTRY_POINT`
- `SAML_CERT`

#### Enterprise provider mappings

- `ENTRA_TENANT_ID`
- `OKTA_DOMAIN`
- `GOOGLE_WORKSPACE_CLIENT_ID`

#### Future intelligence providers

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

These can remain unset until those integrations are actually implemented.

---

## What We Are Not Doing Yet

To stay focused, the next implementation should not prioritize:

- full document intelligence pipeline
- advanced OCR improvements
- graph analytics implementation
- vendor fraud network engine
- production-grade ERP connectors

Those are future differentiators, but the next product layer is:

**enterprise auth + session + tenant routing + RBAC + persistence foundation**

---

## Success Criteria For The Next Real Build Stage

We should consider the next stage successful when:

1. Users can still explore the product in demo mode.
2. Users can also choose a real workspace entry path.
3. Signed-in users are mapped to their own tenant workspace.
4. Tenant routes are isolated from demo routes.
5. Backend authorization enforces role and tenant scope.
6. Workspace data is persistent.
7. Audit events are recorded for user actions.
8. The current frontend design and workflow remain recognizable and intact.

---

## Final Direction

The correct product pattern for Invoice.Audit is:

- a polished guided demo for discovery
- a secure enterprise sign-in path for real usage
- isolated tenant workspaces
- role-based operations
- control-first workflow execution
- auditable, explainable decisioning

The current product should therefore evolve in layers, not be rebuilt from scratch.

We preserve what already works:

- the demo story
- the page structure
- the workflow experience
- the product narrative

And we add what enterprise customers require:

- SSO
- MFA-ready auth
- multi-tenant architecture
- RBAC
- persistence
- secure workspace routing
- audit-grade backend foundations

This is the development path that best supports both product clarity and enterprise readiness.
