import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "development" });
}

import cors from "cors";
import express, { type Request, type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import {
  platformStore,
  type EnterpriseSessionRecord,
  type InvoiceActionType,
  permissionsByRole,
  type EnterpriseRole,
} from "./store.ts";
import { db } from "./db.ts";
import { authRouter } from "./auth.ts";
import { googleAuthRouter } from "./auth/google.ts";
import { ingestionRouter } from "./routes/ingestion.ts";
import { erpRouter } from "./routes/erp.ts";
import { reconciliationRouter } from "./routes/reconciliation.ts";
import { onboardingRouter } from "./routes/onboarding.ts";
import { billingRouter } from "./routes/billing.ts";
import { vendorRouter } from "./routes/vendors.ts";
import { notificationsRouter } from "./routes/notifications.ts";
import { exceptionsRouter } from "./routes/exceptions.ts";
import { auditRouter } from "./routes/auditTrail.ts";
import { vendorPortalRouter } from "./routes/vendorPortal.ts";
import { userManagementRouter } from "./routes/userManagement.ts";
import { superAdminRouter } from "./routes/superAdmin.ts";
import { internalRouter } from "./routes/internal.ts";
import { apiKeysRouter } from "./routes/apiKeys.ts";
import {
  getEnterpriseDashboard,
  fetchEnterpriseInvoices,
  getEnterpriseExceptions,
  applyEnterpriseInvoiceAction,
  applyEnterpriseComparison,
  getEnterpriseSettings,
  updateEnterpriseRule,
  updateEnterpriseNotification,
  updateTenantErpSettings,
  getEnterpriseReports,
  getEnterpriseIngestion,
  getEnterpriseProcessing,
} from "./enterprise.ts";
import { generateInvoicesReportExcel } from "./services/excel.ts";
import { checkAndNotifySlaBreaches } from "./services/notifications.ts";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { logger } from "./services/logger.ts";
import crypto from "crypto";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors({
  origin: process.env.APP_URL ?? "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// 1. Security headers (Helmet)
app.use(helmet());

// 2. Request ID and Request Logging Middleware
app.use((req: any, res: any, next: any) => {
  req.id = crypto.randomUUID();
  const startTime = Date.now();

  res.on("finish", () => {
    logger.info({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startTime,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      workspaceMode: req.header("X-Workspace-Mode"),
      tenantSlug: req.header("X-Tenant-Slug")
    });
  });

  next();
});

// 3. Rate Limiters
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "too_many_requests",
    message: "Too many authentication attempts. Please try again in a minute."
  }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "too_many_requests",
    message: "Too many file upload requests. Please try again in a minute."
  }
});

app.use("/api/auth", authLimiter);
app.use("/api/invoices/upload", uploadLimiter);

type Permission =
  | "dashboard:view"
  | "exceptions:view"
  | "invoice:view"
  | "invoice:request-evidence"
  | "invoice:apply-correction"
  | "invoice:approve"
  | "invoice:assign"
  | "invoice:escalate"
  | "invoice:override-policy"
  | "reports:view"
  | "settings:view"
  | "settings:manage"
  | "audit:view"
  | "identity:manage"
  | "billing:manage"
  | "reconciliation:view"
  | "invoice:upload";

const actionPermission: Record<InvoiceActionType, Permission> = {
  approve: "invoice:approve",
  "request-evidence": "invoice:request-evidence",
  escalate: "invoice:escalate",
  "assign-reviewer": "invoice:assign",
};

function isEnterpriseRequest(request: Request) {
  return request.header("X-Workspace-Mode") === "enterprise";
}

function getEnterpriseSessionFromResponse(response: express.Response) {
  return response.locals.enterpriseSession as EnterpriseSessionRecord | undefined;
}

function requireEnterpriseAccess(permission?: Permission): RequestHandler {
  return async (request, response, next) => {
    if (!isEnterpriseRequest(request)) {
      next();
      return;
    }

    const sessionToken = request.header("X-Session-Token");
    const tenantSlug = request.header("X-Tenant-Slug");

    if (!sessionToken) {
      response.status(401).json({
        error: "session_required",
        message: "Enterprise API requests require a session token.",
      });
      return;
    }

    const session = await db.session.findUnique({
      where: { sessionToken },
      include: { user: true, tenant: true },
    });

    if (!session || new Date() > session.expiresAt) {
      response.status(401).json({
        error: "session_not_found",
        message: "The enterprise session was not found or has expired.",
      });
      return;
    }

    if (!tenantSlug || tenantSlug !== session.tenant.tenantSlug) {
      response.status(403).json({
        error: "tenant_forbidden",
        message: "The requested tenant does not match the authenticated session.",
      });
      return;
    }

    // Check billing plan lock (skip for billing routes themselves)
    // Use originalUrl because request.path is relative to the router mount prefix
    const isBillingRoute = request.originalUrl.includes("/api/billing") || request.originalUrl.includes("/api/health");
    if (!isBillingRoute) {
      const stripeRecord = await db.stripeCustomer.findUnique({ where: { tenantId: session.tenantId } });
      if (stripeRecord && (stripeRecord.status === "canceled" || stripeRecord.status === "locked")) {
        response.status(402).json({
          error: "subscription_required",
          message: "Your subscription has ended. Please renew to continue using InvoiceAudit Pro.",
        });
        return;
      }
    }

    const membership = await db.workspaceMembership.findUnique({
      where: { userId_tenantId: { userId: session.userId, tenantId: session.tenantId } },
    });

    const role = membership?.role ?? "AP Reviewer";
    const permissions = permissionsByRole[role as EnterpriseRole] || [];

    if (permission && !permissions.includes(permission)) {
      response.status(403).json({
        error: "permission_denied",
        message: `The ${role} role does not include ${permission}.`,
      });
      return;
    }

    response.locals.enterpriseSession = {
      ...session,
      displayName: session.user.displayName,
      role,
      permissions,
    };
    next();
  };
}

app.use("/api/auth", authRouter);
app.use("/api/auth/google", googleAuthRouter);
app.use("/api", onboardingRouter);  // /api/signup, /api/invites, /api/settings/workspace
// requireEnterpriseAccess() (no permission arg) validates the session and sets
// res.locals.enterpriseSession; non-enterprise requests (Stripe webhook, API-key
// intake, vendor-portal) pass through untouched because they lack X-Workspace-Mode.
app.use("/api/billing", requireEnterpriseAccess(), billingRouter);
app.use("/api/invoices", requireEnterpriseAccess(), ingestionRouter);
app.use("/api/vendors", requireEnterpriseAccess("settings:manage"), vendorRouter);
app.use("/api/exceptions", requireEnterpriseAccess("exceptions:view"), exceptionsRouter);
app.use("/api/notifications", requireEnterpriseAccess(), notificationsRouter);
app.use("/api/audit", requireEnterpriseAccess("audit:view"), auditRouter);
app.use("/api/vendor-portal", vendorPortalRouter);  // public — token is auth
app.use("/api/users", requireEnterpriseAccess("identity:manage"), userManagementRouter);
app.use("/api/admin", requireEnterpriseAccess(), superAdminRouter);
app.use("/api/internal", internalRouter);  // protected by X-Internal-Key
app.use("/api/erp", requireEnterpriseAccess(), erpRouter);
app.use("/api/api-keys", requireEnterpriseAccess(), apiKeysRouter);
app.use("/api/reconciliation", requireEnterpriseAccess("reconciliation:view"), reconciliationRouter);

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "invoice-audit-api", timestamp: new Date().toISOString() });
});

app.get("/api/dashboard", requireEnterpriseAccess("dashboard:view"), async (_request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (session) {
    response.json(await getEnterpriseDashboard(session.tenantId));
  } else {
    response.json(platformStore.getDashboard());
  }
});

app.get("/api/invoices", requireEnterpriseAccess("invoice:view"), async (_request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (session) {
    response.json({ items: await fetchEnterpriseInvoices(session.tenantId) });
  } else {
    response.json({ items: platformStore.listInvoices() });
  }
});

app.get("/api/invoices/:id", requireEnterpriseAccess("invoice:view"), async (request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  
  if (session) {
    const invoices = await fetchEnterpriseInvoices(session.tenantId);
    const invoice = invoices.find(inv => inv.id === request.params.id as string);
    if (!invoice) {
      response.status(404).json({ error: "not_found", message: `Invoice ${request.params.id} was not found.` });
    } else {
      response.json(invoice);
    }
    return;
  }

  const invoice = platformStore.getInvoice(request.params.id as string);

  if (!invoice) {
    response.status(404).json({
      error: "not_found",
      message: `Invoice ${request.params.id} was not found.`,
    });
    return;
  }

  response.json(invoice);
});

app.patch("/api/invoices/:id/actions", requireEnterpriseAccess(), async (request, response) => {
  const action = request.body?.action as InvoiceActionType | undefined;
  const session = getEnterpriseSessionFromResponse(response);
  const actor = session?.displayName ?? (request.body?.actor as string | undefined);
  const note = request.body?.note as string | undefined;

  if (!action) {
    response.status(400).json({
      error: "invalid_request",
      message: "Request body must include an action.",
    });
    return;
  }

  const requiredPermission = actionPermission[action];
  if (!requiredPermission) {
    response.status(400).json({
      error: "invalid_request",
      message: "The requested invoice action is not supported.",
    });
    return;
  }

  if (session && !session.permissions.includes(requiredPermission)) {
    response.status(403).json({
      error: "permission_denied",
      message: `The ${session.role} role does not include ${requiredPermission}.`,
    });
    return;
  }

  if (session) {
    const enterpriseResult = await applyEnterpriseInvoiceAction(session.tenantId, request.params.id as string, action, actor || "System", note);
    if (!enterpriseResult) {
      response.status(404).json({ error: "not_found", message: `Invoice ${request.params.id as string} was not found.` });
    } else {
      response.json(enterpriseResult);
    }
    return;
  }

  const result = platformStore.applyInvoiceAction(request.params.id as string, action, actor, note);

  if (!result) {
    response.status(404).json({
      error: "not_found",
      message: `Invoice ${request.params.id} was not found.`,
    });
    return;
  }

  response.json(result);
});

app.patch(
  "/api/invoices/:id/comparisons/:field/apply",
  requireEnterpriseAccess("invoice:apply-correction"),
  async (request, response) => {
    const session = getEnterpriseSessionFromResponse(response);
    if (session) {
      const enterpriseResult = await applyEnterpriseComparison(session.tenantId, request.params.id as string, decodeURIComponent(request.params.field as string), session.displayName || "System");
      if (!enterpriseResult) {
        response.status(404).json({ error: "not_found", message: "Comparison field or invoice not found." });
      } else {
        response.json(enterpriseResult);
      }
      return;
    }

    const result = platformStore.applyComparisonSuggestion(
      request.params.id as string,
      decodeURIComponent(request.params.field as string),
      (request.body?.actor as string | undefined) || "System",
    );

    if (!result) {
      response.status(404).json({
        error: "not_found",
        message: `Comparison field ${request.params.field} was not found for invoice ${request.params.id}.`,
      });
      return;
    }

    response.json(result);
  },
);

app.get("/api/exceptions", requireEnterpriseAccess("exceptions:view"), async (request, response) => {
  const selectedType =
    typeof request.query.type === "string" ? request.query.type : "All exceptions";

  const session = getEnterpriseSessionFromResponse(response);
  if (session) {
    response.json(await getEnterpriseExceptions(session.tenantId, selectedType));
  } else {
    response.json(platformStore.getExceptions(selectedType));
  }
});

app.get("/api/ingestion", requireEnterpriseAccess("invoice:view"), async (_request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (session) {
    response.json(await getEnterpriseIngestion(session.tenantId));
  } else {
    response.json(platformStore.getIngestion());
  }
});

app.get("/api/processing", requireEnterpriseAccess("invoice:view"), async (_request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (session) {
    response.json(await getEnterpriseProcessing(session.tenantId));
  } else {
    response.json(platformStore.getProcessing());
  }
});

app.get("/api/reports", requireEnterpriseAccess("reports:view"), async (_request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (session) {
    response.json(await getEnterpriseReports(session.tenantId));
  } else {
    response.json(platformStore.getReports());
  }
});

app.get("/api/reports/export", requireEnterpriseAccess("reports:view"), async (request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  let invoices;

  if (session) {
    const whereClause: any = { tenantId: session.tenantId };
    
    if (request.query.startDate || request.query.endDate) {
      whereClause.createdAt = {};
      if (request.query.startDate) {
        whereClause.createdAt.gte = new Date(request.query.startDate as string);
      }
      if (request.query.endDate) {
        whereClause.createdAt.lte = new Date(request.query.endDate as string);
      }
    }

    invoices = await db.invoice.findMany({
      where: whereClause,
      include: { anomalyTypes: true }
    });
  } else {
    invoices = platformStore.listInvoices();
  }

  const buffer = await generateInvoicesReportExcel(invoices);
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("Content-Disposition", "attachment; filename=invoice-audit-report.xlsx");
  response.send(buffer);
});

app.get("/api/settings", requireEnterpriseAccess("settings:view"), async (request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (session) {
    response.json(await getEnterpriseSettings(session.tenantId));
  } else {
    response.json(platformStore.getSettings());
  }
});

app.patch(
  "/api/settings/rules/:name",
  requireEnterpriseAccess("settings:manage"),
  async (request, response) => {
    const enabled = Boolean(request.body?.enabled);
    const session = getEnterpriseSessionFromResponse(response);
    
    if (session) {
      try {
        const updated = await updateEnterpriseRule(session.tenantId, decodeURIComponent(request.params.name as string), enabled);
        response.json(updated);
      } catch (error) {
        response.status(404).json({ error: "not_found", message: `Rule ${request.params.name as string} was not found.` });
      }
      return;
    }

    const updated = platformStore.updateRule(decodeURIComponent(request.params.name as string), enabled);

    if (!updated) {
      response.status(404).json({
        error: "not_found",
        message: `Rule ${request.params.name} was not found.`,
      });
      return;
    }

    response.json(updated);
  },
);

app.patch(
  "/api/settings/notifications/:name",
  requireEnterpriseAccess("settings:manage"),
  async (request, response) => {
    const enabled = Boolean(request.body?.enabled);
    const session = getEnterpriseSessionFromResponse(response);

    if (session) {
      try {
        const updated = await updateEnterpriseNotification(session.tenantId, decodeURIComponent(request.params.name as string), enabled);
        response.json(updated);
      } catch (error) {
        response.status(404).json({ error: "not_found", message: `Notification ${request.params.name as string} was not found.` });
      }
      return;
    }

    const updated = platformStore.updateNotification(
      decodeURIComponent(request.params.name as string),
      enabled,
    );

    if (!updated) {
      response.status(404).json({
        error: "not_found",
        message: `Notification ${request.params.name} was not found.`,
      });
      return;
    }

    response.json(updated);
  },
);

app.patch(
  "/api/settings/erp",
  requireEnterpriseAccess("settings:manage"),
  async (request, response) => {
    const session = getEnterpriseSessionFromResponse(response);
    if (!session) {
      response.status(400).json({ error: "invalid_request", message: "Only available in enterprise mode." });
      return;
    }

    const { erpWebhookUrl, erpApiKey } = request.body;
    try {
      const result = await updateTenantErpSettings(session.tenantId, erpWebhookUrl, erpApiKey);
      response.json(result);
    } catch (error) {
      response.status(500).json({ error: "server_error", message: "Failed to update ERP settings." });
    }
  }
);

app.post(
  "/api/settings/publish",
  requireEnterpriseAccess("settings:manage"),
  (request, response) => {
    const session = getEnterpriseSessionFromResponse(response);
    if (session) {
      response.json({ success: true, publishedAt: new Date().toISOString() });
      return;
    }
    response.json(platformStore.publishRuleset());
  },
);

// ─── Evidence Attachments ────────────────────────────────────────────────────

import multerLib from "multer";
const evidenceUpload = multerLib({ storage: multerLib.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post(
  "/api/invoices/:id/evidence",
  requireEnterpriseAccess("invoice:request-evidence"),
  (req, res, next) => { evidenceUpload.array("files", 5)(req, res, next); },
  async (request, response) => {
    const session = getEnterpriseSessionFromResponse(response);
    if (!session) { response.status(401).json({ error: "unauthorized" }); return; }

    const files = (request.files as any[]) ?? [];
    if (files.length === 0) { response.status(400).json({ error: "no_files" }); return; }

    const invoice = await db.invoice.findFirst({
      where: { id: request.params.id, tenantId: session.tenantId },
    });
    if (!invoice) { response.status(404).json({ error: "not_found" }); return; }

    const { uploadEvidenceFile, getSignedUrl } = await import("./services/storage.ts");
    const attached = [];
    for (const file of files) {
      const { storagePath } = await uploadEvidenceFile(session.tenantId, invoice.id, file.buffer, file.mimetype, file.originalname);
      const att = await db.evidenceAttachment.create({
        data: { invoiceId: invoice.id, fileName: file.originalname, storagePath, mimeType: file.mimetype, sizeBytes: file.size, uploadedBy: session.displayName ?? "System" },
      });
      const url = await getSignedUrl(storagePath, 3600);
      attached.push({ id: att.id, fileName: att.fileName, url });
    }
    response.json({ attached });
  },
);

app.get("/api/invoices/:id/evidence", requireEnterpriseAccess("invoice:view"), async (request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (!session) { response.status(401).json({ error: "unauthorized" }); return; }

  const attachments = await db.evidenceAttachment.findMany({
    where: { invoiceId: request.params.id, invoice: { tenantId: session.tenantId } },
    orderBy: { uploadedAt: "asc" },
  });

  const { getSignedUrl } = await import("./services/storage.ts");
  const withUrls = await Promise.all(attachments.map(async (a) => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    uploadedBy: a.uploadedBy,
    uploadedAt: a.uploadedAt,
    fromVendorPortal: a.fromVendorPortal,
    url: await getSignedUrl(a.storagePath, 3600),
  })));

  response.json(withUrls);
});

// POST /api/invoices/:id/request-evidence — send vendor portal link + email
app.post("/api/invoices/:id/request-evidence-link", requireEnterpriseAccess("invoice:request-evidence"), async (request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (!session) { response.status(401).json({ error: "unauthorized" }); return; }

  const invoice = await db.invoice.findFirst({ where: { id: request.params.id, tenantId: session.tenantId } });
  if (!invoice) { response.status(404).json({ error: "not_found" }); return; }

  const vendor = await db.vendorMaster.findFirst({
    where: { tenantId: session.tenantId, vendorName: { contains: invoice.vendorName, mode: "insensitive" } },
    select: { vendorEmail: true },
  });

  const token = (await import("crypto")).default.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await db.verificationToken.create({
    data: { email: `vendor-portal:${invoice.id}:${session.tenantId}`, token, expiresAt },
  });

  const portalUrl = `${process.env.APP_URL}/vendor-portal/${token}`;

  const note = request.body?.note ?? "Please provide supporting documentation to clear the validation anomalies.";

  if (vendor?.vendorEmail) {
    const { sendEvidenceRequestEmail } = await import("./services/email.ts");
    await sendEvidenceRequestEmail(vendor.vendorEmail, invoice.invoiceNumber, note, portalUrl).catch(console.error);
  }

  const { notifyEvidenceRequested } = await import("./services/notifications.ts");
  await notifyEvidenceRequested(invoice.id, vendor?.vendorEmail ?? null, session.tenantId, invoice.invoiceNumber).catch(console.error);

  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId }, select: { organizationName: true } });

  response.json({
    portalUrl,
    expiresAt: expiresAt.toISOString(),
    vendorEmail: vendor?.vendorEmail ?? null,
    organizationName: tenant?.organizationName ?? null,
  });
});

// DELETE /api/account — GDPR tenant deletion
app.delete("/api/account", requireEnterpriseAccess("settings:manage"), async (_request, response) => {
  const session = getEnterpriseSessionFromResponse(response);
  if (!session) { response.status(401).json({ error: "unauthorized" }); return; }

  const { deleteAllTenantFiles } = await import("./services/storage.ts");
  await deleteAllTenantFiles(session.tenantId);
  await db.tenant.delete({ where: { id: session.tenantId } });

  response.clearCookie("ia_session");
  response.json({ success: true, message: "All data has been permanently deleted." });
});

app.use((_request, response) => {
  response.status(404).json({
    error: "not_found",
    message: "No API route matched the request.",
  });
});

// 4. Sentry + Global Error Handler
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err: any, req: any, res: any, next: any) => {
  const requestId = req.id || "N/A";
  logger.error({
    message: "Unhandled Internal Server Error",
    requestId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl || req.url
  });

  res.status(500).json({
    error: "internal_server_error",
    message: "An unexpected error occurred. Please contact system administrator.",
    requestId
  });
});

app.listen(port, () => {
  console.log(`Invoice.Audit API listening on http://localhost:${port}`);

  // SLA breach scanner — runs every 5 minutes in-process
  // Production cron should also hit POST /api/internal/check-slas via Railway cron
  const SLA_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const notified = await checkAndNotifySlaBreaches();
      if (notified > 0) {
        logger.info(`[SLA scan] Notified ${notified} breach(es)`);
      }
    } catch (err) {
      logger.error(`[SLA scan] Scanner failed: ${(err as Error).message}`);
    }
  }, SLA_INTERVAL_MS);
});
