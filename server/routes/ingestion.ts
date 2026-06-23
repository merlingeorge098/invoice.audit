import { Router, type Request, type Response } from "express";
import multer from "multer";
import { extractInvoiceDataWithGPT4o } from "../services/ocr.ts";
import { runInvoiceValidation } from "../services/validationEngine.ts";
import { uploadInvoiceFile, getSignedUrl } from "../services/storage.ts";
import { db } from "../db.ts";
import { AuditTrailService } from "../services/auditTrailService.ts";
import { EvidenceService } from "../services/evidenceService.ts";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Only PDF, PNG, and JPEG are allowed."));
    }
  },
});

export const ingestionRouter = Router();

// POST /api/invoices/upload — single or batch upload
ingestionRouter.post(
  "/upload",
  (req: Request, res: Response, next) => {
    upload.array("files", 10)(req, res, (err) => {
      if (err) return res.status(400).json({ error: "upload_error", message: err.message });
      next();
    });
  },
  async (req: Request, res: Response) => {
    const session = res.locals.enterpriseSession;
    if (!session) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (!session.permissions?.includes("invoice:upload")) {
      res.status(403).json({
        error: "permission_denied",
        message: `The ${session.role} role cannot upload invoices.`,
      });
      return;
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "no_files", message: "At least one file is required." });
      return;
    }

    // Check invoice plan limit
    const stripeCustomer = await db.stripeCustomer.findUnique({ where: { tenantId: session.tenantId } });
    const planSlug = stripeCustomer?.planSlug ?? "free";
    const planLimit = await db.planLimit.findUnique({ where: { planSlug } });
    if (planLimit && planLimit.maxInvoicesPerMonth !== -1) {
      const periodMonth = Number(`${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}`);
      const usageCount = await db.usageEvent.aggregate({
        where: { tenantId: session.tenantId, eventType: "invoice_processed", periodMonth },
        _sum: { quantity: true },
      });
      const used = usageCount._sum.quantity ?? 0;
      if (used + files.length > planLimit.maxInvoicesPerMonth) {
        res.status(402).json({
          error: "invoice_limit_reached",
          message: `Your ${planSlug} plan allows ${planLimit.maxInvoicesPerMonth} invoices per month. You have ${planLimit.maxInvoicesPerMonth - used} remaining. Upgrade to process more.`,
          used,
          limit: planLimit.maxInvoicesPerMonth,
        });
        return;
      }
    }

    // Respond immediately with invoice IDs — process asynchronously
    const invoiceIds: string[] = [];
    const results: { filename: string; invoiceId: string; status: string; error?: string }[] = [];

    for (const file of files) {
      try {
        // Duplicate check by SHA-256 before hitting storage
        const { uploadInvoiceFile: _u, ...storageModule } = await import("../services/storage.ts");
        const crypto = await import("crypto");
        const fileHash = crypto.default.createHash("sha256").update(file.buffer).digest("hex");

        const existing = await db.invoice.findFirst({
          where: { tenantId: session.tenantId, fileHash },
        });

        if (existing) {
          results.push({ filename: file.originalname, invoiceId: existing.id, status: "duplicate" });
          continue;
        }

        // Upload to Supabase Storage
        const { storagePath, sha256Hash } = await uploadInvoiceFile(
          session.tenantId,
          file.buffer,
          file.mimetype,
          file.originalname,
        );

        // Create invoice record as 'queued'
        const invoice = await db.invoice.create({
          data: {
            tenantId: session.tenantId,
            fileHash: sha256Hash,
            storagePath,
            processingStep: "queued",
            invoiceNumber: `PENDING-${Date.now()}`,
            vendorName: "Processing…",
            vendorCode: "PENDING",
            entity: "Processing…",
            amount: 0,
            invoiceDate: new Date().toISOString().split("T")[0],
            dueDate: new Date().toISOString().split("T")[0],
            poNumber: "",
            grnNumber: "",
            status: "processing",
            riskLevel: "medium",
            riskScore: 50,
            confidence: 0,
            duplicateLikelihood: 0,
            sourceChannel: "File Upload",
            assignedReviewer: "Unassigned",
            agingHours: 0,
            summary: "Processing…",
            workflowRecommendation: "Processing…",
          },
        });

        invoiceIds.push(invoice.id);
        results.push({ filename: file.originalname, invoiceId: invoice.id, status: "queued" });

        // Track usage
        const periodMonth = Number(`${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}`);
        await db.usageEvent.create({
          data: { tenantId: session.tenantId, eventType: "invoice_processed", periodMonth },
        });

        // Process async (don't await — respond immediately)
        processInvoiceAsync(session.tenantId, invoice.id, file.buffer, file.mimetype, session.displayName ?? "System");
      } catch (err: any) {
        console.error(`[Ingestion] Error processing ${file.originalname}:`, err);
        results.push({ filename: file.originalname, invoiceId: "", status: "error", error: err.message });
      }
    }

    res.status(202).json({
      message: `${results.filter((r) => r.status === "queued").length} invoice(s) queued for processing.`,
      results,
    });
  },
);

// GET /api/invoices/:id/status — processing status polling
ingestionRouter.get("/:id/status", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const invoice = await db.invoice.findFirst({
    where: { id: req.params.id, tenantId: session.tenantId },
    select: { id: true, processingStep: true, status: true, invoiceNumber: true, vendorName: true, amount: true },
  });

  if (!invoice) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json(invoice);
});

// GET /api/invoices/:id/file — get signed download URL
ingestionRouter.get("/:id/file", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const invoice = await db.invoice.findFirst({
    where: { id: req.params.id, tenantId: session.tenantId },
    select: { storagePath: true },
  });

  if (!invoice?.storagePath) {
    res.status(404).json({ error: "not_found", message: "No file available for this invoice." });
    return;
  }

  try {
    const url = await getSignedUrl(invoice.storagePath, 3600);
    res.json({ url, expiresIn: 3600 });
  } catch (err: any) {
    res.status(500).json({ error: "storage_error", message: err.message });
  }
});

// POST /api/ingestion/api-intake — structured data intake via API key
ingestionRouter.post("/api-intake", async (req: Request, res: Response) => {
  const apiKey = req.header("X-Api-Key");
  if (!apiKey) {
    res.status(401).json({ error: "missing_api_key" });
    return;
  }

  const { createHash } = await import("crypto");
  const keyHash = createHash("sha256").update(apiKey).digest("hex");

  // Find the API key record (compare hash prefix)
  const allKeys = await db.tenantApiKey.findMany({
    where: { revokedAt: null },
    select: { id: true, keyHash: true, tenantId: true, lastUsedAt: true, expiresAt: true },
  });

  const matchedKey = allKeys.find((k) => {
    try {
      const bcrypt = require("bcryptjs");
      return bcrypt.compareSync(apiKey, k.keyHash);
    } catch {
      return false;
    }
  });

  if (!matchedKey || (matchedKey.expiresAt && new Date() > matchedKey.expiresAt)) {
    res.status(401).json({ error: "invalid_api_key" });
    return;
  }

  await db.tenantApiKey.update({ where: { id: matchedKey.id }, data: { lastUsedAt: new Date() } });

  const { invoiceNumber, vendorName, amount, invoiceDate, dueDate, poNumber, lineItems } = req.body ?? {};
  if (!invoiceNumber || !vendorName || !amount) {
    res.status(400).json({ error: "missing_fields", message: "invoiceNumber, vendorName, and amount are required." });
    return;
  }

  const invoice = await db.invoice.create({
    data: {
      tenantId: matchedKey.tenantId,
      invoiceNumber,
      vendorName,
      vendorCode: `V-${vendorName.substring(0, 3).toUpperCase()}`,
      entity: req.body.entity ?? "Main Entity",
      amount: Number(amount),
      invoiceDate: invoiceDate ?? new Date().toISOString().split("T")[0],
      dueDate: dueDate ?? new Date().toISOString().split("T")[0],
      poNumber: poNumber ?? "",
      grnNumber: req.body.grnNumber ?? "",
      processingStep: "validating",
      status: "processing",
      riskLevel: "medium",
      riskScore: 50,
      confidence: 95,
      duplicateLikelihood: 5,
      sourceChannel: "API Intake",
      assignedReviewer: "Unassigned",
      agingHours: 0,
      summary: `Invoice from ${vendorName} for ${amount}`,
      workflowRecommendation: "Pending validation",
      lineItems: lineItems
        ? {
            create: (lineItems as any[]).map((item) => ({
              description: item.description ?? "",
              quantity: Number(item.quantity ?? 1),
              unitPrice: Number(item.unitPrice ?? 0),
              total: Number(item.total ?? 0),
              status: "pending",
            })),
          }
        : undefined,
    },
  });

  await AuditTrailService.logEvent(db, invoice.id, "API Intake", "Invoice Created", `Invoice received via API by key ${matchedKey.id}.`);
  setImmediate(() => runInvoiceValidation(matchedKey.tenantId, invoice.id).catch(console.error));

  res.status(201).json({ invoiceId: invoice.id, status: "queued" });
});

// POST /api/invoices/import-csv — parse a CSV file and create Invoice records directly (no OCR)
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Inline CSV parser (same logic as erp.ts parseCsv)
function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cols.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    return cols;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((line) => {
    const vals = parseRow(line);
    return headers.reduce<Record<string, string>>((obj, h, i) => { obj[h] = vals[i] ?? ""; return obj; }, {});
  });

  return { headers, rows };
}

ingestionRouter.post(
  "/import-csv",
  (req: Request, res: Response, next) => {
    csvUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: "upload_error", message: err.message });
      next();
    });
  },
  async (req: Request, res: Response) => {
    const session = res.locals.enterpriseSession;
    if (!session) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    if (!session.permissions?.includes("invoice:upload")) {
      res.status(403).json({
        error: "permission_denied",
        message: `The ${session.role} role cannot upload invoices.`,
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "no_file", message: "A CSV file is required." });
      return;
    }

    const raw = req.file.buffer.toString("utf8");
    const { rows } = parseCsv(raw);

    if (rows.length === 0) {
      res.status(400).json({ error: "empty_csv", message: "CSV file is empty or has no data rows." });
      return;
    }

    const imported: string[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const invoiceNumber = row.invoice_number ?? "";
      const vendorName = row.vendor_name ?? "";
      const amountRaw = row.amount ?? "";

      if (!invoiceNumber || !vendorName || !amountRaw) {
        skipped.push({ row: i + 2, reason: "Missing required fields: invoice_number, vendor_name, amount" });
        continue;
      }

      const amount = parseFloat(amountRaw);
      if (isNaN(amount)) {
        skipped.push({ row: i + 2, reason: `Invalid amount: ${amountRaw}` });
        continue;
      }

      try {
        const invoice = await db.invoice.create({
          data: {
            tenantId: session.tenantId,
            invoiceNumber,
            vendorName,
            vendorCode: row.vendor_code || `V-${vendorName.substring(0, 3).toUpperCase()}`,
            entity: row.entity || "Main Entity",
            amount,
            invoiceDate: row.invoice_date || new Date().toISOString().split("T")[0],
            dueDate: row.due_date || new Date().toISOString().split("T")[0],
            poNumber: row.po_number || "",
            grnNumber: row.grn_number || "",
            processingStep: "complete",
            status: "pending-review",
            riskLevel: "medium",
            riskScore: 50,
            confidence: 95,
            duplicateLikelihood: 5,
            sourceChannel: "CSV Import",
            assignedReviewer: "Unassigned",
            agingHours: 0,
            summary: row.description ? `${row.description}` : `CSV import: ${vendorName} — ₹${amount.toLocaleString("en-IN")}`,
            workflowRecommendation: "Pending validation",
          },
        });

        await AuditTrailService.logEvent(
          db,
          invoice.id,
          session.displayName ?? "System",
          "Invoice Imported",
          `Invoice imported via CSV upload. Row ${i + 2}.`,
        );

        setImmediate(() => runInvoiceValidation(session.tenantId, invoice.id).catch(console.error));
        imported.push(invoice.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        skipped.push({ row: i + 2, reason: msg });
      }
    }

    res.status(201).json({
      message: `${imported.length} invoice(s) imported, ${skipped.length} skipped.`,
      imported: imported.length,
      skipped: skipped.length,
      skippedDetails: skipped,
    });
  },
);

// POST /api/invoices/seed-sample — load 18 realistic sample invoices with full validation
ingestionRouter.post("/seed-sample", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (!session.permissions?.includes("invoice:upload")) {
    res.status(403).json({
      error: "permission_denied",
      message: `The ${session.role} role cannot upload invoices.`,
    });
    return;
  }

  const existingCount = await db.invoice.count({ where: { tenantId: session.tenantId } });
  if (existingCount >= 5) {
    res.status(409).json({
      error: "already_has_data",
      message: "This workspace already has invoice data. Seed is only available for empty workspaces.",
    });
    return;
  }

  // Step 1: Pre-register approved vendors (not "Unknown Vendor Ltd" — kept unregistered for fraud demo)
  const approvedVendors = [
    { vendorName: "Tata Consultancy Services", vendorCode: "TCS", gstin: "27AAACT2727Q1ZW" },
    { vendorName: "Infosys BPO Ltd", vendorCode: "INFY", gstin: "29AABCI1681G1ZK" },
    { vendorName: "Wipro Technologies", vendorCode: "WIPR", gstin: "29AAACW0035G1ZQ" },
    { vendorName: "Amazon Web Services", vendorCode: "AWS", gstin: "29AANCA6083L1Z0" },
    { vendorName: "Reliance Jio Infocomm", vendorCode: "JIO", gstin: "27AABCR2641E1ZU" },
    { vendorName: "HDFC Bank Ltd", vendorCode: "HDFC", gstin: "27AAACH0997M1ZR" },
    { vendorName: "Zomato Business", vendorCode: "ZOM", gstin: "27AABCZ0722F1ZX" },
    { vendorName: "Microsoft India", vendorCode: "MSFT", gstin: "29AABCM4440H1ZA" },
    { vendorName: "Bajaj Electricals", vendorCode: "BAJJ", gstin: "27AABCB4175F1ZM" },
    { vendorName: "Flipkart Internet Pvt Ltd", vendorCode: "FLIP", gstin: "29AABCF8078M1C8" },
    { vendorName: "Oracle India Pvt Ltd", vendorCode: "ORCL", gstin: "29AABCO0662P1Z8" },
    { vendorName: "Zoho Corporation", vendorCode: "ZOHO", gstin: "33AABCZ0702N1ZX" },
    { vendorName: "Quick Logistics Pvt Ltd", vendorCode: "QLG", gstin: "27AABCQ1234N1ZY" },
    { vendorName: "Shell India Markets", vendorCode: "SHLL", gstin: "07AABCS2188A1ZC" },
  ];

  for (const v of approvedVendors) {
    const existing = await db.vendorMaster.findFirst({
      where: { tenantId: session.tenantId, vendorCode: v.vendorCode },
    });
    if (!existing) {
      await db.vendorMaster.create({
        data: {
          tenantId: session.tenantId,
          vendorName: v.vendorName,
          vendorCode: v.vendorCode,
          gstin: v.gstin,
          isActive: true,
          addedBy: "Sample Data Seeder",
        },
      });
    }
  }

  // Step 2: Pre-register purchase orders
  const purchaseOrders = [
    { poNumber: "PO-2024-001", vendorName: "Tata Consultancy Services", totalAmount: 485000 },
    { poNumber: "PO-2024-002", vendorName: "Infosys BPO Ltd", totalAmount: 320000 },
    { poNumber: "PO-2024-004", vendorName: "Amazon Web Services", totalAmount: 92500 },
    { poNumber: "PO-2024-005", vendorName: "Reliance Jio Infocomm", totalAmount: 48000 },
    { poNumber: "PO-2024-008", vendorName: "HDFC Bank Ltd", totalAmount: 15000 },
    { poNumber: "PO-2024-010", vendorName: "Microsoft India", totalAmount: 145000 },
    { poNumber: "PO-2024-011", vendorName: "Bajaj Electricals", totalAmount: 67000 },
    { poNumber: "PO-2024-014", vendorName: "Oracle India Pvt Ltd", totalAmount: 520000 },
    { poNumber: "PO-2024-015", vendorName: "Zoho Corporation", totalAmount: 38500 },
    { poNumber: "PO-2024-017", vendorName: "Shell India Markets", totalAmount: 55000 },
  ];

  for (const po of purchaseOrders) {
    const existing = await db.purchaseOrder.findFirst({
      where: { tenantId: session.tenantId, poNumber: po.poNumber },
    });
    if (!existing) {
      await db.purchaseOrder.create({
        data: {
          tenantId: session.tenantId,
          poNumber: po.poNumber,
          vendorName: po.vendorName,
          totalAmount: po.totalAmount,
          currency: "INR",
          issuedAt: new Date("2024-01-01"),
          status: "open",
        },
      });
    }
  }

  // Step 3: Create invoices one-by-one and run validation immediately after each.
  // Sequential order ensures duplicate detection works correctly:
  // INV-2024-001 (TCS) is validated before INV-2024-007 (same number = duplicate).
  // INV-2024-002 (Infosys) is validated before INV-2024-013 (same number = duplicate).
  const sampleInvoices = [
    { invoiceNumber: "INV-2024-001", vendorName: "Tata Consultancy Services", vendorCode: "TCS", amount: 485000, invoiceDate: "2024-01-15", dueDate: "2024-02-14", poNumber: "PO-2024-001", description: "Software development services Q1" },
    { invoiceNumber: "INV-2024-002", vendorName: "Infosys BPO Ltd", vendorCode: "INFY", amount: 320000, invoiceDate: "2024-01-18", dueDate: "2024-02-17", poNumber: "PO-2024-002", description: "IT support services" },
    { invoiceNumber: "INV-2024-003", vendorName: "Wipro Technologies", vendorCode: "WIPR", amount: 175000, invoiceDate: "2024-01-22", dueDate: "2024-02-21", poNumber: "", description: "Cloud hosting charges" },
    { invoiceNumber: "INV-2024-004", vendorName: "Amazon Web Services", vendorCode: "AWS", amount: 92500, invoiceDate: "2024-01-25", dueDate: "2024-02-24", poNumber: "PO-2024-004", description: "EC2 and S3 usage January" },
    { invoiceNumber: "INV-2024-005", vendorName: "Reliance Jio Infocomm", vendorCode: "JIO", amount: 48000, invoiceDate: "2024-02-01", dueDate: "2024-03-01", poNumber: "PO-2024-005", description: "Enterprise broadband Feb" },
    { invoiceNumber: "INV-2024-006", vendorName: "Unknown Vendor Ltd", vendorCode: "UNK", amount: 850000, invoiceDate: "2024-02-05", dueDate: "2024-03-05", poNumber: "", description: "Consultancy services — unregistered vendor" },
    { invoiceNumber: "INV-2024-001", vendorName: "Tata Consultancy Services", vendorCode: "TCS", amount: 485000, invoiceDate: "2024-02-10", dueDate: "2024-03-10", poNumber: "PO-2024-001", description: "DUPLICATE: Software development services Q1" },
    { invoiceNumber: "INV-2024-008", vendorName: "HDFC Bank Ltd", vendorCode: "HDFC", amount: 15000, invoiceDate: "2024-02-12", dueDate: "2024-03-12", poNumber: "PO-2024-008", description: "Banking service charges" },
    { invoiceNumber: "INV-2024-009", vendorName: "Zomato Business", vendorCode: "ZOM", amount: 28500, invoiceDate: "2024-02-15", dueDate: "2024-03-15", poNumber: "", description: "Employee meal allowances" },
    { invoiceNumber: "INV-2024-010", vendorName: "Microsoft India", vendorCode: "MSFT", amount: 145000, invoiceDate: "2024-02-20", dueDate: "2024-03-20", poNumber: "PO-2024-010", description: "Azure subscription annual" },
    { invoiceNumber: "INV-2024-011", vendorName: "Bajaj Electricals", vendorCode: "BAJJ", amount: 67000, invoiceDate: "2024-03-01", dueDate: "2024-03-31", poNumber: "PO-2024-011", description: "Office equipment purchase" },
    { invoiceNumber: "INV-2024-012", vendorName: "Flipkart Internet Pvt Ltd", vendorCode: "FLIP", amount: 195000, invoiceDate: "2024-03-05", dueDate: "2024-04-04", poNumber: "", description: "Bulk purchase — electronics, no PO reference" },
    { invoiceNumber: "INV-2024-002", vendorName: "Infosys BPO Ltd", vendorCode: "INFY", amount: 320000, invoiceDate: "2024-03-08", dueDate: "2024-04-07", poNumber: "PO-2024-002", description: "DUPLICATE: IT support services" },
    { invoiceNumber: "INV-2024-014", vendorName: "Oracle India Pvt Ltd", vendorCode: "ORCL", amount: 520000, invoiceDate: "2024-03-10", dueDate: "2024-04-09", poNumber: "PO-2024-014", description: "Database licence renewal" },
    { invoiceNumber: "INV-2024-015", vendorName: "Zoho Corporation", vendorCode: "ZOHO", amount: 38500, invoiceDate: "2024-03-15", dueDate: "2024-04-14", poNumber: "PO-2024-015", description: "CRM and productivity suite" },
    { invoiceNumber: "INV-2024-016", vendorName: "Quick Logistics Pvt Ltd", vendorCode: "QLG", amount: 12500, invoiceDate: "2024-03-18", dueDate: "2024-04-17", poNumber: "", description: "Courier and logistics" },
    { invoiceNumber: "INV-2024-017", vendorName: "Shell India Markets", vendorCode: "SHLL", amount: 55000, invoiceDate: "2024-03-20", dueDate: "2024-04-19", poNumber: "PO-2024-017", description: "Fleet fuel reimbursement" },
    { invoiceNumber: "INV-2024-018", vendorName: "Unknown Vendor Ltd", vendorCode: "UNK2", amount: 1250000, invoiceDate: "2024-03-22", dueDate: "2024-04-21", poNumber: "", description: "Strategic advisory — unregistered vendor, high value" },
  ];

  let seededCount = 0;
  for (const sample of sampleInvoices) {
    const invoice = await db.invoice.create({
      data: {
        tenantId: session.tenantId,
        invoiceNumber: sample.invoiceNumber,
        vendorName: sample.vendorName,
        vendorCode: sample.vendorCode,
        entity: "Aviotal HQ",
        amount: sample.amount,
        invoiceDate: sample.invoiceDate,
        dueDate: sample.dueDate,
        poNumber: sample.poNumber,
        grnNumber: "",
        processingStep: "validating",
        status: "processing",
        riskLevel: "medium",
        riskScore: 50,
        confidence: 92,
        duplicateLikelihood: 0,
        sourceChannel: "Sample Data",
        assignedReviewer: "Unassigned",
        agingHours: 0,
        summary: sample.description,
        workflowRecommendation: "Pending validation",
      },
    });

    // Run validation immediately so flags, checks, and anomaly types are populated.
    // Sequential execution ensures duplicate detection sees previously validated invoices.
    try {
      await runInvoiceValidation(session.tenantId, invoice.id);
    } catch (err) {
      console.error(`[Seed] Validation failed for ${sample.invoiceNumber}:`, err);
    }

    await AuditTrailService.logEvent(
      db,
      invoice.id,
      session.displayName ?? "System",
      "Sample Invoice Seeded",
      `Sample invoice ${sample.invoiceNumber} seeded and validated.`,
    );

    seededCount++;
  }

  res.status(201).json({ seeded: seededCount, message: `${seededCount} sample invoices loaded with full validation.` });
});

// GET /api/invoices/:id/evidence-package — generate or retrieve compliance evidence bundle
ingestionRouter.get("/:id/evidence-package", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const invoice = await db.invoice.findFirst({
    where: { id: req.params.id, tenantId: session.tenantId },
    select: { id: true, invoiceNumber: true },
  });
  if (!invoice) { res.status(404).json({ error: "not_found" }); return; }

  try {
    const result = await EvidenceService.getOrCreatePackage(
      invoice.id,
      session.tenantId,
      session.displayName ?? "System",
    );
    await AuditTrailService.logEvent(
      db,
      invoice.id,
      session.displayName ?? "System",
      "Evidence Package Downloaded",
      `Compliance evidence bundle downloaded. SHA-256: ${result.sha256Hash}`,
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "evidence_package_failed", message: err.message });
  }
});

// Async processing pipeline
async function processInvoiceAsync(
  tenantId: string,
  invoiceId: string,
  buffer: Buffer,
  mimeType: string,
  actor: string,
) {
  try {
    // Step 1: OCR
    await db.invoice.update({ where: { id: invoiceId }, data: { processingStep: "ocr_processing" } });
    const extracted = await extractInvoiceDataWithGPT4o(buffer, mimeType);

    // Step 2: Save extracted fields
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        processingStep: "ocr_complete",
        invoiceNumber: extracted.invoiceNumber || `INV-${Date.now()}`,
        vendorName: extracted.vendorName || "Unknown Vendor",
        vendorCode: `V-${(extracted.vendorName ?? "UNK").substring(0, 3).toUpperCase()}`,
        amount: extracted.amount || 0,
        invoiceDate: extracted.invoiceDate || new Date().toISOString().split("T")[0],
        dueDate: extracted.dueDate || new Date().toISOString().split("T")[0],
        poNumber: extracted.poNumber || "",
        confidence: 85,
        summary: `Invoice from ${extracted.vendorName} for ₹${extracted.amount?.toLocaleString("en-IN") ?? 0}`,
        workflowRecommendation: "Running validation checks…",
      },
    });

    // Save structured fields
    if (extracted.lineItems?.length) {
      await db.lineItem.createMany({
        data: extracted.lineItems.map((item) => ({
          invoiceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          status: "pending",
        })),
      });
    }

    await AuditTrailService.logEvent(db, invoiceId, actor, "OCR Complete", `Extracted via GPT-4o: ${extracted.invoiceNumber}, ₹${extracted.amount}`);

    // Step 3: Validation
    await db.invoice.update({ where: { id: invoiceId }, data: { processingStep: "validating" } });
    await runInvoiceValidation(tenantId, invoiceId);

    await db.invoice.update({ where: { id: invoiceId }, data: { processingStep: "complete" } });
  } catch (err: any) {
    console.error(`[ProcessInvoice] Failed for ${invoiceId}:`, err);
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        processingStep: "failed",
        status: "blocked",
        summary: `Processing failed: ${err.message}`,
        workflowRecommendation: "Manual review required — automated processing encountered an error.",
      },
    }).catch(() => {});
  }
}
