import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  exceptionTypeOptions,
  getInvoiceById,
  invoiceRecords,
} from "@/data/platformData";
import {
  applyComparisonSuggestion,
  applyInvoiceAction,
  type DashboardResponse,
  type ExceptionsResponse,
  type ApiWorkspaceContext,
  fallbackData,
  getDashboardData,
  getExceptionsData,
  getIngestionData,
  getInvoiceData,
  getProcessingData,
  getReportsData,
  getSettingsData,
  publishRuleset,
  updateNotificationSetting,
  updateRuleSetting,
  type InvoiceActionType,
} from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/workspace-context";

function buildApiContext(workspace: ReturnType<typeof useCurrentWorkspace>): ApiWorkspaceContext {
  if (workspace.mode !== "enterprise") {
    return { mode: "demo" };
  }

  return {
    mode: "enterprise",
    tenantSlug: workspace.tenantSlug,
    sessionToken: workspace.session?.sessionToken,
  };
}

function replaceInvoiceInList<T extends { id: string }>(
  items: T[],
  updatedItem: T,
  options?: { remove?: boolean },
) {
  const existingIndex = items.findIndex((item) => item.id === updatedItem.id);

  if (options?.remove) {
    return items.filter((item) => item.id !== updatedItem.id);
  }

  if (existingIndex === -1) {
    return [updatedItem, ...items];
  }

  return items.map((item) => (item.id === updatedItem.id ? updatedItem : item));
}

function updateDashboardCache(
  previous: DashboardResponse | undefined,
  updatedInvoice: (typeof invoiceRecords)[number],
) {
  if (!previous) {
    return previous;
  }

  const removeFromQueues = updatedInvoice.status === "auto-approved";

  return {
    ...previous,
    reviewerQueue: replaceInvoiceInList(previous.reviewerQueue, updatedInvoice, {
      remove: removeFromQueues,
    }),
    insights: replaceInvoiceInList(previous.insights, updatedInvoice, {
      remove: removeFromQueues,
    }).slice(0, 4),
  };
}

function updateExceptionsCache(
  previous: ExceptionsResponse | undefined,
  updatedInvoice: (typeof invoiceRecords)[number],
) {
  if (!previous) {
    return previous;
  }

  const matchesSelectedFilter =
    previous.selectedType === "All exceptions" ||
    updatedInvoice.anomalyTypes.includes(previous.selectedType);
  const removeFromExceptions = updatedInvoice.status === "auto-approved" || !matchesSelectedFilter;
  const invoices = replaceInvoiceInList(previous.invoices, updatedInvoice, {
    remove: removeFromExceptions,
  });

  return {
    ...previous,
    invoices,
    summary: {
      highestSeverityCount: invoices.filter((invoice) =>
        invoice.flags.some((flag) => flag.severity === "high"),
      ).length,
      slaBreaches: invoices.filter((invoice) => invoice.agingHours > 24).length,
      evidenceRequests: invoices.filter((invoice) => invoice.status === "needs-evidence").length,
    },
  };
}

function buildFallbackExceptions(selectedType = "All exceptions") {
  const invoices = invoiceRecords.filter((invoice) => {
    if (selectedType === "All exceptions") {
      return invoice.flags.length > 0 || invoice.status !== "auto-approved";
    }

    return invoice.anomalyTypes.includes(selectedType);
  });

  return {
    filterOptions: exceptionTypeOptions,
    selectedType,
    summary: {
      highestSeverityCount: invoices.filter((invoice) =>
        invoice.flags.some((flag) => flag.severity === "high"),
      ).length,
      slaBreaches: invoices.filter((invoice) => invoice.agingHours > 24).length,
      evidenceRequests: invoices.filter((invoice) => invoice.status === "needs-evidence").length,
    },
    invoices,
  };
}

export function useDashboardData() {
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useQuery({
    queryKey: [workspace.key, "dashboard"],
    queryFn: () => getDashboardData(apiContext),
    placeholderData: fallbackData.dashboard,
  });
}

export function useInvoiceData(invoiceId?: string) {
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useQuery({
    queryKey: [workspace.key, "invoice", invoiceId],
    queryFn: () => getInvoiceData(invoiceId!, apiContext),
    enabled: Boolean(invoiceId),
    placeholderData: invoiceId ? getInvoiceById(invoiceId) : undefined,
  });
}

export function useExceptionsData(selectedType = "All exceptions") {
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useQuery({
    queryKey: [workspace.key, "exceptions", selectedType],
    queryFn: () => getExceptionsData(selectedType, apiContext),
    placeholderData: buildFallbackExceptions(selectedType),
  });
}

export function useIngestionData() {
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useQuery({
    queryKey: [workspace.key, "ingestion"],
    queryFn: () => getIngestionData(apiContext),
    placeholderData: fallbackData.ingestion,
  });
}

export function useProcessingData() {
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useQuery({
    queryKey: [workspace.key, "processing"],
    queryFn: () => getProcessingData(apiContext),
    placeholderData: fallbackData.processing,
  });
}

export function useReportsData() {
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useQuery({
    queryKey: [workspace.key, "reports"],
    queryFn: () => getReportsData(apiContext),
    placeholderData: fallbackData.reports,
  });
}

export function useSettingsData() {
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useQuery({
    queryKey: [workspace.key, "settings"],
    queryFn: () => getSettingsData(apiContext),
    placeholderData: fallbackData.settings,
  });
}

export function useInvoiceActionMutation(invoiceId?: string) {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useMutation({
    mutationFn: (payload: { action: InvoiceActionType; actor?: string; note?: string }) =>
      applyInvoiceAction(invoiceId!, payload, apiContext),
    onSuccess: (result) => {
      queryClient.setQueryData([workspace.key, "invoice", invoiceId], result.invoice);
      queryClient.setQueryData([workspace.key, "dashboard"], (previous: DashboardResponse | undefined) =>
        updateDashboardCache(previous, result.invoice),
      );
      queryClient.setQueriesData(
        { queryKey: [workspace.key, "exceptions"] },
        (previous: ExceptionsResponse | undefined) => updateExceptionsCache(previous, result.invoice),
      );
      queryClient.invalidateQueries({ queryKey: [workspace.key, "dashboard"] });
      queryClient.invalidateQueries({ queryKey: [workspace.key, "exceptions"] });
      queryClient.invalidateQueries({ queryKey: [workspace.key, "invoice", invoiceId] });
    },
  });
}

export function useApplyComparisonMutation(invoiceId?: string) {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useMutation({
    mutationFn: (fieldName: string) =>
      applyComparisonSuggestion(invoiceId!, fieldName, apiContext),
    onSuccess: (result) => {
      queryClient.setQueryData([workspace.key, "invoice", invoiceId], result.invoice);
      queryClient.setQueryData([workspace.key, "dashboard"], (previous: DashboardResponse | undefined) =>
        updateDashboardCache(previous, result.invoice),
      );
      queryClient.setQueriesData(
        { queryKey: [workspace.key, "exceptions"] },
        (previous: ExceptionsResponse | undefined) => updateExceptionsCache(previous, result.invoice),
      );
      queryClient.invalidateQueries({ queryKey: [workspace.key, "invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: [workspace.key, "dashboard"] });
      queryClient.invalidateQueries({ queryKey: [workspace.key, "exceptions"] });
    },
  });
}

export function useRuleToggleMutation() {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      updateRuleSetting(name, enabled, apiContext),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [workspace.key, "settings"] });
    },
  });
}

export function useNotificationToggleMutation() {
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      updateNotificationSetting(name, enabled, apiContext),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [workspace.key, "settings"] });
    },
  });
}

export function usePublishRulesMutation() {
  const workspace = useCurrentWorkspace();
  const apiContext = buildApiContext(workspace);

  return useMutation({
    mutationFn: () => publishRuleset(apiContext),
  });
}
