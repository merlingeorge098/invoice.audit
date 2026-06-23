import { Router, type Request, type Response } from "express";
import multer from "multer";
import { extractGstReconciliationData, type GstReconciliationData } from "../services/ocr.ts";
import { db } from "../db.ts";
import { generateGstExcel } from "../services/excel.ts";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GSTIN format: 2-digit state code + 10-char PAN + 1 entity number + Z + 1 check digit
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function validateGstin(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

export const reconciliationRouter = Router();

// POST /api/reconciliation/run — extract + validate + persist run
reconciliationRouter.post("/run", upload.array("invoices", 20), async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) { res.status(400).json({ error: "No files provided." }); return; }

  const { periodFrom, periodTo } = req.body ?? {};

  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) { res.status(404).json({ error: "Tenant not found." }); return; }

  // Create a run record
  const run = await db.gstReconciliationRun.create({
    data: {
      tenantId: session.tenantId,
      periodFrom: periodFrom ? new Date(periodFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      periodTo: periodTo ? new Date(periodTo) : new Date(),
      runBy: session.displayName ?? "System",
      status: "running",
    },
  });

  try {
    const results = await Promise.all(
      files.map((f) => extractGstReconciliationData(f.buffer, f.mimetype, tenant.organizationName)),
    );

    const inward: GstReconciliationData[] = [];
    const outward: GstReconciliationData[] = [];
    const gstinWarnings: { gstin: string; reason: string }[] = [];

    results.forEach((data) => {
      // Validate GSTIN
      if (data.gstin && !validateGstin(data.gstin)) {
        gstinWarnings.push({ gstin: data.gstin, reason: "Invalid GSTIN format" });
      }

      if (data.classification === "INWARD") inward.push(data);
      else outward.push(data);
    });

    // Compute totals
    const sumField = (arr: GstReconciliationData[], key: keyof GstReconciliationData) =>
      arr.reduce((s, d) => s + (Number((d as any)[key]) || 0), 0);

    const totalInward = sumField(inward, "totalAmount");
    const totalOutward = sumField(outward, "totalAmount");
    const cgst = sumField(inward, "cgst") + sumField(outward, "cgst");
    const sgst = sumField(inward, "sgst") + sumField(outward, "sgst");
    const igst = sumField(inward, "igst") + sumField(outward, "igst");
    const mismatches = gstinWarnings.length;

    // Generate Excel
    const excelBuffer = await generateGstExcel(tenant.organizationName, inward, outward);

    // Upload Excel to storage
    let reportPath: string | null = null;
    try {
      const { uploadEvidenceFile } = await import("../services/storage.ts");
      const { storagePath } = await uploadEvidenceFile(
        session.tenantId,
        run.id,
        excelBuffer,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `GST_Reconciliation_${run.id}.xlsx`,
      );
      reportPath = storagePath;
    } catch {
      // Non-fatal — still return results
    }

    // Update run record
    await db.gstReconciliationRun.update({
      where: { id: run.id },
      data: { totalInward, totalOutward, cgst, sgst, igst, mismatches, status: "complete", reportPath },
    });

    res.json({ runId: run.id, success: true, inward, outward, gstinWarnings, totals: { totalInward, totalOutward, cgst, sgst, igst, mismatches } });
  } catch (err: any) {
    await db.gstReconciliationRun.update({ where: { id: run.id }, data: { status: "failed" } });
    res.status(500).json({ error: "Extraction Failed", message: err.message });
  }
});

// GET /api/reconciliation/history — list past runs
reconciliationRouter.get("/history", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const runs = await db.gstReconciliationRun.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { runAt: "desc" },
    take: 50,
  });
  res.json(runs);
});

// GET /api/reconciliation/:runId — get specific run result + download URL
reconciliationRouter.get("/:runId", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const run = await db.gstReconciliationRun.findFirst({
    where: { id: req.params.runId, tenantId: session.tenantId },
  });
  if (!run) { res.status(404).json({ error: "not_found" }); return; }

  let reportUrl: string | null = null;
  if (run.reportPath) {
    try {
      const { getSignedUrl } = await import("../services/storage.ts");
      reportUrl = await getSignedUrl(run.reportPath, 3600);
    } catch {}
  }

  res.json({ ...run, reportUrl });
});

// POST /api/reconciliation/export — direct Excel export (legacy compatibility)
reconciliationRouter.post("/export", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { inward, outward } = req.body;
  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId } });
  if (!tenant) { res.status(404).json({ error: "Tenant not found." }); return; }

  const excelBuffer = await generateGstExcel(tenant.organizationName, inward, outward);
  res.setHeader("Content-Disposition", `attachment; filename=GST_Reconciliation.xlsx`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(excelBuffer);
});
