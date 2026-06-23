import { Router } from "express";
import { db } from "../db.ts";
import { AuditTrailService } from "../services/auditTrailService.ts";
import { applyEnterpriseInvoiceAction } from "../enterprise.ts";

export const exceptionsRouter = Router();

// GET /api/exceptions/list — filtered exceptions with SLA data
exceptionsRouter.get("/list", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { status, assignedTo, vendorName, dateFrom, dateTo, riskMin, riskMax, slaBreached, page = "1", limit = "50" } = req.query as Record<string, string>;

  const where: any = {
    tenantId: session.tenantId,
    status: { notIn: ["auto-approved", "system"] },
  };

  if (status && status !== "all") where.status = status;
  if (assignedTo) where.assignedReviewer = { contains: assignedTo, mode: "insensitive" };
  if (vendorName) where.vendorName = { contains: vendorName, mode: "insensitive" };
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }
  if (riskMin || riskMax) {
    where.riskScore = {};
    if (riskMin) where.riskScore.gte = Number(riskMin);
    if (riskMax) where.riskScore.lte = Number(riskMax);
  }
  if (slaBreached === "true") {
    where.slaDeadline = { lt: new Date() };
  }

  const take = Math.min(Number(limit), 100);
  const skip = (Number(page) - 1) * take;

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      include: { anomalyTypes: true, flags: true, validationChecks: true },
      orderBy: [{ riskScore: "desc" }, { createdAt: "asc" }],
      take,
      skip,
    }),
    db.invoice.count({ where }),
  ]);

  // Get SLA rules from tenant settings
  const slaRule = await db.ruleSetting.findFirst({
    where: { tenantId: session.tenantId, name: "SLA hours" },
  });
  const slaConfig = (slaRule?.config as any) ?? { high: 4, medium: 24, low: 72 };

  const now = new Date();
  const enriched = invoices.map((inv) => {
    const slaHours = slaConfig[inv.riskLevel] ?? 24;
    const slaDeadline = inv.slaDeadline ?? new Date(inv.createdAt.getTime() + slaHours * 60 * 60 * 1000);
    const slaHoursRemaining = Math.max(0, (slaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60));
    return {
      ...inv,
      anomalyTypes: inv.anomalyTypes.map((a) => a.type),
      slaDeadline: slaDeadline.toISOString(),
      slaBreached: now > slaDeadline,
      slaHoursRemaining: Math.round(slaHoursRemaining * 10) / 10,
    };
  });

  res.json({
    items: enriched,
    total,
    page: Number(page),
    pages: Math.ceil(total / take),
    summary: {
      highSeverity: enriched.filter((i) => i.flags.some((f) => f.severity === "high")).length,
      slaBreached: enriched.filter((i) => i.slaBreached).length,
      needsEvidence: enriched.filter((i) => i.status === "needs-evidence").length,
    },
  });
});

// POST /api/exceptions/bulk — bulk actions
exceptionsRouter.post("/bulk", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { invoiceIds, action, payload } = req.body ?? {};
  if (!Array.isArray(invoiceIds) || !action) {
    res.status(400).json({ error: "invoiceIds array and action are required" });
    return;
  }

  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of invoiceIds) {
    try {
      const result = await applyEnterpriseInvoiceAction(
        session.tenantId,
        id,
        action,
        session.displayName ?? "System",
        payload?.note,
      );
      if (result) {
        succeeded.push(id);
      } else {
        failed.push({ id, reason: "Invoice not found" });
      }
    } catch (err: any) {
      failed.push({ id, reason: err.message });
    }
  }

  res.json({ succeeded: succeeded.length, failed });
});
