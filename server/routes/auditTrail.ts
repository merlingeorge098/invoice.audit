import { Router } from "express";
import { db } from "../db.ts";
import { AuditTrailService } from "../services/auditTrailService.ts";
import crypto from "crypto";

export const auditRouter = Router();

// GET /api/audit — paginated audit events with per-row HMAC chain validity
auditRouter.get("/", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { actor, type, invoiceId, dateFrom, dateTo, page = "1", limit = "50" } = req.query as Record<string, string>;

  const where: any = { tenantId: session.tenantId };
  if (actor) where.actor = { contains: actor, mode: "insensitive" };
  if (type) where.action = { contains: type, mode: "insensitive" };
  if (invoiceId) where.invoiceId = invoiceId;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const take = Math.min(Number(limit), 200);
  const skip = (Number(page) - 1) * take;

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
    db.auditEvent.count({ where }),
  ]);

  // Compute per-row HMAC validity by replaying each invoice's hash chain
  const invoiceIds = [...new Set(events.map((e) => e.invoiceId))];

  // Fetch all events for the invoice IDs present in this page (ascending = chain order)
  const chainEvents = await db.auditEvent.findMany({
    where: { invoiceId: { in: invoiceIds as string[] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, invoiceId: true, actor: true, action: true, detail: true, timestamp: true, signature: true },
  });

  // Walk each invoice's chain and record validity per event ID
  const hmacValid = new Map<string, boolean>();
  const byInvoice = new Map<string | null, typeof chainEvents>();
  for (const e of chainEvents) {
    const key = e.invoiceId ?? null;
    if (!byInvoice.has(key)) byInvoice.set(key, []);
    byInvoice.get(key)!.push(e);
  }

  for (const chain of byInvoice.values()) {
    let prevSig = "0".repeat(64);
    for (const event of chain) {
      if (!event.signature) {
        hmacValid.set(event.id, false);
        continue;
      }
      const stateString = JSON.stringify({
        invoiceId: event.invoiceId,
        actor: event.actor,
        action: event.action,
        detail: event.detail,
        timestamp: event.timestamp,
        previousSignature: prevSig,
      });
      const expected = crypto.createHash("sha256").update(stateString).digest("hex");
      hmacValid.set(event.id, expected === event.signature);
      prevSig = event.signature;
    }
  }

  const enriched = events.map((e) => ({
    ...e,
    hmacValid: e.invoiceId !== null ? (hmacValid.get(e.id) ?? false) : e.signature !== null,
  }));

  res.json({ items: enriched, total, page: Number(page), pages: Math.ceil(total / take) });
});

// GET /api/audit/verify — verify hash chain integrity
auditRouter.get("/verify", async (_req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const events = await db.auditEvent.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, actor: true, action: true, detail: true, timestamp: true, signature: true },
  });

  let tampered = false;
  let firstBrokenAt: string | null = null;
  let verified = 0;

  const signingKey = process.env.AUDIT_SIGNING_KEY ?? "";
  for (const event of events) {
    if (!event.signature) continue;
    const payload = `${event.actor}|${event.action}|${event.detail}|${event.timestamp}`;
    const expected = crypto.createHmac("sha256", signingKey).update(payload).digest("hex");
    if (event.signature !== expected) {
      tampered = true;
      firstBrokenAt = event.id;
      break;
    }
    verified++;
  }

  res.json({
    verified,
    total: events.length,
    tampered,
    firstBrokenAt,
    message: tampered
      ? `Tamper detected at event ${firstBrokenAt}.`
      : `All ${verified} signed events verified. No tampering detected.`,
  });
});

// GET /api/audit/export — stream NDJSON export
auditRouter.get("/export", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { dateFrom, dateTo } = req.query as Record<string, string>;

  const where: any = { tenantId: session.tenantId };
  if (dateFrom) where.createdAt = { ...(where.createdAt ?? {}), gte: new Date(dateFrom) };
  if (dateTo) where.createdAt = { ...(where.createdAt ?? {}), lte: new Date(dateTo) };

  const events = await db.auditEvent.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Content-Disposition", `attachment; filename=audit-export-${Date.now()}.ndjson`);

  for (const event of events) {
    res.write(JSON.stringify(event) + "\n");
  }
  res.end();
});
