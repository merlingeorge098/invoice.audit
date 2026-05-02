# Invoice.Audit

Invoice.Audit is a control-first invoice assurance platform for finance teams. It helps ingest invoices, extract key data, validate finance controls, detect fraud and anomaly signals, route approval work, and preserve an audit-ready decision trail before payment release.

## Features

- Multi-source invoice intake for uploads, email, ERP sync, API, portal, and SFTP-style workflows
- Invoice field extraction with confidence indicators
- Validation against vendor, PO, GRN, tax, duplicate, evidence, and approval-policy controls
- Risk scoring with explainable invoice flags
- Exception queues for reviewer action
- Invoice detail and comparison workspaces
- Audit trail visibility for system and user decisions
- Dashboards, reports, settings, and workflow-control views

## Tech Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui and Radix UI
- React Router
- TanStack React Query
- Express
- Vitest
- Playwright

## Getting Started

Install dependencies:

```bash
npm install
```

Run the frontend and local API server together:

```bash
npm run dev
```

Run only the frontend:

```bash
npm run dev:client
```

Run only the API server:

```bash
npm run dev:server
```

## Available Scripts

```bash
npm run dev          # Start client and server together
npm run dev:client   # Start the Vite frontend
npm run dev:server   # Start the local API server
npm run server       # Run the API server
npm run build        # Build the production frontend
npm run build:dev    # Build in development mode
npm run preview      # Preview the production build
npm run lint         # Run ESLint
npm run test         # Run Vitest tests
npm run test:watch   # Run Vitest in watch mode
```

## Project Structure

```text
src/
  components/     Reusable UI and layout components
  pages/          Application routes and page-level screens
  data/           Mock invoice and platform data
  hooks/          API and UI hooks
  lib/            Auth, API, workspace, and utility helpers

server/
  index.ts        Local API server
  store.ts        Server-side data store

public/           Static assets
PRODUCT_GUIDE.md  Product and feature documentation
```

## Main Routes

- `/` - Login and product entry page
- `/demo/dashboard` - Operations dashboard
- `/demo/upload` - Invoice ingestion
- `/demo/processing` - Processing pipeline
- `/demo/exceptions` - Exception queue
- `/demo/invoice/:id` - Invoice detail review
- `/demo/comparison/:id` - Invoice comparison
- `/demo/reports` - Reports and analytics
- `/demo/settings` - Platform settings

Legacy routes such as `/dashboard`, `/upload`, `/processing`, `/reports`, and `/settings` redirect to the demo workspace.

## Product Workflow

1. An invoice enters through upload, email, ERP sync, API, portal, or SFTP.
2. The system validates the file and prepares it for processing.
3. Extraction reads fields such as vendor, amount, dates, taxes, PO number, and line items.
4. Validation checks the invoice against configured finance controls.
5. The risk engine scores the invoice and explains suspicious or blocked conditions.
6. Workflow rules route the invoice for auto-approval, review, escalation, evidence request, or block.
7. Reviewers inspect the invoice and take action.
8. Every system and user action is recorded in the audit trail.
9. Dashboards and reports update with operational and compliance insights.

## Testing

Run the test suite:

```bash
npm run test
```

## Documentation

For more product detail, see:

- `PRODUCT_GUIDE.md`
- `ENTERPRISE_PRODUCT_ROADMAP.md`

## License

Private project.
