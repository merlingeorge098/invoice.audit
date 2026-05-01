import { randomUUID } from "node:crypto";
import {
  approvalMatrix,
  complianceSummary,
  dashboardMetrics,
  dashboardTrend,
  exceptionTypeOptions,
  ingestionChannels,
  integrationCatalog,
  invoiceRecords as seedInvoiceRecords,
  notificationSettings as seedNotificationSettings,
  processingStages,
  rulesCatalog as seedRulesCatalog,
  userRoles,
  vendorRiskLeaderboard,
  workflowLanes,
  type InvoiceRecord,
} from "../src/data/platformData.ts";
import { tenantPaths } from "../src/lib/workspace.ts";

export type EnterpriseRole =
  | "AP Reviewer"
  | "Finance Manager"
  | "Controller"
  | "Auditor"
  | "Admin";

type IdentityProviderType = "entra-id" | "okta" | "google-workspace";
type IdentityProtocol = "OIDC" | "SAML";

interface OrganizationRecord {
  id: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
  tenantSlug: string;
  domains: string[];
  provider: {
    providerId: IdentityProviderType;
    providerLabel: string;
    protocol: IdentityProtocol;
    loginLabel: string;
    mfa: "idp-enforced";
  };
}

interface PendingAuthRequest {
  authRequestId: string;
  email: string;
  organizationId: string;
  requestedAt: string;
  expiresAt: string;
}

interface ProvisionedUser {
  userId: string;
  email: string;
  displayName: string;
  role: EnterpriseRole;
  organizationId: string;
}

export interface EnterpriseSessionRecord {
  sessionToken: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
  tenantSlug: string;
  email: string;
  displayName: string;
  role: EnterpriseRole;
  permissions: string[];
  provider: OrganizationRecord["provider"];
  assurance: {
    mfa: "idp-enforced";
    sessionType: "mock-enterprise";
  };
  createdAt: string;
  expiresAt: string;
  targetPath: string;
}

type RuleSetting = (typeof seedRulesCatalog)[number];
type NotificationSetting = (typeof seedNotificationSettings)[number];

const organizations: OrganizationRecord[] = [
  {
    id: "org-acme",
    organizationName: "Acme Manufacturing",
    workspaceId: "workspace-acme-primary",
    workspaceName: "Acme Finance Controls",
    tenantSlug: "acme",
    domains: ["acme.com"],
    provider: {
      providerId: "entra-id",
      providerLabel: "Microsoft Entra ID",
      protocol: "OIDC",
      loginLabel: "Continue with Microsoft Entra ID",
      mfa: "idp-enforced",
    },
  },
  {
    id: "org-northwind",
    organizationName: "Northwind Trading",
    workspaceId: "workspace-northwind-primary",
    workspaceName: "Northwind AP Assurance",
    tenantSlug: "northwind",
    domains: ["northwind.com"],
    provider: {
      providerId: "okta",
      providerLabel: "Okta Workforce Identity",
      protocol: "OIDC",
      loginLabel: "Continue with Okta",
      mfa: "idp-enforced",
    },
  },
  {
    id: "org-globex",
    organizationName: "Globex Corporation",
    workspaceId: "workspace-globex-primary",
    workspaceName: "Globex Audit Operations",
    tenantSlug: "globex",
    domains: ["globex.com"],
    provider: {
      providerId: "google-workspace",
      providerLabel: "Google Workspace",
      protocol: "SAML",
      loginLabel: "Continue with Google Workspace",
      mfa: "idp-enforced",
    },
  },
];

const permissionsByRole: Record<EnterpriseRole, string[]> = {
  "AP Reviewer": [
    "dashboard:view",
    "exceptions:view",
    "invoice:view",
    "invoice:request-evidence",
    "invoice:apply-correction",
  ],
  "Finance Manager": [
    "dashboard:view",
    "exceptions:view",
    "invoice:view",
    "invoice:approve",
    "invoice:assign",
    "reports:view",
  ],
  Controller: [
    "dashboard:view",
    "exceptions:view",
    "invoice:view",
    "invoice:escalate",
    "invoice:override-policy",
    "reports:view",
  ],
  Auditor: ["dashboard:view", "exceptions:view", "invoice:view", "reports:view", "audit:view"],
  Admin: [
    "dashboard:view",
    "exceptions:view",
    "invoice:view",
    "reports:view",
    "settings:view",
    "settings:manage",
    "identity:manage",
  ],
};

export type InvoiceActionType =
  | "approve"
  | "request-evidence"
  | "escalate"
  | "assign-reviewer";

const reportsExceptionMix = [
  { name: "Tax", value: 14, color: "#0f766e" },
  { name: "Duplicate", value: 6, color: "#ef4444" },
  { name: "Evidence", value: 18, color: "#f59e0b" },
  { name: "Low confidence", value: 9, color: "#0284c7" },
];

const baselineMetricValues = {
  invoicesProcessed: 2487,
  pendingReviews: 42,
  highRiskInvoices: 9,
  duplicateAlerts: 6,
  complianceIssues: 14,
};

const baselineWorkflowCounts = {
  straightThrough: 1384,
  reviewerQueue: 42,
  evidenceRequests: 18,
  blockedOrEscalated: 11,
};

const pendingAuthRequests = new Map<string, PendingAuthRequest>();
const provisionedUsers = new Map<string, ProvisionedUser>();
const activeSessions = new Map<string, EnterpriseSessionRecord>();

const invoices: InvoiceRecord[] = structuredClone(seedInvoiceRecords);
const rules: RuleSetting[] = structuredClone(seedRulesCatalog);
const notifications: NotificationSetting[] = structuredClone(seedNotificationSettings);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseWorkEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");

  if (!localPart || !domain) {
    return null;
  }

  return {
    normalized,
    localPart,
    domain,
  };
}

function findOrganizationByEmail(email: string) {
  const parsed = parseWorkEmail(email);

  if (!parsed) {
    return null;
  }

  const organization = organizations.find((item) => item.domains.includes(parsed.domain));

  if (!organization) {
    return null;
  }

  return {
    organization,
    email: parsed.normalized,
    localPart: parsed.localPart,
    domain: parsed.domain,
  };
}

function inferRoleFromEmail(localPart: string): EnterpriseRole {
  if (localPart.includes("admin")) {
    return "Admin";
  }

  if (localPart.includes("controller")) {
    return "Controller";
  }

  if (localPart.includes("auditor")) {
    return "Auditor";
  }

  if (localPart.includes("finance.manager") || localPart.includes("manager")) {
    return "Finance Manager";
  }

  return "AP Reviewer";
}

function buildDisplayName(localPart: string) {
  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildSessionExpiry(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function isExpired(isoTimestamp: string) {
  return new Date(isoTimestamp).getTime() <= Date.now();
}

function getSafeOrganizationSummary(organization: OrganizationRecord, matchedDomain: string) {
  return {
    organizationId: organization.id,
    organizationName: organization.organizationName,
    workspaceId: organization.workspaceId,
    workspaceName: organization.workspaceName,
    tenantSlug: organization.tenantSlug,
    primaryDomain: organization.domains[0],
    matchedDomain,
  };
}

function buildAuditEvent(action: string, detail: string, actor = "API Workflow") {
  return {
    timestamp: new Date().toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }),
    actor,
    action,
    detail,
  };
}

function getFilteredExceptions(selectedType = "All exceptions") {
  return invoices.filter((invoice) => {
    if (invoice.status === "auto-approved") {
      return false;
    }

    return selectedType === "All exceptions" ? true : invoice.anomalyTypes.includes(selectedType);
  });
}

function updateValidationCheck(
  invoice: InvoiceRecord,
  label: string,
  status: InvoiceRecord["validationChecks"][number]["status"],
  detail: string,
) {
  const existingCheck = invoice.validationChecks.find((check) => check.label === label);

  if (existingCheck) {
    existingCheck.status = status;
    existingCheck.detail = detail;
    return;
  }

  invoice.validationChecks.push({
    label,
    status,
    detail,
  });
}

function upsertFlag(invoice: InvoiceRecord, title: string, severity: "low" | "medium" | "high", detail: string) {
  const existingFlag = invoice.flags.find((flag) => flag.title === title);

  if (existingFlag) {
    existingFlag.severity = severity;
    existingFlag.detail = detail;
    return;
  }

  invoice.flags.unshift({
    title,
    severity,
    detail,
  });
}

function addAnomaly(invoice: InvoiceRecord, anomaly: string) {
  if (!invoice.anomalyTypes.includes(anomaly)) {
    invoice.anomalyTypes.unshift(anomaly);
  }
}

function removeAnomaly(invoice: InvoiceRecord, anomaly: string) {
  invoice.anomalyTypes = invoice.anomalyTypes.filter((item) => item !== anomaly);
}

function markLineItemsResolved(invoice: InvoiceRecord) {
  invoice.lineItems = invoice.lineItems.map((item) => ({
    ...item,
    status: "pass",
  }));
}

function resolveComparisons(invoice: InvoiceRecord) {
  invoice.fieldComparisons = invoice.fieldComparisons.map((comparison) => ({
    ...comparison,
    extracted: comparison.suggestion,
  }));
}

function resolveInvoice(invoice: InvoiceRecord, actor: string, note?: string) {
  invoice.status = "auto-approved";
  invoice.assignedReviewer = actor;
  invoice.agingHours = 0;
  invoice.summary =
    "Invoice cleared by reviewer and released from manual controls after final exception verification.";
  invoice.workflowRecommendation = "Approved for payment release in the next scheduled payment batch.";

  invoice.anomalyTypes = ["Reviewer approved"];

  invoice.flags = [];
  markLineItemsResolved(invoice);
  resolveComparisons(invoice);
  invoice.validationChecks = invoice.validationChecks.map((check) => ({
    ...check,
    status: "pass",
    detail:
      check.status === "pass"
        ? check.detail
        : `Resolved during final approval by ${actor}.${note ? ` ${note}` : ""}`.trim(),
  }));

  updateValidationCheck(
    invoice,
    "Tax compliance",
    "pass",
    "Reviewer confirmed the tax classification and accepted the resolved posting treatment.",
  );
  updateValidationCheck(
    invoice,
    "Approval policy",
    "pass",
    `Manual approval completed by ${actor}.${note ? ` ${note}` : ""}`.trim(),
  );
}

function routeForEvidence(invoice: InvoiceRecord, actor: string, note?: string) {
  invoice.status = "needs-evidence";
  invoice.assignedReviewer = actor;
  invoice.summary =
    "Invoice is waiting for supporting documentation before payment can continue through the workflow.";
  invoice.workflowRecommendation =
    "Hold the invoice in evidence collection until the vendor submits the missing support.";

  addAnomaly(invoice, "Missing evidence");
  updateValidationCheck(
    invoice,
    "Evidence pack",
    "warning",
    note || "Supporting evidence is still pending from the vendor or requester.",
  );
  upsertFlag(
    invoice,
    "Supporting evidence pending",
    "medium",
    note || "Reviewer requested supporting documentation before approval can proceed.",
  );
}

function escalateInvoice(invoice: InvoiceRecord, note?: string) {
  invoice.status = "escalated";
  invoice.assignedReviewer = "Controller Queue";
  invoice.summary =
    "Invoice was escalated for a higher-control review because it still needs an override or policy decision.";
  invoice.workflowRecommendation =
    "Keep the invoice in the controller queue until the escalation owner records a final decision.";

  addAnomaly(invoice, "Controller escalation");
  updateValidationCheck(
    invoice,
    "Approval policy",
    "fail",
    note || "Invoice requires controller review before it can be released.",
  );
  upsertFlag(
    invoice,
    "Controller escalation",
    "high",
    note || "Manual escalation recorded for additional controls review.",
  );
}

function assignReviewer(invoice: InvoiceRecord, reviewerName: string, actor: string) {
  invoice.status = "pending-review";
  invoice.assignedReviewer = reviewerName;
  invoice.summary =
    "Invoice is in active manual review with a named owner and is waiting for the next reviewer action.";
  invoice.workflowRecommendation = `Continue review in ${reviewerName}'s queue until the exception is resolved.`;

  updateValidationCheck(
    invoice,
    "Approval policy",
    "warning",
    `Assigned to ${reviewerName} by ${actor} for manual review.`,
  );
}

const initialStatusCounts = {
  pendingReview: seedInvoiceRecords.filter((invoice) => invoice.status === "pending-review").length,
  autoApproved: seedInvoiceRecords.filter((invoice) => invoice.status === "auto-approved").length,
  needsEvidence: seedInvoiceRecords.filter((invoice) => invoice.status === "needs-evidence").length,
  blockedOrEscalated: seedInvoiceRecords.filter((invoice) =>
    invoice.status === "blocked" || invoice.status === "escalated",
  ).length,
  highRiskActive: seedInvoiceRecords.filter((invoice) =>
    invoice.riskLevel === "high" && invoice.status !== "auto-approved",
  ).length,
  duplicateActive: seedInvoiceRecords.filter((invoice) =>
    invoice.status !== "auto-approved" &&
    invoice.anomalyTypes.some((item) => item.toLowerCase().includes("duplicate")),
  ).length,
  complianceActive: seedInvoiceRecords.filter((invoice) =>
    invoice.status !== "auto-approved" &&
    invoice.validationChecks.some((check) => check.status !== "pass"),
  ).length,
};

function buildDashboardData() {
  const activeReviewQueue = invoices.filter((invoice) => invoice.status !== "auto-approved");
  const currentStatusCounts = {
    pendingReview: invoices.filter((invoice) => invoice.status === "pending-review").length,
    autoApproved: invoices.filter((invoice) => invoice.status === "auto-approved").length,
    needsEvidence: invoices.filter((invoice) => invoice.status === "needs-evidence").length,
    blockedOrEscalated: invoices.filter((invoice) =>
      invoice.status === "blocked" || invoice.status === "escalated",
    ).length,
    highRiskActive: invoices.filter((invoice) =>
      invoice.riskLevel === "high" && invoice.status !== "auto-approved",
    ).length,
    duplicateActive: invoices.filter((invoice) =>
      invoice.status !== "auto-approved" &&
      invoice.anomalyTypes.some((item) => item.toLowerCase().includes("duplicate")),
    ).length,
    complianceActive: invoices.filter((invoice) =>
      invoice.status !== "auto-approved" &&
      invoice.validationChecks.some((check) => check.status !== "pass"),
    ).length,
  };

  const displayedMetrics = [
    {
      label: "Invoices processed",
      value: baselineMetricValues.invoicesProcessed.toLocaleString("en-IN"),
      hint: `${currentStatusCounts.autoApproved} invoices are currently straight-through approved`,
      tone: "info" as const,
    },
    {
      label: "Pending reviews",
      value: String(
        baselineMetricValues.pendingReviews +
          (currentStatusCounts.pendingReview - initialStatusCounts.pendingReview),
      ),
      hint: `${currentStatusCounts.pendingReview} invoices are actively waiting in reviewer queue`,
      tone: "warning" as const,
    },
    {
      label: "High-risk invoices",
      value: String(
        baselineMetricValues.highRiskInvoices +
          (currentStatusCounts.highRiskActive - initialStatusCounts.highRiskActive),
      ),
      hint: `${currentStatusCounts.highRiskActive} high-risk invoices remain unresolved`,
      tone: "danger" as const,
    },
    {
      label: "Duplicate alerts",
      value: String(
        baselineMetricValues.duplicateAlerts +
          (currentStatusCounts.duplicateActive - initialStatusCounts.duplicateActive),
      ),
      hint: `${currentStatusCounts.duplicateActive} duplicate-prone invoices are still open`,
      tone: "warning" as const,
    },
    {
      label: "Compliance issues",
      value: String(
        baselineMetricValues.complianceIssues +
          (currentStatusCounts.complianceActive - initialStatusCounts.complianceActive),
      ),
      hint: `${currentStatusCounts.complianceActive} active invoices still have validation warnings`,
      tone: "danger" as const,
    },
    dashboardMetrics[5],
  ];

  const displayedWorkflowLanes = [
    {
      label: "Straight-through",
      count:
        baselineWorkflowCounts.straightThrough +
        (currentStatusCounts.autoApproved - initialStatusCounts.autoApproved),
      description: "Low-risk or approved invoices routed out of manual review.",
    },
    {
      label: "Reviewer queue",
      count:
        baselineWorkflowCounts.reviewerQueue +
        (currentStatusCounts.pendingReview - initialStatusCounts.pendingReview),
      description: "Needs finance or operations validation.",
    },
    {
      label: "Evidence requests",
      count:
        baselineWorkflowCounts.evidenceRequests +
        (currentStatusCounts.needsEvidence - initialStatusCounts.needsEvidence),
      description: "Waiting for supporting documents or vendor response.",
    },
    {
      label: "Blocked or escalated",
      count:
        baselineWorkflowCounts.blockedOrEscalated +
        (currentStatusCounts.blockedOrEscalated - initialStatusCounts.blockedOrEscalated),
      description: "Duplicate, fraud, or policy exceptions.",
    },
  ];

  return {
    metrics: displayedMetrics,
    trend: dashboardTrend,
    workflowLanes: displayedWorkflowLanes,
    reviewerQueue: activeReviewQueue,
    insights: activeReviewQueue.slice(0, 4),
  };
}

export const platformStore = {
  discoverOrganization(email: string) {
    const result = findOrganizationByEmail(email);

    if (!result) {
      return null;
    }

    return {
      email: result.email,
      organization: getSafeOrganizationSummary(result.organization, result.domain),
      provider: result.organization.provider,
    };
  },

  startEnterpriseAuth(email: string) {
    const result = findOrganizationByEmail(email);

    if (!result) {
      return null;
    }

    const authRequestId = randomUUID();
    const requestedAt = new Date().toISOString();
    const expiresAt = buildSessionExpiry(0.25);

    pendingAuthRequests.set(authRequestId, {
      authRequestId,
      email: result.email,
      organizationId: result.organization.id,
      requestedAt,
      expiresAt,
    });

    return {
      authRequestId,
      callbackUrl: `/auth/callback?requestId=${authRequestId}`,
      expiresAt,
      email: result.email,
      organization: getSafeOrganizationSummary(result.organization, result.domain),
      provider: result.organization.provider,
    };
  },

  completeEnterpriseAuth(authRequestId: string) {
    const pendingRequest = pendingAuthRequests.get(authRequestId);

    if (!pendingRequest || isExpired(pendingRequest.expiresAt)) {
      pendingAuthRequests.delete(authRequestId);
      return null;
    }

    const organization = organizations.find((item) => item.id === pendingRequest.organizationId);
    const emailInfo = parseWorkEmail(pendingRequest.email);

    if (!organization || !emailInfo) {
      pendingAuthRequests.delete(authRequestId);
      return null;
    }

    const existingUser = provisionedUsers.get(pendingRequest.email);
    const role = existingUser?.role ?? inferRoleFromEmail(emailInfo.localPart);
    const user =
      existingUser ??
      {
        userId: randomUUID(),
        email: pendingRequest.email,
        displayName: buildDisplayName(emailInfo.localPart),
        role,
        organizationId: organization.id,
      };

    provisionedUsers.set(pendingRequest.email, user);

    const session: EnterpriseSessionRecord = {
      sessionToken: randomUUID(),
      userId: user.userId,
      organizationId: organization.id,
      organizationName: organization.organizationName,
      workspaceId: organization.workspaceId,
      workspaceName: organization.workspaceName,
      tenantSlug: organization.tenantSlug,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      permissions: permissionsByRole[user.role],
      provider: organization.provider,
      assurance: {
        mfa: "idp-enforced",
        sessionType: "mock-enterprise",
      },
      createdAt: new Date().toISOString(),
      expiresAt: buildSessionExpiry(8),
      targetPath: tenantPaths.dashboard(organization.tenantSlug),
    };

    activeSessions.set(session.sessionToken, session);
    pendingAuthRequests.delete(authRequestId);

    return session;
  },

  getEnterpriseSession(sessionToken: string) {
    const session = activeSessions.get(sessionToken);

    if (!session) {
      return null;
    }

    if (isExpired(session.expiresAt)) {
      activeSessions.delete(sessionToken);
      return null;
    }

    return session;
  },

  clearEnterpriseSession(sessionToken: string) {
    return activeSessions.delete(sessionToken);
  },

  getDashboard() {
    return buildDashboardData();
  },

  listInvoices() {
    return invoices;
  },

  getInvoice(invoiceId: string) {
    return invoices.find((invoice) => invoice.id === invoiceId);
  },

  getExceptions(selectedType = "All exceptions") {
    const filtered = getFilteredExceptions(selectedType);

    return {
      filterOptions: exceptionTypeOptions,
      selectedType,
      summary: {
        highestSeverityCount: filtered.filter((invoice) =>
          invoice.flags.some((flag) => flag.severity === "high"),
        ).length,
        slaBreaches: filtered.filter((invoice) => invoice.agingHours > 24).length,
        evidenceRequests: filtered.filter((invoice) => invoice.status === "needs-evidence").length,
      },
      invoices: filtered,
    };
  },

  getIngestion() {
    return {
      channels: ingestionChannels,
    };
  },

  getProcessing() {
    return {
      batchId: "BATCH-22-APR-067",
      eta: "Under 1 minute",
      stages: processingStages,
    };
  },

  getReports() {
    return {
      trend: dashboardTrend,
      vendorRiskLeaderboard,
      complianceSummary,
      exceptionMix: reportsExceptionMix,
    };
  },

  getSettings() {
    return {
      approvalMatrix,
      integrations: integrationCatalog,
      roles: userRoles,
      rules,
      notifications,
    };
  },

  applyInvoiceAction(
    invoiceId: string,
    action: InvoiceActionType,
    actor = "Workflow API",
    note?: string,
  ) {
    const invoice = invoices.find((item) => item.id === invoiceId);

    if (!invoice) {
      return null;
    }

    const detailSuffix = note ? ` Note: ${note}` : "";

    if (action === "approve") {
      resolveInvoice(invoice, actor, note);
      invoice.auditTrail.unshift(
        buildAuditEvent("Approved invoice", `Invoice approved for payment release.${detailSuffix}`, actor),
      );
    }

    if (action === "request-evidence") {
      routeForEvidence(invoice, actor, note);
      invoice.auditTrail.unshift(
        buildAuditEvent(
          "Requested evidence",
          `Supporting evidence request sent to vendor.${detailSuffix}`,
          actor,
        ),
      );
    }

    if (action === "escalate") {
      escalateInvoice(invoice, note);
      invoice.auditTrail.unshift(
        buildAuditEvent("Escalated invoice", `Invoice escalated to controller review.${detailSuffix}`, actor),
      );
    }

    if (action === "assign-reviewer") {
      assignReviewer(invoice, note || "Manual Review Queue", actor);
      invoice.auditTrail.unshift(
        buildAuditEvent(
          "Assigned reviewer",
          `Invoice assigned to ${invoice.assignedReviewer}.`,
          actor,
        ),
      );
    }

    return {
      invoice,
      message:
        action === "approve"
          ? `${invoice.invoiceNumber} approved successfully.`
          : action === "request-evidence"
          ? `Evidence request recorded for ${invoice.invoiceNumber}.`
          : action === "escalate"
          ? `${invoice.invoiceNumber} escalated successfully.`
          : `${invoice.invoiceNumber} reviewer assignment updated.`,
    };
  },

  applyComparisonSuggestion(invoiceId: string, fieldName: string, actor = "Correction Workbench") {
    const invoice = invoices.find((item) => item.id === invoiceId);

    if (!invoice) {
      return null;
    }

    const comparison = invoice.fieldComparisons.find((item) => item.field === fieldName);

    if (!comparison) {
      return null;
    }

    comparison.extracted = comparison.suggestion;
    invoice.auditTrail.unshift(
      buildAuditEvent(
        "Applied field correction",
        `Updated ${comparison.field} to suggested value "${comparison.suggestion}".`,
        actor,
      ),
    );

    return {
      invoice,
      message: `Applied suggestion for ${comparison.field}.`,
    };
  },

  updateRule(name: string, enabled: boolean) {
    const rule = rules.find((item) => item.name === name);

    if (!rule) {
      return null;
    }

    rule.enabled = enabled;
    return rule;
  },

  updateNotification(name: string, enabled: boolean) {
    const notification = notifications.find((item) => item.name === name);

    if (!notification) {
      return null;
    }

    notification.enabled = enabled;
    return notification;
  },

  publishRuleset() {
    return {
      success: true,
      publishedAt: new Date().toISOString(),
    };
  },
};
