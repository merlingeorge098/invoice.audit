export type WorkflowStatus =
  | "auto-approved"
  | "pending-review"
  | "needs-evidence"
  | "escalated"
  | "blocked";

export type RiskLevel = "low" | "medium" | "high";
export type CheckStatus = "pass" | "warning" | "fail";
export type Severity = "low" | "medium" | "high";
export type SourceChannel =
  | "Manual Upload"
  | "AP Inbox"
  | "ERP Sync"
  | "Vendor Portal"
  | "SFTP Drop"
  | "API Intake";

export interface ValidationCheck {
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface InvoiceFlag {
  title: string;
  severity: Severity;
  detail: string;
}

export interface StructuredField {
  label: string;
  value: string;
  confidence: number;
  source: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: CheckStatus;
}

export interface FieldComparison {
  field: string;
  submitted: string;
  extracted: string;
  suggestion: string;
  reason: string;
}

export interface AuditEvent {
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  vendorCode: string;
  entity: string;
  amount: number;
  invoiceDate: string;
  dueDate: string;
  poNumber: string;
  grnNumber: string;
  status: WorkflowStatus;
  riskLevel: RiskLevel;
  riskScore: number;
  confidence: number;
  duplicateLikelihood: number;
  sourceChannel: SourceChannel;
  assignedReviewer: string;
  agingHours: number;
  summary: string;
  workflowRecommendation: string;
  anomalyTypes: string[];
  validationChecks: ValidationCheck[];
  flags: InvoiceFlag[];
  structuredFields: StructuredField[];
  lineItems: LineItem[];
  fieldComparisons: FieldComparison[];
  auditTrail: AuditEvent[];
}

export const invoiceRecords: InvoiceRecord[] = [
  {
    id: "INV-90821",
    invoiceNumber: "INV-90821",
    vendorName: "Northwind Industrial Systems",
    vendorCode: "V-1182",
    entity: "India Manufacturing",
    amount: 1284500,
    invoiceDate: "18 Apr 2026",
    dueDate: "30 Apr 2026",
    poNumber: "PO-44018",
    grnNumber: "GRN-88124",
    status: "pending-review",
    riskLevel: "medium",
    riskScore: 61,
    confidence: 93,
    duplicateLikelihood: 18,
    sourceChannel: "ERP Sync",
    assignedReviewer: "Priya Raman",
    agingHours: 6,
    summary:
      "Services invoice matched to a valid PO, but tax classification and approval threshold require reviewer confirmation.",
    workflowRecommendation:
      "Route to finance manager for tax confirmation before release.",
    anomalyTypes: ["Tax mismatch", "Threshold approval"],
    validationChecks: [
      { label: "Vendor master", status: "pass", detail: "Vendor is active and bank details are unchanged." },
      { label: "PO match", status: "pass", detail: "Header amount and line items match PO-44018 within tolerance." },
      { label: "Duplicate detection", status: "pass", detail: "No exact or fuzzy duplicate detected in the last 180 days." },
      { label: "Tax compliance", status: "warning", detail: "GST line extracted as consulting services instead of AMC services." },
      { label: "Approval policy", status: "warning", detail: "Amount breaches manager auto-approval cap by INR 34,500." },
    ],
    flags: [
      {
        title: "Tax code variance",
        severity: "medium",
        detail: "Expected SAC 998719 from contract, extracted SAC 998314 from invoice body.",
      },
      {
        title: "Threshold escalation",
        severity: "medium",
        detail: "Manager review is required for invoices above INR 1.25M.",
      },
    ],
    structuredFields: [
      { label: "Vendor", value: "Northwind Industrial Systems", confidence: 99, source: "Header" },
      { label: "GST/VAT", value: "27AAACN4202R1Z7", confidence: 97, source: "Vendor master" },
      { label: "Invoice date", value: "18 Apr 2026", confidence: 96, source: "Header" },
      { label: "Due date", value: "30 Apr 2026", confidence: 88, source: "Payment terms" },
      { label: "PO number", value: "PO-44018", confidence: 94, source: "PO reference" },
      { label: "Bank account", value: "Axis Bank ending 8841", confidence: 100, source: "Vendor master" },
      { label: "Payment terms", value: "Net 12", confidence: 84, source: "Footer" },
    ],
    lineItems: [
      { description: "Plant AMC - northern line", quantity: 1, unitPrice: 845000, total: 845000, status: "pass" },
      { description: "Emergency support retainer", quantity: 1, unitPrice: 312500, total: 312500, status: "warning" },
      { description: "GST", quantity: 1, unitPrice: 126000, total: 126000, status: "warning" },
    ],
    fieldComparisons: [
      {
        field: "Tax category",
        submitted: "Consulting Services",
        extracted: "Consulting Services",
        suggestion: "Annual Maintenance Services",
        reason: "Contract and historical invoices use AMC classification for this vendor.",
      },
      {
        field: "Approval route",
        submitted: "Manager auto-release",
        extracted: "Manager auto-release",
        suggestion: "Finance manager review",
        reason: "Invoice amount exceeds configured approval limit.",
      },
    ],
    auditTrail: [
      {
        timestamp: "22 Apr 2026, 09:14 IST",
        actor: "ERP Sync",
        action: "Ingested invoice",
        detail: "Invoice imported from SAP integration with PO reference attached.",
      },
      {
        timestamp: "22 Apr 2026, 09:15 IST",
        actor: "Extraction Engine",
        action: "Extracted fields",
        detail: "Confidence 93% across 27 critical fields.",
      },
      {
        timestamp: "22 Apr 2026, 09:16 IST",
        actor: "Validation Engine",
        action: "Raised warnings",
        detail: "Tax code variance and approval threshold escalation generated.",
      },
    ],
  },
  {
    id: "INV-90833",
    invoiceNumber: "INV-90833",
    vendorName: "Bluewave Logistics",
    vendorCode: "V-2018",
    entity: "India Distribution",
    amount: 412300,
    invoiceDate: "17 Apr 2026",
    dueDate: "24 Apr 2026",
    poNumber: "PO-44112",
    grnNumber: "GRN-88167",
    status: "needs-evidence",
    riskLevel: "medium",
    riskScore: 57,
    confidence: 91,
    duplicateLikelihood: 43,
    sourceChannel: "AP Inbox",
    assignedReviewer: "Arjun Menon",
    agingHours: 19,
    summary:
      "Freight invoice is structurally valid, but delivery proof is missing and the approver comment requests POD evidence.",
    workflowRecommendation:
      "Request proof of delivery from vendor before approval.",
    anomalyTypes: ["Missing evidence", "Duplicate watch"],
    validationChecks: [
      { label: "Vendor master", status: "pass", detail: "Vendor mapped successfully to master record V-2018." },
      { label: "Contract rate", status: "pass", detail: "Lane-level freight rate matches approved contract." },
      { label: "Duplicate detection", status: "warning", detail: "One similar invoice exists within 7 days for same amount and route." },
      { label: "Evidence pack", status: "warning", detail: "Proof of delivery attachment not present in inbound email." },
      { label: "Approval policy", status: "pass", detail: "Assigned to operations reviewer based on cost center." },
    ],
    flags: [
      {
        title: "Missing POD",
        severity: "medium",
        detail: "No signed proof-of-delivery image or manifest included in the document bundle.",
      },
      {
        title: "Near-duplicate pattern",
        severity: "low",
        detail: "A similar amount and route combination was submitted on 11 Apr 2026.",
      },
    ],
    structuredFields: [
      { label: "Vendor", value: "Bluewave Logistics", confidence: 98, source: "Header" },
      { label: "Invoice date", value: "17 Apr 2026", confidence: 97, source: "Header" },
      { label: "Route", value: "Bhiwandi to Hosur", confidence: 89, source: "Line item" },
      { label: "Manifest number", value: "MN-188112", confidence: 72, source: "Attachment OCR" },
      { label: "Payment terms", value: "7 days", confidence: 96, source: "Contract" },
      { label: "Supporting docs", value: "Invoice PDF only", confidence: 100, source: "Ingestion bundle" },
    ],
    lineItems: [
      { description: "Primary freight lane", quantity: 1, unitPrice: 338000, total: 338000, status: "pass" },
      { description: "Fuel surcharge", quantity: 1, unitPrice: 41000, total: 41000, status: "pass" },
      { description: "GST", quantity: 1, unitPrice: 33300, total: 33300, status: "pass" },
    ],
    fieldComparisons: [
      {
        field: "Supporting evidence",
        submitted: "Invoice PDF",
        extracted: "Invoice PDF",
        suggestion: "Attach proof of delivery + signed manifest",
        reason: "Freight invoices above INR 250K require POD evidence before release.",
      },
    ],
    auditTrail: [
      {
        timestamp: "22 Apr 2026, 08:46 IST",
        actor: "AP Inbox",
        action: "Captured invoice email",
        detail: "2 attachments received from ar@bluewavelogistics.com.",
      },
      {
        timestamp: "22 Apr 2026, 08:47 IST",
        actor: "Workflow Engine",
        action: "Requested evidence",
        detail: "Invoice routed to Arjun Menon because POD was missing.",
      },
    ],
  },
  {
    id: "INV-90844",
    invoiceNumber: "INV-90844",
    vendorName: "Vertex Components Pvt Ltd",
    vendorCode: "V-3771",
    entity: "India Manufacturing",
    amount: 986000,
    invoiceDate: "16 Apr 2026",
    dueDate: "29 Apr 2026",
    poNumber: "PO-43952",
    grnNumber: "GRN-88002",
    status: "blocked",
    riskLevel: "high",
    riskScore: 89,
    confidence: 87,
    duplicateLikelihood: 91,
    sourceChannel: "Manual Upload",
    assignedReviewer: "Controls Team",
    agingHours: 31,
    summary:
      "Material invoice is blocked because the system detected a probable duplicate combined with a recent vendor bank-account change request.",
    workflowRecommendation:
      "Block payment and escalate to controls lead for duplicate and bank validation.",
    anomalyTypes: ["Duplicate alert", "Bank change", "High-risk vendor"],
    validationChecks: [
      { label: "Vendor master", status: "warning", detail: "Vendor requested bank account update 2 days ago." },
      { label: "PO match", status: "pass", detail: "Quantities and price align with PO-43952." },
      { label: "Duplicate detection", status: "fail", detail: "Exact amount and line similarity score 94% against invoice INV-90791." },
      { label: "Tax compliance", status: "pass", detail: "GST amount and classification validated." },
      { label: "Approval policy", status: "fail", detail: "High-risk invoices cannot proceed without controls approval." },
    ],
    flags: [
      {
        title: "Probable duplicate",
        severity: "high",
        detail: "Line-item pattern, amount, and invoice date closely match another invoice already approved.",
      },
      {
        title: "Recent bank amendment",
        severity: "high",
        detail: "Vendor bank change was submitted within the fraud-monitoring cooling-off window.",
      },
    ],
    structuredFields: [
      { label: "Vendor", value: "Vertex Components Pvt Ltd", confidence: 98, source: "Header" },
      { label: "Invoice number", value: "INV-90844", confidence: 95, source: "Header" },
      { label: "PO number", value: "PO-43952", confidence: 99, source: "PO reference" },
      { label: "Bank account", value: "ICICI ending 1109", confidence: 67, source: "Footer OCR" },
      { label: "Duplicate cluster", value: "Cluster #12", confidence: 100, source: "Risk engine" },
      { label: "Supplier risk tier", value: "Tier 3 watchlist", confidence: 100, source: "Vendor analytics" },
    ],
    lineItems: [
      { description: "Servo motor assembly", quantity: 4, unitPrice: 162500, total: 650000, status: "pass" },
      { description: "Calibration kit", quantity: 2, unitPrice: 93000, total: 186000, status: "pass" },
      { description: "GST", quantity: 1, unitPrice: 150000, total: 150000, status: "pass" },
    ],
    fieldComparisons: [
      {
        field: "Bank account",
        submitted: "ICICI ending 1109",
        extracted: "ICICI ending 1109",
        suggestion: "Continue with approved HDFC ending 4418",
        reason: "New bank details are still inside the cooling-off period.",
      },
      {
        field: "Duplicate status",
        submitted: "New invoice",
        extracted: "New invoice",
        suggestion: "Possible duplicate of INV-90791",
        reason: "Fuzzy match score exceeded 90%.",
      },
    ],
    auditTrail: [
      {
        timestamp: "21 Apr 2026, 17:12 IST",
        actor: "Manual Upload",
        action: "Uploaded invoice package",
        detail: "1 PDF and 1 spreadsheet uploaded by AP operator.",
      },
      {
        timestamp: "21 Apr 2026, 17:14 IST",
        actor: "Risk Engine",
        action: "Blocked invoice",
        detail: "Risk score reached 89 due to duplicate probability and bank change alert.",
      },
      {
        timestamp: "21 Apr 2026, 17:17 IST",
        actor: "Controls Team",
        action: "Assigned reviewer",
        detail: "Ownership moved to Controls Team with priority SLA of 4 hours.",
      },
    ],
  },
  {
    id: "INV-90858",
    invoiceNumber: "INV-90858",
    vendorName: "Helio Office Services",
    vendorCode: "V-5091",
    entity: "Shared Services",
    amount: 182400,
    invoiceDate: "20 Apr 2026",
    dueDate: "05 May 2026",
    poNumber: "PO-44144",
    grnNumber: "GRN-88218",
    status: "auto-approved",
    riskLevel: "low",
    riskScore: 14,
    confidence: 98,
    duplicateLikelihood: 3,
    sourceChannel: "Vendor Portal",
    assignedReviewer: "Auto-routed",
    agingHours: 1,
    summary:
      "Routine office services invoice passed extraction, validation, and policy checks and was auto-approved by workflow automation.",
    workflowRecommendation:
      "Release in next payment batch.",
    anomalyTypes: ["No exception"],
    validationChecks: [
      { label: "Vendor master", status: "pass", detail: "Vendor and tax registration validated." },
      { label: "PO match", status: "pass", detail: "PO and GRN matched to 100% tolerance." },
      { label: "Duplicate detection", status: "pass", detail: "No duplicate patterns detected." },
      { label: "Tax compliance", status: "pass", detail: "Tax components and totals verified." },
      { label: "Approval policy", status: "pass", detail: "Below auto-approval threshold with low-risk profile." },
    ],
    flags: [],
    structuredFields: [
      { label: "Vendor", value: "Helio Office Services", confidence: 99, source: "Header" },
      { label: "Invoice date", value: "20 Apr 2026", confidence: 99, source: "Header" },
      { label: "PO number", value: "PO-44144", confidence: 99, source: "Vendor portal metadata" },
      { label: "Payment terms", value: "Net 15", confidence: 97, source: "Contract" },
      { label: "Bank account", value: "Approved HDFC ending 7712", confidence: 100, source: "Vendor master" },
    ],
    lineItems: [
      { description: "Facility supplies bundle", quantity: 1, unitPrice: 154576, total: 154576, status: "pass" },
      { description: "GST", quantity: 1, unitPrice: 27824, total: 27824, status: "pass" },
    ],
    fieldComparisons: [],
    auditTrail: [
      {
        timestamp: "22 Apr 2026, 10:02 IST",
        actor: "Vendor Portal",
        action: "Submitted invoice",
        detail: "Vendor uploaded PDF with matching PO metadata.",
      },
      {
        timestamp: "22 Apr 2026, 10:03 IST",
        actor: "Workflow Engine",
        action: "Auto-approved",
        detail: "Invoice met low-risk and policy thresholds for straight-through processing.",
      },
    ],
  },
  {
    id: "INV-90872",
    invoiceNumber: "INV-90872",
    vendorName: "Orbit Telecom Infrastructure",
    vendorCode: "V-6143",
    entity: "India Projects",
    amount: 2457600,
    invoiceDate: "14 Apr 2026",
    dueDate: "28 Apr 2026",
    poNumber: "PO-43888",
    grnNumber: "GRN-87933",
    status: "escalated",
    riskLevel: "high",
    riskScore: 83,
    confidence: 89,
    duplicateLikelihood: 27,
    sourceChannel: "SFTP Drop",
    assignedReviewer: "Sonal Gupta",
    agingHours: 43,
    summary:
      "Capex invoice contains non-standard milestone billing and requires controller escalation due to amount, tax treatment, and contract mismatch.",
    workflowRecommendation:
      "Escalate to controller with contract addendum before posting.",
    anomalyTypes: ["Contract mismatch", "Capex review", "Tax treatment"],
    validationChecks: [
      { label: "Vendor master", status: "pass", detail: "Vendor identity validated and account stable." },
      { label: "PO/contract match", status: "warning", detail: "Milestone 3 billing percentage differs from signed addendum." },
      { label: "Duplicate detection", status: "pass", detail: "No material duplicate match identified." },
      { label: "Tax compliance", status: "warning", detail: "Capex tax treatment needs controller confirmation for capitalization." },
      { label: "Approval policy", status: "fail", detail: "Controller sign-off mandatory for invoices above INR 2M." },
    ],
    flags: [
      {
        title: "Capex milestone mismatch",
        severity: "high",
        detail: "Contract addendum allows 35% billing for milestone 3, invoice requests 40%.",
      },
      {
        title: "Capitalization review",
        severity: "medium",
        detail: "Tax setup indicates expense classification, but project is flagged as capex.",
      },
    ],
    structuredFields: [
      { label: "Vendor", value: "Orbit Telecom Infrastructure", confidence: 97, source: "Header" },
      { label: "Milestone", value: "Phase 3 - tower commissioning", confidence: 85, source: "Body text" },
      { label: "Contract addendum", value: "Addendum-7", confidence: 81, source: "Attachment OCR" },
      { label: "Project code", value: "PRJ-2088", confidence: 95, source: "SFTP metadata" },
      { label: "Tax treatment", value: "Expense booked", confidence: 88, source: "ERP policy map" },
    ],
    lineItems: [
      { description: "Tower commissioning milestone", quantity: 1, unitPrice: 2080000, total: 2080000, status: "warning" },
      { description: "Specialized rigging support", quantity: 1, unitPrice: 120000, total: 120000, status: "pass" },
      { description: "GST", quantity: 1, unitPrice: 257600, total: 257600, status: "warning" },
    ],
    fieldComparisons: [
      {
        field: "Milestone percentage",
        submitted: "40%",
        extracted: "40%",
        suggestion: "35%",
        reason: "Signed addendum-7 caps this billing stage at 35%.",
      },
      {
        field: "Accounting treatment",
        submitted: "Expense",
        extracted: "Expense",
        suggestion: "Capex",
        reason: "Project PRJ-2088 is configured as a capitalization program.",
      },
    ],
    auditTrail: [
      {
        timestamp: "20 Apr 2026, 15:22 IST",
        actor: "SFTP Drop",
        action: "Loaded invoice batch",
        detail: "Nightly project-invoice batch processed from vendor managed folder.",
      },
      {
        timestamp: "20 Apr 2026, 15:25 IST",
        actor: "Validation Engine",
        action: "Escalated exception",
        detail: "Contract mismatch and controller approval rule triggered.",
      },
      {
        timestamp: "21 Apr 2026, 09:10 IST",
        actor: "Sonal Gupta",
        action: "Added reviewer comment",
        detail: "Waiting for signed addendum and capitalization confirmation.",
      },
    ],
  },
  {
    id: "INV-90880",
    invoiceNumber: "INV-90880",
    vendorName: "Summit Chemicals",
    vendorCode: "V-7004",
    entity: "India Manufacturing",
    amount: 533200,
    invoiceDate: "19 Apr 2026",
    dueDate: "26 Apr 2026",
    poNumber: "PO-44166",
    grnNumber: "GRN-88243",
    status: "pending-review",
    riskLevel: "medium",
    riskScore: 54,
    confidence: 86,
    duplicateLikelihood: 12,
    sourceChannel: "API Intake",
    assignedReviewer: "Megha Bhat",
    agingHours: 4,
    summary:
      "Chemical supplies invoice needs review because the OCR confidence for the lot reference is below threshold and the COA attachment is missing.",
    workflowRecommendation:
      "Request missing certificate of analysis or manually confirm lot reference.",
    anomalyTypes: ["Low confidence", "Missing evidence"],
    validationChecks: [
      { label: "Vendor master", status: "pass", detail: "Vendor validated against approved supplier list." },
      { label: "PO match", status: "pass", detail: "Amounts align with PO-44166." },
      { label: "Duplicate detection", status: "pass", detail: "No duplicate alert generated." },
      { label: "Confidence threshold", status: "warning", detail: "Lot reference confidence is 58%, below the 80% threshold." },
      { label: "Evidence pack", status: "warning", detail: "Certificate of analysis not included in the API payload." },
    ],
    flags: [
      {
        title: "Low-confidence lot reference",
        severity: "medium",
        detail: "System could not reliably read the batch lot due to stamp overlap in the scan.",
      },
    ],
    structuredFields: [
      { label: "Vendor", value: "Summit Chemicals", confidence: 99, source: "Header" },
      { label: "Lot reference", value: "LOT-8?31", confidence: 58, source: "Stamped footer" },
      { label: "COA attachment", value: "Missing", confidence: 100, source: "API metadata" },
      { label: "Tank code", value: "TK-12", confidence: 91, source: "Line item" },
    ],
    lineItems: [
      { description: "Process solvent batch", quantity: 8, unitPrice: 52150, total: 417200, status: "pass" },
      { description: "Handling fee", quantity: 1, unitPrice: 35000, total: 35000, status: "pass" },
      { description: "GST", quantity: 1, unitPrice: 81000, total: 81000, status: "pass" },
    ],
    fieldComparisons: [
      {
        field: "Lot reference",
        submitted: "LOT-8?31",
        extracted: "LOT-8?31",
        suggestion: "Confirm manually from COA",
        reason: "OCR confidence below threshold and supporting certificate missing.",
      },
    ],
    auditTrail: [
      {
        timestamp: "22 Apr 2026, 11:04 IST",
        actor: "API Intake",
        action: "Received invoice payload",
        detail: "Vendor API delivered JSON metadata with PDF blob.",
      },
      {
        timestamp: "22 Apr 2026, 11:05 IST",
        actor: "Extraction Engine",
        action: "Lowered confidence",
        detail: "Lot reference confidence dropped due to scan overlap on footer stamp.",
      },
    ],
  },
];

export const dashboardMetrics = [
  { label: "Invoices processed", value: "2,487", hint: "+14% vs last week", tone: "info" as const },
  { label: "Pending reviews", value: "42", hint: "11 above SLA", tone: "warning" as const },
  { label: "High-risk invoices", value: "9", hint: "3 newly blocked today", tone: "danger" as const },
  { label: "Duplicate alerts", value: "6", hint: "2 require control sign-off", tone: "warning" as const },
  { label: "Compliance issues", value: "14", hint: "Mostly tax and evidence gaps", tone: "danger" as const },
  { label: "Approval turnaround", value: "11h 24m", hint: "-18% faster", tone: "success" as const },
];

export const workflowLanes = [
  { label: "Straight-through", count: 1384, description: "Low-risk invoices auto-approved today." },
  { label: "Reviewer queue", count: 42, description: "Needs finance or operations validation." },
  { label: "Evidence requests", count: 18, description: "Waiting for supporting documents or vendor response." },
  { label: "Blocked or escalated", count: 11, description: "Duplicate, fraud, or policy exceptions." },
];

export const dashboardTrend = [
  { day: "Mon", processed: 352, flagged: 18, duplicates: 4 },
  { day: "Tue", processed: 401, flagged: 26, duplicates: 6 },
  { day: "Wed", processed: 389, flagged: 23, duplicates: 5 },
  { day: "Thu", processed: 425, flagged: 19, duplicates: 3 },
  { day: "Fri", processed: 468, flagged: 29, duplicates: 7 },
  { day: "Sat", processed: 221, flagged: 11, duplicates: 2 },
];

export const exceptionTypeOptions = [
  "All exceptions",
  "Duplicate alert",
  "Tax mismatch",
  "Missing evidence",
  "Contract mismatch",
  "Bank change",
  "Low confidence",
];

export const ingestionChannels = [
  {
    name: "Manual Upload",
    description: "Drag and drop PDFs, scans, ZIP bundles, or spreadsheets for batch verification.",
    status: "Ready",
  },
  {
    name: "AP Inbox",
    description: "Capture invoices from shared mailboxes with attachment and sender validation.",
    status: "Connected",
  },
  {
    name: "ERP Sync",
    description: "Sync invoices and master data directly from SAP, Oracle, or NetSuite.",
    status: "Connected",
  },
  {
    name: "Vendor Portal",
    description: "Let suppliers submit invoices, attachments, and evidence through a secure portal.",
    status: "Pilot",
  },
  {
    name: "SFTP Drop",
    description: "Nightly encrypted file drops for high-volume vendor or project invoice feeds.",
    status: "Connected",
  },
  {
    name: "API Intake",
    description: "Post structured invoice metadata and files into the processing queue via API.",
    status: "Available",
  },
];

export const processingStages = [
  "Ingestion service",
  "Document processing",
  "Extraction engine",
  "Validation engine",
  "Risk scoring",
  "Workflow routing",
  "Audit trail writeback",
];

export const vendorRiskLeaderboard = [
  { vendor: "Vertex Components Pvt Ltd", riskIndex: 87, issue: "Duplicate and bank change cluster" },
  { vendor: "Orbit Telecom Infrastructure", riskIndex: 81, issue: "Contract mismatch on capex milestone" },
  { vendor: "Bluewave Logistics", riskIndex: 58, issue: "Missing delivery evidence" },
  { vendor: "Summit Chemicals", riskIndex: 49, issue: "Low-confidence batch details" },
];

export const complianceSummary = [
  { entity: "India Manufacturing", compliant: 92, needsReview: 6, blocked: 2 },
  { entity: "India Distribution", compliant: 89, needsReview: 8, blocked: 3 },
  { entity: "Shared Services", compliant: 97, needsReview: 3, blocked: 0 },
  { entity: "India Projects", compliant: 84, needsReview: 10, blocked: 6 },
];

export const approvalMatrix = [
  { level: "AP Analyst", limit: "INR 250K", condition: "Low-risk recurring invoices only" },
  { level: "Finance Manager", limit: "INR 1.25M", condition: "No duplicate, tax, or bank-change alerts" },
  { level: "Controller", limit: "INR 2M+", condition: "Capex, escalations, or policy overrides" },
  { level: "Controls Lead", limit: "Any amount", condition: "Fraud watch, bank amendments, or blocked invoices" },
];

export const rulesCatalog = [
  {
    name: "Duplicate detection",
    description: "Exact + fuzzy duplicate match across amount, vendor, invoice date, and line-item structure.",
    enabled: true,
    owner: "Controls",
  },
  {
    name: "Tax compliance",
    description: "Validate GST fields, classification, rate, and entity-specific compliance requirements.",
    enabled: true,
    owner: "Tax",
  },
  {
    name: "Bank change cooling-off",
    description: "Block payments when vendor bank details change inside the configured cooling-off window.",
    enabled: true,
    owner: "Controls",
  },
  {
    name: "Low-confidence extraction hold",
    description: "Route invoices to manual review if critical field confidence drops below threshold.",
    enabled: true,
    owner: "Operations",
  },
  {
    name: "After-hours approval alert",
    description: "Flag unusual approval timing for high-value or high-risk invoices.",
    enabled: false,
    owner: "Internal Audit",
  },
];

export const integrationCatalog = [
  { name: "SAP S/4HANA", status: "Connected", detail: "POs, GRNs, vendor master, and payment statuses synced hourly." },
  { name: "Shared AP Inbox", status: "Connected", detail: "Inbound attachment parsing and sender allow-list active." },
  { name: "SFTP Vendor Hub", status: "Connected", detail: "Nightly encrypted project batch intake." },
  { name: "Webhook exports", status: "Available", detail: "Push workflow outcomes and audit events to downstream tools." },
];

export const userRoles = [
  { role: "AP Executive", access: "Upload, review queue, request evidence" },
  { role: "Finance Manager", access: "Approve exceptions, override warnings, manage SLA" },
  { role: "Internal Auditor", access: "Audit trail, evidence bundle, reporting exports" },
  { role: "Compliance Officer", access: "Tax rules, policy controls, vendor compliance" },
  { role: "Controller", access: "High-value approvals, escalations, and settings governance" },
];

export const notificationSettings = [
  { name: "Duplicate alert escalation", enabled: true },
  { name: "SLA breach reminder", enabled: true },
  { name: "Vendor evidence response", enabled: true },
  { name: "Daily control summary", enabled: true },
  { name: "Low-confidence digest", enabled: false },
];

export function getInvoiceById(id?: string) {
  return invoiceRecords.find((invoice) => invoice.id === id);
}
