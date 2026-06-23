import { Router, Request, Response } from "express";
import multer from "multer";
import { db } from "../db.ts";
import { AuditTrailService } from "../services/auditTrailService.ts";
import { EncryptionService } from "../services/encryptionService.ts";

export const erpRouter = Router();

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Simple inline CSV parser — no external dependency required
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

// POST /api/erp/sync/:invoiceId — push approved invoice to configured ERP webhook
erpRouter.post("/sync/:invoiceId", async (req: Request, res: Response) => {
  const tenantSlug = req.header("X-Tenant-Slug");
  const { invoiceId } = req.params;

  if (!tenantSlug) { return res.status(401).json({ error: "Missing Enterprise credentials." }); }

  const tenant = await db.tenant.findUnique({ where: { tenantSlug } });
  if (!tenant) { return res.status(404).json({ error: "Tenant not found." }); }
  if (!tenant.erpWebhookUrl) { return res.status(400).json({ error: "ERP Webhook URL is not configured for this tenant." }); }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: tenant.id },
    include: { lineItems: true },
  }) as any;

  if (!invoice) { return res.status(404).json({ error: "Invoice not found." }); }
  if (invoice.status !== "auto-approved" && invoice.status !== "approved") {
    return res.status(400).json({ error: "Only approved invoices can be synced to the ERP." });
  }

  try {
    const response = await fetch(tenant.erpWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: tenant.erpApiKey ? `Bearer ${EncryptionService.decrypt(tenant.erpApiKey)}` : "",
      },
      body: JSON.stringify({
        source: "Invoice.Audit Pro",
        syncTimestamp: new Date().toISOString(),
        invoicePayload: {
          vendorName: invoice.vendorName,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          date: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          poNumber: invoice.poNumber,
          lineItems: invoice.lineItems,
        },
      }),
    });

    if (!response.ok) throw new Error(`ERP Server responded with ${response.status}`);

    await AuditTrailService.logEvent(db, invoice.id, "System Webhook", "ERP Sync Successful", `Pushed invoice to ERP URL: ${tenant.erpWebhookUrl}`);
    res.json({ success: true, message: "Invoice synced to ERP successfully." });
  } catch (error: any) {
    res.status(502).json({ error: "ERP Sync Failed", message: error.message });
  }
});

// GET /api/erp/config — get ERP webhook config for tenant
erpRouter.get("/config", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const tenant = await db.tenant.findUnique({
    where: { id: session.tenantId },
    select: { erpWebhookUrl: true, erpApiKey: true },
  });

  res.json({
    erpWebhookUrl: tenant?.erpWebhookUrl ?? null,
    hasApiKey: !!(tenant?.erpApiKey),
  });
});

// PUT /api/erp/config — save ERP webhook URL + API key
erpRouter.put("/config", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!session.permissions?.includes("settings:manage")) {
    res.status(403).json({ error: "permission_denied", message: `The ${session.role} role cannot modify ERP configuration.` });
    return;
  }

  const { erpWebhookUrl, erpApiKey } = req.body ?? {};

  const updateData: Record<string, string | null> = { erpWebhookUrl: erpWebhookUrl ?? null };
  if (erpApiKey) {
    updateData.erpApiKey = EncryptionService.encrypt(erpApiKey);
  }

  await db.tenant.update({ where: { id: session.tenantId }, data: updateData });
  res.json({ success: true });
});

// POST /api/erp/csv-import/vendors — bulk upsert vendors from CSV
erpRouter.post(
  "/csv-import/vendors",
  (req: Request, res: Response, next) => {
    csvUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: "upload_error", message: err.message });
      next();
    });
  },
  async (req: Request, res: Response) => {
    const session = res.locals.enterpriseSession;
    if (!session) { res.status(401).json({ error: "unauthorized" }); return; }
    if (!session.permissions?.includes("settings:manage")) {
      res.status(403).json({ error: "permission_denied", message: `The ${session.role} role cannot import vendor data.` });
      return;
    }

    if (!req.file) { res.status(400).json({ error: "No CSV file uploaded." }); return; }

    const raw = req.file.buffer.toString("utf8");
    const { rows } = parseCsv(raw);

    if (rows.length === 0) { res.status(400).json({ error: "CSV is empty or has no data rows." }); return; }

    const created: string[] = [];
    const updated: string[] = [];
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const vendorName = row.vendor_name ?? row.name ?? "";
      const vendorCode = (row.vendor_code ?? row.code ?? "").toUpperCase();

      if (!vendorName) { errors.push({ row: i + 2, reason: "vendor_name is required" }); continue; }

      try {
        const existing = vendorCode
          ? await db.vendorMaster.findFirst({ where: { tenantId: session.tenantId, vendorCode } })
          : null;

        const data = {
          tenantId: session.tenantId,
          vendorName,
          vendorCode: vendorCode || undefined,
          gstin: row.gstin?.toUpperCase() || undefined,
          panNumber: row.pan_number?.toUpperCase() || undefined,
          vendorEmail: row.email || row.vendor_email || undefined,
          vendorPhone: row.phone || row.vendor_phone || undefined,
          addedBy: session.displayName ?? "CSV Import",
        };

        if (existing) {
          await db.vendorMaster.update({ where: { id: existing.id }, data });
          updated.push(vendorName);
        } else {
          await db.vendorMaster.create({ data });
          created.push(vendorName);
        }
      } catch (err: any) {
        errors.push({ row: i + 2, reason: err.message });
      }
    }

    res.json({
      success: true,
      summary: { total: rows.length, created: created.length, updated: updated.length, errors: errors.length },
      errors,
    });
  },
);

// POST /api/erp/csv-import/purchase-orders — bulk import POs from CSV
erpRouter.post(
  "/csv-import/purchase-orders",
  (req: Request, res: Response, next) => {
    csvUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: "upload_error", message: err.message });
      next();
    });
  },
  async (req: Request, res: Response) => {
    const session = res.locals.enterpriseSession;
    if (!session) { res.status(401).json({ error: "unauthorized" }); return; }
    if (!session.permissions?.includes("settings:manage")) {
      res.status(403).json({ error: "permission_denied", message: `The ${session.role} role cannot import purchase order data.` });
      return;
    }

    if (!req.file) { res.status(400).json({ error: "No CSV file uploaded." }); return; }

    const raw = req.file.buffer.toString("utf8");
    const { rows } = parseCsv(raw);

    if (rows.length === 0) { res.status(400).json({ error: "CSV is empty or has no data rows." }); return; }

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const poNumber = row.po_number ?? row.po ?? "";
      const vendorName = row.vendor_name ?? row.vendor ?? "";
      const totalAmount = parseFloat(row.total_amount ?? row.amount ?? "0");

      if (!poNumber || !vendorName) {
        errors.push({ row: i + 2, reason: "po_number and vendor_name are required" });
        continue;
      }

      try {
        const existing = await db.purchaseOrder.findFirst({
          where: { tenantId: session.tenantId, poNumber },
        });

        if (existing) { skipped.push(poNumber); continue; }

        await db.purchaseOrder.create({
          data: {
            tenantId: session.tenantId,
            poNumber,
            vendorName,
            totalAmount: isNaN(totalAmount) ? 0 : totalAmount,
            currency: row.currency ?? "INR",
            issuedAt: row.issued_at ? new Date(row.issued_at) : new Date(),
            expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
            status: row.status ?? "open",
          },
        });
        created.push(poNumber);
      } catch (err: any) {
        errors.push({ row: i + 2, reason: err.message });
      }
    }

    res.json({
      success: true,
      summary: { total: rows.length, created: created.length, skipped: skipped.length, errors: errors.length },
      errors,
    });
  },
);

// GET /api/erp/sync-history — list recent ERP sync logs
erpRouter.get("/sync-history", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const logs = await db.integrationSync.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  res.json(logs);
});
