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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
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

export function getDashboardData() {
  return apiRequest<DashboardResponse>("/dashboard");
}

export function getInvoiceData(invoiceId: string) {
  return apiRequest<InvoiceRecord>(`/invoices/${invoiceId}`);
}

export function getExceptionsData(selectedType = "All exceptions") {
  const params = new URLSearchParams({ type: selectedType });
  return apiRequest<ExceptionsResponse>(`/exceptions?${params.toString()}`);
}

export function getIngestionData() {
  return apiRequest<IngestionResponse>("/ingestion");
}

export function getProcessingData() {
  return apiRequest<ProcessingResponse>("/processing");
}

export function getReportsData() {
  return apiRequest<ReportsResponse>("/reports");
}

export function getSettingsData() {
  return apiRequest<SettingsResponse>("/settings");
}

export function applyInvoiceAction(
  invoiceId: string,
  payload: { action: InvoiceActionType; actor?: string; note?: string },
) {
  return apiRequest<{ invoice: InvoiceRecord; message: string }>(`/invoices/${invoiceId}/actions`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function applyComparisonSuggestion(invoiceId: string, fieldName: string) {
  return apiRequest<{ invoice: InvoiceRecord; message: string }>(
    `/invoices/${invoiceId}/comparisons/${encodeURIComponent(fieldName)}/apply`,
    {
      method: "PATCH",
      body: JSON.stringify({ actor: "Correction Workbench" }),
    },
  );
}

export function updateRuleSetting(ruleName: string, enabled: boolean) {
  return apiRequest<(typeof rulesCatalog)[number]>(
    `/settings/rules/${encodeURIComponent(ruleName)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
  );
}

export function updateNotificationSetting(notificationName: string, enabled: boolean) {
  return apiRequest<(typeof notificationSettings)[number]>(
    `/settings/notifications/${encodeURIComponent(notificationName)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
  );
}

export function publishRuleset() {
  return apiRequest<{ success: boolean; publishedAt: string }>("/settings/publish", {
    method: "POST",
    body: JSON.stringify({}),
  });
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
