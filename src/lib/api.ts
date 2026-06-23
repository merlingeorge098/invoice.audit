import {
  approvalMatrix,
  complianceSummary,
  dashboardMetrics,
  dashboardTrend,
  exceptionTypeOptions,
  ingestionChannels,
  integrationCatalog,
  invoiceRecords,
  notificationSettings,
  processingStages,
  rulesCatalog,
  userRoles,
  vendorRiskLeaderboard,
  workflowLanes,
  type InvoiceRecord,
} from "@/data/platformData";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type ApiWorkspaceContext = {
  mode: "demo" | "enterprise";
  tenantSlug?: string | null;
  sessionToken?: string | null;
};

export type DashboardResponse = {
  metrics: typeof dashboardMetrics;
  trend: typeof dashboardTrend;
  workflowLanes: typeof workflowLanes;
  reviewerQueue: InvoiceRecord[];
  insights: InvoiceRecord[];
};

export type ExceptionsResponse = {
  filterOptions: typeof exceptionTypeOptions;
  selectedType: string;
  summary: {
    highestSeverityCount: number;
    slaBreaches: number;
    evidenceRequests: number;
  };
  invoices: InvoiceRecord[];
};

export type IngestionResponse = {
  channels: typeof ingestionChannels;
};

export type ProcessingResponse = {
  batchId: string;
  eta: string;
  stages: typeof processingStages;
};

export type ReportsResponse = {
  trend: typeof dashboardTrend;
  vendorRiskLeaderboard: typeof vendorRiskLeaderboard;
  complianceSummary: typeof complianceSummary;
  exceptionMix: Array<{ name: string; value: number; color: string }>;
};

export type SettingsResponse = {
  approvalMatrix: typeof approvalMatrix;
  integrations: typeof integrationCatalog;
  roles: typeof userRoles;
  rules: typeof rulesCatalog;
  notifications: typeof notificationSettings;
};

export type InvoiceActionType =
  | "approve"
  | "request-evidence"
  | "escalate"
  | "assign-reviewer";

function buildWorkspaceHeaders(context?: ApiWorkspaceContext) {
  if (!context || context.mode !== "enterprise") {
    return {};
  }

  return {
    "X-Workspace-Mode": "enterprise",
    ...(context.tenantSlug ? { "X-Tenant-Slug": context.tenantSlug } : {}),
    ...(context.sessionToken ? { "X-Session-Token": context.sessionToken } : {}),
  };
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  context?: ApiWorkspaceContext,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...buildWorkspaceHeaders(context),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;

    try {
      const errorBody = (await response.json()) as { message?: string };
      if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // Preserve generic message when body parsing fails.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function getDashboardData(context?: ApiWorkspaceContext) {
  return apiRequest<DashboardResponse>("/dashboard", undefined, context);
}

export function getInvoiceData(invoiceId: string, context?: ApiWorkspaceContext) {
  return apiRequest<InvoiceRecord>(`/invoices/${invoiceId}`, undefined, context);
}

export function getExceptionsData(selectedType = "All exceptions", context?: ApiWorkspaceContext) {
  const params = new URLSearchParams({ type: selectedType });
  return apiRequest<ExceptionsResponse>(`/exceptions?${params.toString()}`, undefined, context);
}

export function getIngestionData(context?: ApiWorkspaceContext) {
  return apiRequest<IngestionResponse>("/ingestion", undefined, context);
}

export function getProcessingData(context?: ApiWorkspaceContext) {
  return apiRequest<ProcessingResponse>("/processing", undefined, context);
}

export function getReportsData(context?: ApiWorkspaceContext) {
  return apiRequest<ReportsResponse>("/reports", undefined, context);
}

export function getSettingsData(context?: ApiWorkspaceContext) {
  return apiRequest<SettingsResponse>("/settings", undefined, context);
}

export function applyInvoiceAction(
  invoiceId: string,
  payload: { action: InvoiceActionType; actor?: string; note?: string },
  context?: ApiWorkspaceContext,
) {
  return apiRequest<{ invoice: InvoiceRecord; message: string }>(`/invoices/${invoiceId}/actions`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, context);
}

export function applyComparisonSuggestion(
  invoiceId: string,
  fieldName: string,
  context?: ApiWorkspaceContext,
) {
  return apiRequest<{ invoice: InvoiceRecord; message: string }>(
    `/invoices/${invoiceId}/comparisons/${encodeURIComponent(fieldName)}/apply`,
    {
      method: "PATCH",
      body: JSON.stringify({ actor: "Correction Workbench" }),
    },
    context,
  );
}

export function updateRuleSetting(
  ruleName: string,
  enabled: boolean,
  context?: ApiWorkspaceContext,
) {
  return apiRequest<(typeof rulesCatalog)[number]>(
    `/settings/rules/${encodeURIComponent(ruleName)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
    context,
  );
}

export function updateNotificationSetting(
  notificationName: string,
  enabled: boolean,
  context?: ApiWorkspaceContext,
) {
  return apiRequest<(typeof notificationSettings)[number]>(
    `/settings/notifications/${encodeURIComponent(notificationName)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
    context,
  );
}

export function publishRuleset(context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean; publishedAt: string }>("/settings/publish", {
    method: "POST",
    body: JSON.stringify({}),
  }, context);
}

// ── New SaaS API helpers ──────────────────────────────────────────────────────

export function getSessionFromServer() {
  return apiRequest<import("@/lib/auth").EnterpriseSession>("/auth/session");
}

export function signupOrganization(payload: {
  organizationName: string;
  tenantSlug: string;
  domain: string;
  adminEmail: string;
  adminName: string;
}) {
  return apiRequest<{
    tenantSlug: string;
    sessionToken: string;
    expiresAt: string;
    targetPath: string;
    role: string;
    permissions: string[];
  }>("/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getInviteInfo(token: string) {
  return apiRequest<{
    email: string;
    role: string;
    organizationName: string;
    workspaceName: string;
    inviterName: string;
    tenantSlug: string;
  }>(`/invites/${token}`);
}

export function acceptInvite(token: string) {
  return apiRequest<{ success: boolean; tenantSlug: string }>(`/invites/${token}/accept`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type PlanInfo = {
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  invoiceCount: number;
  invoiceLimit: number;
  seatCount: number;
  seatLimit: number;
};

export function getBillingPlan(context?: ApiWorkspaceContext) {
  return apiRequest<any>("/billing", undefined, context).then((r: any): PlanInfo => ({
    planName: r.plan ?? "free",
    status: r.status ?? "active",
    currentPeriodEnd: r.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: r.cancelAtPeriodEnd ?? false,
    invoiceCount: r.usage?.invoicesThisMonth ?? 0,
    invoiceLimit: r.limits?.maxInvoicesPerMonth ?? 50,
    seatCount: r.usage?.seats ?? 0,
    seatLimit: r.limits?.maxSeats ?? 3,
  }));
}

export function createCheckoutSession(priceId: string, context?: ApiWorkspaceContext) {
  return apiRequest<{ url: string }>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ priceId }),
  }, context);
}

export function createPortalSession(context?: ApiWorkspaceContext) {
  return apiRequest<{ url: string }>("/billing/portal", { method: "POST", body: JSON.stringify({}) }, context);
}

export type Member = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  joinedAt: string;
};

export function getTeamMembers(context?: ApiWorkspaceContext) {
  // Server returns an array — wrap in {members} for consistent API surface
  return apiRequest<Member[]>("/users", undefined, context).then((arr) => ({ members: arr }));
}

export function changeRole(userId: string, role: string, context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean }>(`/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  }, context);
}

export function removeMember(userId: string, context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean }>(`/users/${userId}`, {
    method: "DELETE",
  }, context);
}

export function sendInvite(email: string, role: string, context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean }>("/invites", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  }, context);
}

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export function getNotifications(context?: ApiWorkspaceContext) {
  return apiRequest<{ items: any[]; unreadCount: number }>("/notifications", undefined, context).then(
    (r) => ({
      notifications: (r.items ?? []).map((e: any) => ({
        id: e.id,
        type: e.eventType ?? e.type ?? "general",
        title: e.title ?? e.subject ?? "",
        body: e.body ?? e.message ?? "",
        read: Boolean(e.readAt),
        createdAt: e.createdAt,
      })) as Notification[],
      unreadCount: r.unreadCount,
    }),
  );
}

export function markNotificationRead(id: string, context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean }>(`/notifications/${id}/read`, {
    method: "POST",
    body: JSON.stringify({}),
  }, context);
}

export function markAllNotificationsRead(context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean }>("/notifications/read-all", {
    method: "POST",
    body: JSON.stringify({}),
  }, context);
}

export type AuditEvent = {
  id: string;
  invoiceId: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
  hmacValid?: boolean;
};

export function getAuditTrail(page = 1, context?: ApiWorkspaceContext) {
  return apiRequest<{ items: any[]; total: number; page: number; pages: number }>(
    `/audit?page=${page}`,
    undefined,
    context,
  ).then((r) => ({
    events: (r.items ?? []) as AuditEvent[],
    total: r.total,
    page: r.page,
    pages: r.pages,
  }));
}

export type VendorMaster = {
  id: string;
  vendorCode: string;
  vendorName: string;
  gstin: string | null;
  email: string | null;
  isActive: boolean;
};

export function getVendors(context?: ApiWorkspaceContext) {
  // Server returns an array — wrap in {vendors}
  return apiRequest<any[]>("/vendors", undefined, context).then((arr) => ({
    vendors: arr.map((v: any) => ({
      id: v.id,
      vendorCode: v.vendorCode ?? "",
      vendorName: v.vendorName,
      gstin: v.gstin ?? null,
      email: v.vendorEmail ?? v.email ?? null,
      isActive: v.isActive,
    })) as VendorMaster[],
  }));
}

export function createVendor(data: Partial<VendorMaster>, context?: ApiWorkspaceContext) {
  const payload = { vendorName: data.vendorName, vendorCode: data.vendorCode, gstin: data.gstin, vendorEmail: data.email };
  return apiRequest<VendorMaster>("/vendors", { method: "POST", body: JSON.stringify(payload) }, context);
}

export function updateVendor(id: string, data: Partial<VendorMaster>, context?: ApiWorkspaceContext) {
  const payload = { vendorName: data.vendorName, vendorCode: data.vendorCode, gstin: data.gstin, vendorEmail: data.email, isActive: data.isActive };
  return apiRequest<VendorMaster>(`/vendors/${id}`, { method: "PUT", body: JSON.stringify(payload) }, context);
}

export function deleteVendor(id: string, context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean }>(`/vendors/${id}`, { method: "DELETE" }, context);
}

// Super-admin API
export function getSuperAdminTenants() {
  // Server returns an array — wrap in {tenants}
  return apiRequest<any[]>("/admin/tenants", undefined).then((arr) => ({ tenants: arr }));
}

export function lockTenant(tenantId: string) {
  return apiRequest<{ success: boolean }>(`/admin/tenants/${tenantId}/lock`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function unlockTenant(tenantId: string) {
  return apiRequest<{ success: boolean }>(`/admin/tenants/${tenantId}/unlock`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function impersonateTenant(tenantId: string) {
  return apiRequest<import("@/lib/auth").EnterpriseSession>(`/admin/impersonate-tenant/${tenantId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ERP API helpers
export function getErpConfig(context?: ApiWorkspaceContext) {
  return apiRequest<{ erpWebhookUrl: string | null; hasApiKey: boolean }>("/erp/config", undefined, context);
}

export function saveErpConfig(data: { erpWebhookUrl: string; erpApiKey?: string }, context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean }>("/erp/config", { method: "PUT", body: JSON.stringify(data) }, context);
}

export function getErpSyncHistory(context?: ApiWorkspaceContext) {
  return apiRequest<any[]>("/erp/sync-history", undefined, context);
}

// GDPR deletion
export function deleteMyAccount(context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean; message: string }>("/users/me", { method: "DELETE" }, context);
}

// ── Evidence ────────────────────────────────────────────────────────────────

export type EvidenceAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
  fromVendorPortal: boolean;
  url: string;
};

export function getEvidence(invoiceId: string, context?: ApiWorkspaceContext) {
  return apiRequest<EvidenceAttachment[]>(`/invoices/${invoiceId}/evidence`, undefined, context);
}

export function requestEvidenceLink(invoiceId: string, note: string, context?: ApiWorkspaceContext) {
  return apiRequest<{ portalUrl: string; expiresAt: string; vendorEmail: string | null; organizationName: string | null }>(
    `/invoices/${invoiceId}/request-evidence-link`,
    { method: "POST", body: JSON.stringify({ note }) },
    context,
  );
}

// ── API Keys ────────────────────────────────────────────────────────────────

export type ApiKey = {
  id: string;
  label: string;
  keyPrefix: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function getApiKeys(context?: ApiWorkspaceContext) {
  return apiRequest<ApiKey[]>("/api-keys", undefined, context);
}

export function createApiKey(data: { label: string; expiresAt?: string }, context?: ApiWorkspaceContext) {
  return apiRequest<{ id: string; label: string; keyPrefix: string; rawKey: string; createdAt: string }>(
    "/api-keys",
    { method: "POST", body: JSON.stringify(data) },
    context,
  );
}

export function revokeApiKey(id: string, context?: ApiWorkspaceContext) {
  return apiRequest<{ success: boolean }>(`/api-keys/${id}`, { method: "DELETE" }, context);
}

// ── Notifications (paginated) ───────────────────────────────────────────────

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  invoiceId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function getNotificationsPaged(page = 1, context?: ApiWorkspaceContext) {
  return apiRequest<{ items: NotificationItem[]; unreadCount: number; hasMore: boolean }>(
    `/notifications?page=${page}`,
    undefined,
    context,
  );
}

export const fallbackData = {
  dashboard: {
    metrics: dashboardMetrics,
    trend: dashboardTrend,
    workflowLanes,
    reviewerQueue: invoiceRecords,
    insights: invoiceRecords.slice(0, 4),
  } satisfies DashboardResponse,
  ingestion: {
    channels: ingestionChannels,
  } satisfies IngestionResponse,
  processing: {
    batchId: "BATCH-22-APR-067",
    eta: "Under 1 minute",
    stages: processingStages,
  } satisfies ProcessingResponse,
  reports: {
    trend: dashboardTrend,
    vendorRiskLeaderboard,
    complianceSummary,
    exceptionMix: [
      { name: "Tax", value: 14, color: "#0f766e" },
      { name: "Duplicate", value: 6, color: "#ef4444" },
      { name: "Evidence", value: 18, color: "#f59e0b" },
      { name: "Low confidence", value: 9, color: "#0284c7" },
    ],
  } satisfies ReportsResponse,
  settings: {
    approvalMatrix,
    integrations: integrationCatalog,
    roles: userRoles,
    rules: rulesCatalog,
    notifications: notificationSettings,
  } satisfies SettingsResponse,
};
