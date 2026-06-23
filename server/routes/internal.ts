import { Router } from "express";
import { db } from "../db.ts";
import { checkAndNotifySlaBreaches } from "../services/notifications.ts";

export const internalRouter = Router();

function requireInternalKey(req: any, res: any, next: any) {
  const key = req.header("X-Internal-Key");
  if (!process.env.INTERNAL_CRON_KEY || key !== process.env.INTERNAL_CRON_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

// POST /api/internal/check-slas — scan for SLA breaches and notify (Railway cron)
internalRouter.post("/check-slas", requireInternalKey, async (_req, res) => {
  const notified = await checkAndNotifySlaBreaches();
  res.json({ success: true, notified });
});

// POST /api/internal/snapshot — take daily metric snapshots per tenant (Railway cron)
internalRouter.post("/snapshot", requireInternalKey, async (_req, res) => {
  const tenants = await db.tenant.findMany({ select: { id: true } });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let created = 0;
  for (const tenant of tenants) {
    const invoices = await db.invoice.findMany({
      where: { tenantId: tenant.id, status: { not: "system" } },
      select: { status: true, riskScore: true, amount: true, riskLevel: true },
    });

    const snap = {
      tenantId: tenant.id,
      snapshotDate: today,
      totalInvoices: invoices.length,
      pendingCount: invoices.filter((i) => i.status === "pending-review").length,
      autoApprovedCount: invoices.filter((i) => i.status === "auto-approved").length,
      blockedCount: invoices.filter((i) => i.status === "blocked" || i.status === "escalated").length,
      needsEvidenceCount: invoices.filter((i) => i.status === "needs-evidence").length,
      highRiskCount: invoices.filter((i) => i.riskLevel === "high").length,
      totalAmount: invoices.reduce((s, i) => s + (i.amount ?? 0), 0),
      avgRiskScore: invoices.length > 0 ? invoices.reduce((s, i) => s + i.riskScore, 0) / invoices.length : 0,
    };

    await db.auditSnapshot.upsert({
      where: { tenantId_snapshotDate: { tenantId: tenant.id, snapshotDate: today } },
      update: snap,
      create: snap,
    });
    created++;
  }

  res.json({ success: true, snapshotsTaken: created });
});

// GET /api/health — health check (public, no auth)
internalRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0", timestamp: new Date().toISOString() });
});
