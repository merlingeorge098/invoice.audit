import { db } from "./db.ts";
import { type InvoiceRecord } from "../src/data/platformData.ts";
import { processingStages, exceptionTypeOptions } from "../src/data/platformData.ts";
import { AuditTrailService } from "./services/auditTrailService.ts";
import { EvidenceService } from "./services/evidenceService.ts";
import { EncryptionService } from "./services/encryptionService.ts";

function mapPrismaInvoiceToRecord(prismaInvoice: any): InvoiceRecord {
  return {
    ...prismaInvoice,
    anomalyTypes: prismaInvoice.anomalyTypes.map((a: any) => a.type),
  };
}

export async function fetchEnterpriseInvoices(tenantId: string): Promise<InvoiceRecord[]> {
  const records = await db.invoice.findMany({
    where: { tenantId },
    include: {
      anomalyTypes: true,
      validationChecks: true,
      flags: true,
      structuredFields: true,
      lineItems: true,
      fieldComparisons: true,
      auditTrail: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return records.map(mapPrismaInvoiceToRecord);
}

export async function getEnterpriseDashboard(tenantId: string) {
  const invoices = await fetchEnterpriseInvoices(tenantId);

  const pendingReview = invoices.filter((inv) => inv.status === "pending-review").length;
  const autoApproved = invoices.filter((inv) => inv.status === "auto-approved").length;
  const needsEvidence = invoices.filter((inv) => inv.status === "needs-evidence").length;
  const blockedOrEscalated = invoices.filter(
    (inv) => inv.status === "blocked" || inv.status === "escalated"
  ).length;
  const highRiskActive = invoices.filter(
    (inv) => inv.riskLevel === "high" && inv.status !== "auto-approved"
  ).length;
  const duplicateActive = invoices.filter(
    (inv) =>
      inv.status !== "auto-approved" &&
      inv.anomalyTypes.some((a) => a.toLowerCase().includes("duplicate"))
  ).length;
  const complianceActive = invoices.filter(
    (inv) =>
      inv.status !== "auto-approved" &&
      inv.validationChecks.some((check) => check.status !== "pass")
  ).length;

  const totalInvoices = invoices.length;
  const activeReviewQueue = invoices.filter((inv) => inv.status !== "auto-approved");

  // Compute trend from actual invoice createdAt timestamps (last 6 days)
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayStats: Record<string, { processed: number; flagged: number; duplicates: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayStats[dayNames[d.getDay()]] = { processed: 0, flagged: 0, duplicates: 0 };
  }
  invoices.forEach((inv) => {
    const day = dayNames[new Date((inv as any).createdAt).getDay()];
    if (dayStats[day]) {
      dayStats[day].processed++;
      if (inv.riskScore > 30) dayStats[day].flagged++;
      if (inv.anomalyTypes.some((a) => a.toLowerCase().includes("duplicate"))) {
        dayStats[day].duplicates++;
      }
    }
  });
  const trend = Object.entries(dayStats).map(([day, stats]) => ({
    day,
    processed: stats.processed,
    flagged: stats.flagged,
    duplicates: stats.duplicates,
  }));

  return {
    metrics: [
      {
        label: "Invoices processed",
        value: totalInvoices.toLocaleString("en-IN"),
        hint: `${autoApproved} invoices are straight-through approved this cycle`,
        tone: "info" as const,
      },
      {
        label: "Pending reviews",
        value: String(pendingReview),
        hint: `${pendingReview} invoices are actively waiting in reviewer queue`,
        tone: "warning" as const,
      },
      {
        label: "High-risk invoices",
        value: String(highRiskActive),
        hint: `${highRiskActive} high-risk invoices remain unresolved`,
        tone: "danger" as const,
      },
      {
        label: "Duplicate alerts",
        value: String(duplicateActive),
        hint: `${duplicateActive} duplicate-prone invoices are still open`,
        tone: "warning" as const,
      },
      {
        label: "Compliance issues",
        value: String(complianceActive),
        hint: `${complianceActive} active invoices still have validation warnings`,
        tone: "danger" as const,
      },
      {
        label: "Auto-approval rate",
        value: totalInvoices > 0 ? `${Math.round((autoApproved / totalInvoices) * 100)}%` : "0%",
        hint: `${autoApproved} of ${totalInvoices} invoices passed straight-through`,
        tone: "info" as const,
      },
    ],
    trend,
    workflowLanes: [
      {
        label: "Straight-through",
        count: autoApproved,
        description: "Low-risk or approved invoices routed out of manual review.",
      },
      {
        label: "Reviewer queue",
        count: pendingReview,
        description: "Needs finance or operations validation.",
      },
      {
        label: "Evidence requests",
        count: needsEvidence,
        description: "Waiting for supporting documents or vendor response.",
      },
      {
        label: "Blocked or escalated",
        count: blockedOrEscalated,
        description: "Duplicate, fraud, or policy exceptions.",
      },
    ],
    reviewerQueue: activeReviewQueue,
    insights: activeReviewQueue.slice(0, 4),
  };
}

export async function getEnterpriseExceptions(tenantId: string, selectedType: string = "All exceptions") {
  const invoices = await fetchEnterpriseInvoices(tenantId);
  
  const filtered = invoices.filter((invoice) => {
    if (invoice.status === "auto-approved") return false;
    return selectedType === "All exceptions" ? true : invoice.anomalyTypes.includes(selectedType);
  });

  return {
    filterOptions: exceptionTypeOptions,
    selectedType,
    summary: {
      highestSeverityCount: filtered.filter((inv) =>
        inv.flags.some((flag) => flag.severity === "high")
      ).length,
      slaBreaches: filtered.filter((inv) => inv.agingHours > 24).length,
      evidenceRequests: filtered.filter((inv) => inv.status === "needs-evidence").length,
    },
    invoices: filtered,
  };
}

export async function applyEnterpriseInvoiceAction(tenantId: string, invoiceId: string, action: string, actor: string, note?: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lineItems: true,
      anomalyTypes: true,
      validationChecks: true,
      flags: true
    }
  });

  if (!invoice || invoice.tenantId !== tenantId) {
    return null;
  }

  let status = invoice.status;
  let assignedReviewer = invoice.assignedReviewer;
  let agingHours = invoice.agingHours;
  let riskLevel = invoice.riskLevel;
  let riskScore = invoice.riskScore;
  let summary = invoice.summary;
  let recommendation = invoice.workflowRecommendation;

  await db.$transaction(async (tx) => {
    if (action === "approve") {
      status = "auto-approved";
      assignedReviewer = actor;
      agingHours = 0;
      riskLevel = "low";
      riskScore = 10;
      summary = "Invoice cleared by reviewer and released from manual controls after final exception verification.";
      recommendation = "Approved for payment release in the next scheduled payment batch.";

      await tx.invoiceAnomaly.deleteMany({ where: { invoiceId } });
      await tx.invoiceAnomaly.create({ data: { invoiceId, type: "Reviewer approved" } });
      await tx.invoiceFlag.deleteMany({ where: { invoiceId } });
      await tx.validationCheck.updateMany({
        where: { invoiceId },
        data: { status: "pass" }
      });

      const requiredChecks = ["Vendor master", "PO match", "Duplicate detection", "Tax compliance", "Approval policy"];
      for (const label of requiredChecks) {
        const check = invoice.validationChecks.find(c => c.label === label);
        if (check) {
          await tx.validationCheck.update({
            where: { id: check.id },
            data: { status: "pass", detail: `Resolved during final approval by ${actor}.${note ? ` ${note}` : ""}`.trim() }
          });
        } else {
          await tx.validationCheck.create({
            data: { invoiceId, label, status: "pass", detail: `Manual approval completed by ${actor}.` }
          });
        }
      }

      await tx.lineItem.updateMany({
        where: { invoiceId },
        data: { status: "pass" }
      });

    } else if (action === "request-evidence") {
      status = "needs-evidence";
      assignedReviewer = actor;
      riskLevel = "medium";
      riskScore = Math.max(riskScore, 50);
      summary = "Invoice is waiting for supporting documentation before payment can continue through the workflow.";
      recommendation = "Hold the invoice in evidence collection until the vendor submits the missing support.";

      const hasMissingEvidence = invoice.anomalyTypes.some(a => a.type === "Missing evidence");
      if (!hasMissingEvidence) {
        await tx.invoiceAnomaly.create({ data: { invoiceId, type: "Missing evidence" } });
      }

      const hasFlag = invoice.flags.some(f => f.title === "Supporting evidence pending");
      if (!hasFlag) {
        await tx.invoiceFlag.create({
          data: {
            invoiceId,
            title: "Supporting evidence pending",
            severity: "medium",
            detail: note || "Reviewer requested supporting documentation before approval can proceed."
          }
        });
      }

      const evidenceCheck = invoice.validationChecks.find(c => c.label === "Evidence pack" || c.label === "Evidence");
      if (evidenceCheck) {
        await tx.validationCheck.update({
          where: { id: evidenceCheck.id },
          data: { status: "warning", detail: note || "Supporting evidence is still pending from the vendor." }
        });
      } else {
        await tx.validationCheck.create({
          data: {
            invoiceId,
            label: "Evidence pack",
            status: "warning",
            detail: note || "Supporting evidence is still pending from the vendor."
          }
        });
      }

      try {
        const { sendEvidenceRequestEmail } = await import("./services/email.ts");
        const vendorEmail = `billing@${invoice.vendorName.toLowerCase().replace(/\s+/g, '')}.com`;
        const details = note || "Please provide supporting documentation to clear the validation anomalies.";
        await sendEvidenceRequestEmail(vendorEmail, invoice.invoiceNumber, details);
      } catch (e) {
        console.error("Resend Email integration skipped/failed:", e);
      }

    } else if (action === "escalate") {
      status = "escalated";
      assignedReviewer = "Controller Queue";
      riskLevel = "high";
      riskScore = Math.max(riskScore, 80);
      summary = "Invoice was escalated for a higher-control review because it still needs an override or policy decision.";
      recommendation = "Keep the invoice in the controller queue until the escalation owner records a final decision.";

      const hasEscalation = invoice.anomalyTypes.some(a => a.type === "Controller escalation");
      if (!hasEscalation) {
        await tx.invoiceAnomaly.create({ data: { invoiceId, type: "Controller escalation" } });
      }

      const hasFlag = invoice.flags.some(f => f.title === "Controller escalation");
      if (!hasFlag) {
        await tx.invoiceFlag.create({
          data: {
            invoiceId,
            title: "Controller escalation",
            severity: "high",
            detail: note || "Manual escalation recorded for additional controls review."
          }
        });
      }

      const policyCheck = invoice.validationChecks.find(c => c.label === "Approval policy");
      if (policyCheck) {
        await tx.validationCheck.update({
          where: { id: policyCheck.id },
          data: { status: "fail", detail: note || "Invoice requires controller review before it can be released." }
        });
      } else {
        await tx.validationCheck.create({
          data: {
            invoiceId,
            label: "Approval policy",
            status: "fail",
            detail: note || "Invoice requires controller review before it can be released."
          }
        });
      }

    } else if (action === "assign-reviewer") {
      status = "pending-review";
      assignedReviewer = actor;
      summary = "Invoice is in active manual review with a named owner and is waiting for the next reviewer action.";
      recommendation = `Continue review in ${actor}'s queue until the exception is resolved.`;

      const policyCheck = invoice.validationChecks.find(c => c.label === "Approval policy");
      if (policyCheck) {
        await tx.validationCheck.update({
          where: { id: policyCheck.id },
          data: { status: "warning", detail: `Assigned to ${actor} by System for manual review.` }
        });
      }
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status,
        assignedReviewer,
        agingHours,
        riskLevel,
        riskScore,
        summary,
        workflowRecommendation: recommendation
      }
    });

    await AuditTrailService.logEvent(tx, invoiceId, actor, `Action: ${action}`, note || `Reviewer action '${action}' applied.`);
  });

  if (status === "auto-approved" || status === "blocked") {
    await EvidenceService.compileEvidencePackage(invoiceId);
  }

  const records = await fetchEnterpriseInvoices(tenantId);
  const updatedInvoice = records.find(r => r.id === invoiceId);

  return {
    success: true,
    message: `Invoice action applied`,
    invoice: updatedInvoice,
  };
}

export async function applyEnterpriseComparison(tenantId: string, invoiceId: string, field: string, actor: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { fieldComparisons: true }
  });

  if (!invoice || invoice.tenantId !== tenantId) {
    return null;
  }

  const comparison = invoice.fieldComparisons.find(c => c.field === field);
  if (!comparison) return null;

  const fieldNormalized = field.toLowerCase().trim().replace(/[\s_-]+/g, "");

  let updateData: any = {};
  let shouldUpdateInvoice = false;

  if (fieldNormalized === "invoicenumber") {
    updateData.invoiceNumber = comparison.suggestion;
    shouldUpdateInvoice = true;
  } else if (fieldNormalized === "vendor" || fieldNormalized === "vendorname") {
    updateData.vendorName = comparison.suggestion;
    shouldUpdateInvoice = true;
  } else if (fieldNormalized === "vendorcode") {
    updateData.vendorCode = comparison.suggestion;
    shouldUpdateInvoice = true;
  } else if (fieldNormalized === "entity") {
    updateData.entity = comparison.suggestion;
    shouldUpdateInvoice = true;
  } else if (fieldNormalized === "amount" || fieldNormalized === "totalamount" || fieldNormalized === "total" || fieldNormalized === "invoiceamount") {
    const parsedAmount = parseFloat(comparison.suggestion.replace(/[^\d.-]/g, ""));
    if (!isNaN(parsedAmount)) {
      updateData.amount = parsedAmount;
      shouldUpdateInvoice = true;
    }
  } else if (fieldNormalized === "invoicedate") {
    updateData.invoiceDate = comparison.suggestion;
    shouldUpdateInvoice = true;
  } else if (fieldNormalized === "duedate") {
    updateData.dueDate = comparison.suggestion;
    shouldUpdateInvoice = true;
  } else if (fieldNormalized === "ponumber" || fieldNormalized === "purchaseorder" || fieldNormalized === "po") {
    updateData.poNumber = comparison.suggestion;
    shouldUpdateInvoice = true;
  } else if (fieldNormalized === "grnnumber" || fieldNormalized === "grn") {
    updateData.grnNumber = comparison.suggestion;
    shouldUpdateInvoice = true;
  }

  await db.$transaction(async (tx) => {
    await tx.fieldComparison.update({
      where: { id: comparison.id },
      data: {
        extracted: comparison.suggestion
      }
    });

    if (shouldUpdateInvoice) {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: updateData
      });
    }

    await AuditTrailService.logEvent(tx, invoiceId, actor, "Applied comparison correction", `Accepted suggested value for field ${field}.`);
  });

  const records = await fetchEnterpriseInvoices(tenantId);
  return {
    success: true,
    invoice: records.find(r => r.id === invoiceId),
  };
}

export async function getEnterpriseSettings(tenantId: string) {
  const rules = await db.ruleSetting.findMany({ where: { tenantId } });
  const notifications = await db.notificationSetting.findMany({ where: { tenantId } });

  // Import static catalogs for non-tenant specific data
  const { approvalMatrix, integrationCatalog, userRoles } = await import("../src/data/platformData.ts");

  return {
    approvalMatrix,
    integrations: integrationCatalog,
    roles: userRoles,
    rules: rules.map((r) => ({
      name: r.name,
      description: r.description,
      enabled: r.enabled,
      owner: r.owner,
    })),
    notifications: notifications.map((n) => ({
      name: n.name,
      enabled: n.enabled,
    })),
  };
}

export async function updateEnterpriseRule(tenantId: string, ruleName: string, enabled: boolean) {
  const updated = await db.ruleSetting.update({
    where: {
      tenantId_name: { tenantId, name: ruleName }
    },
    data: { enabled }
  });

  let targetInvoice = await db.invoice.findFirst({ where: { tenantId } });
  if (!targetInvoice) {
    targetInvoice = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "SYSTEM-SETTINGS",
        vendorName: "System Settings",
        vendorCode: "SYS",
        entity: "System",
        amount: 0,
        invoiceDate: "",
        dueDate: "",
        poNumber: "",
        grnNumber: "",
        status: "system",
        riskLevel: "low",
        riskScore: 0,
        confidence: 100,
        duplicateLikelihood: 0,
        sourceChannel: "System",
        assignedReviewer: "System",
        agingHours: 0,
        summary: "System placeholder for configuration audit logs.",
        workflowRecommendation: ""
      }
    });
  }

  await AuditTrailService.logEvent(
    db,
    targetInvoice.id,
    "Admin",
    "Update Rule",
    `Rule '${ruleName}' enabled set to ${enabled}.`
  );

  return {
    name: updated.name,
    description: updated.description,
    enabled: updated.enabled,
    owner: updated.owner,
  };
}

export async function updateEnterpriseNotification(tenantId: string, notificationName: string, enabled: boolean) {
  const updated = await db.notificationSetting.update({
    where: {
      tenantId_name: { tenantId, name: notificationName }
    },
    data: { enabled }
  });

  let targetInvoice = await db.invoice.findFirst({ where: { tenantId } });
  if (!targetInvoice) {
    targetInvoice = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "SYSTEM-SETTINGS",
        vendorName: "System Settings",
        vendorCode: "SYS",
        entity: "System",
        amount: 0,
        invoiceDate: "",
        dueDate: "",
        poNumber: "",
        grnNumber: "",
        status: "system",
        riskLevel: "low",
        riskScore: 0,
        confidence: 100,
        duplicateLikelihood: 0,
        sourceChannel: "System",
        assignedReviewer: "System",
        agingHours: 0,
        summary: "System placeholder for configuration audit logs.",
        workflowRecommendation: ""
      }
    });
  }

  await AuditTrailService.logEvent(
    db,
    targetInvoice.id,
    "Admin",
    "Update Notification",
    `Notification '${notificationName}' enabled set to ${enabled}.`
  );

  return {
    name: updated.name,
    enabled: updated.enabled,
  };
}

export async function updateTenantErpSettings(tenantId: string, erpWebhookUrl: string, erpApiKey: string) {
  const encryptedApiKey = erpApiKey ? EncryptionService.encrypt(erpApiKey) : null;

  const tenant = await db.tenant.update({
    where: { id: tenantId },
    data: { erpWebhookUrl, erpApiKey: encryptedApiKey }
  });

  let targetInvoice = await db.invoice.findFirst({ where: { tenantId } });
  if (!targetInvoice) {
    targetInvoice = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "SYSTEM-SETTINGS",
        vendorName: "System Settings",
        vendorCode: "SYS",
        entity: "System",
        amount: 0,
        invoiceDate: "",
        dueDate: "",
        poNumber: "",
        grnNumber: "",
        status: "system",
        riskLevel: "low",
        riskScore: 0,
        confidence: 100,
        duplicateLikelihood: 0,
        sourceChannel: "System",
        assignedReviewer: "System",
        agingHours: 0,
        summary: "System placeholder for configuration audit logs.",
        workflowRecommendation: ""
      }
    });
  }

  await AuditTrailService.logEvent(
    db,
    targetInvoice.id,
    "Admin",
    "Update ERP Settings",
    `ERP webhook set to ${erpWebhookUrl}. Credentials amended.`
  );

  return {
    erpWebhookUrl: tenant.erpWebhookUrl,
    erpApiKey: tenant.erpApiKey ? "***" : null
  };
}

export async function getEnterpriseReports(tenantId: string) {
  const invoices = await db.invoice.findMany({
    where: { tenantId },
    include: {
      anomalyTypes: true,
      validationChecks: true,
      flags: true,
    },
  });

  const exceptionCounts = {
    Tax: 0,
    Duplicate: 0,
    Evidence: 0,
    "Low confidence": 0,
  };

  invoices.forEach((inv) => {
    inv.anomalyTypes.forEach((anomaly) => {
      const type = anomaly.type.toLowerCase();
      if (type.includes("tax")) exceptionCounts.Tax++;
      else if (type.includes("duplicate")) exceptionCounts.Duplicate++;
      else if (type.includes("evidence") || type.includes("pod")) exceptionCounts.Evidence++;
      else if (type.includes("confidence")) exceptionCounts["Low confidence"]++;
    });
  });

  const exceptionMix = [
    { name: "Tax", value: exceptionCounts.Tax, color: "#0f766e" },
    { name: "Duplicate", value: exceptionCounts.Duplicate, color: "#ef4444" },
    { name: "Evidence", value: exceptionCounts.Evidence, color: "#f59e0b" },
    { name: "Low confidence", value: exceptionCounts["Low confidence"], color: "#0284c7" },
  ];

  const vendorStats: Record<string, { total: number; sumRisk: number; issues: Set<string> }> = {};
  invoices.forEach((inv) => {
    if (!vendorStats[inv.vendorName]) {
      vendorStats[inv.vendorName] = { total: 0, sumRisk: 0, issues: new Set() };
    }
    const stats = vendorStats[inv.vendorName];
    stats.total++;
    stats.sumRisk += inv.riskScore;
    inv.anomalyTypes.forEach((a) => stats.issues.add(a.type));
  });

  const vendorRiskLeaderboard = Object.entries(vendorStats)
    .map(([vendor, stats]) => ({
      vendor,
      riskIndex: Math.round(stats.sumRisk / stats.total),
      issue: Array.from(stats.issues).slice(0, 2).join(", ") || "No active issues",
    }))
    .sort((a, b) => b.riskIndex - a.riskIndex)
    .slice(0, 4);

  const entityStats: Record<string, { compliant: number; needsReview: number; blocked: number }> = {};
  invoices.forEach((inv) => {
    if (!entityStats[inv.entity]) {
      entityStats[inv.entity] = { compliant: 0, needsReview: 0, blocked: 0 };
    }
    const stats = entityStats[inv.entity];
    if (inv.status === "blocked" || inv.status === "escalated") {
      stats.blocked++;
    } else if (inv.riskScore > 50) {
      stats.needsReview++;
    } else {
      stats.compliant++;
    }
  });

  const complianceSummary = Object.entries(entityStats).map(([entity, stats]) => {
    const total = stats.compliant + stats.needsReview + stats.blocked || 1;
    return {
      entity,
      compliant: Math.round((stats.compliant / total) * 100),
      needsReview: Math.round((stats.needsReview / total) * 100),
      blocked: Math.round((stats.blocked / total) * 100),
    };
  });

  const dayStats: Record<string, { processed: number; flagged: number; duplicates: number }> = {
    Mon: { processed: 0, flagged: 0, duplicates: 0 },
    Tue: { processed: 0, flagged: 0, duplicates: 0 },
    Wed: { processed: 0, flagged: 0, duplicates: 0 },
    Thu: { processed: 0, flagged: 0, duplicates: 0 },
    Fri: { processed: 0, flagged: 0, duplicates: 0 },
    Sat: { processed: 0, flagged: 0, duplicates: 0 },
  };

  invoices.forEach((inv) => {
    const date = new Date(inv.createdAt);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[date.getDay()];
    if (dayStats[dayName]) {
      dayStats[dayName].processed++;
      if (inv.riskScore > 30) dayStats[dayName].flagged++;
      if (inv.anomalyTypes.some(a => a.type.toLowerCase().includes("duplicate"))) {
        dayStats[dayName].duplicates++;
      }
    }
  });

  const trend = Object.entries(dayStats).map(([day, stats]) => ({
    day,
    processed: stats.processed,
    flagged: stats.flagged,
    duplicates: stats.duplicates,
  }));

  return {
    trend,
    vendorRiskLeaderboard,
    complianceSummary,
    exceptionMix,
  };
}

export async function getEnterpriseIngestion(tenantId: string) {
  const { ingestionChannels } = await import("../src/data/platformData.ts");
  return {
    channels: ingestionChannels,
  };
}

export async function getEnterpriseProcessing(tenantId: string) {
  const processingInvoices = await db.invoice.findMany({
    where: { tenantId, status: "processing" },
  });

  return {
    batchId: `BATCH-${tenantId.substring(0, 8).toUpperCase()}`,
    eta: processingInvoices.length > 0 ? "Under 1 minute" : "No active jobs",
    stages: processingStages,
  };
}
