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
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardData,
    placeholderData: fallbackData.dashboard,
  });
}

export function useInvoiceData(invoiceId?: string) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoiceData(invoiceId!),
    enabled: Boolean(invoiceId),
    placeholderData: invoiceId ? getInvoiceById(invoiceId) : undefined,
  });
}

export function useExceptionsData(selectedType = "All exceptions") {
  return useQuery({
    queryKey: ["exceptions", selectedType],
    queryFn: () => getExceptionsData(selectedType),
    placeholderData: buildFallbackExceptions(selectedType),
  });
}

export function useIngestionData() {
  return useQuery({
    queryKey: ["ingestion"],
    queryFn: getIngestionData,
    placeholderData: fallbackData.ingestion,
  });
}

export function useProcessingData() {
  return useQuery({
    queryKey: ["processing"],
    queryFn: getProcessingData,
    placeholderData: fallbackData.processing,
  });
}

export function useReportsData() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: getReportsData,
    placeholderData: fallbackData.reports,
  });
}

export function useSettingsData() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: getSettingsData,
    placeholderData: fallbackData.settings,
  });
}

export function useInvoiceActionMutation(invoiceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { action: InvoiceActionType; actor?: string; note?: string }) =>
      applyInvoiceAction(invoiceId!, payload),
    onSuccess: (result) => {
      queryClient.setQueryData(["invoice", invoiceId], result.invoice);
      queryClient.setQueryData(["dashboard"], (previous: DashboardResponse | undefined) =>
        updateDashboardCache(previous, result.invoice),
      );
      queryClient.setQueriesData(
        { queryKey: ["exceptions"] },
        (previous: ExceptionsResponse | undefined) => updateExceptionsCache(previous, result.invoice),
      );
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
}

export function useApplyComparisonMutation(invoiceId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fieldName: string) => applyComparisonSuggestion(invoiceId!, fieldName),
    onSuccess: (result) => {
      queryClient.setQueryData(["invoice", invoiceId], result.invoice);
      queryClient.setQueryData(["dashboard"], (previous: DashboardResponse | undefined) =>
        updateDashboardCache(previous, result.invoice),
      );
      queryClient.setQueriesData(
        { queryKey: ["exceptions"] },
        (previous: ExceptionsResponse | undefined) => updateExceptionsCache(previous, result.invoice),
      );
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
    },
  });
}

export function useRuleToggleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      updateRuleSetting(name, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useNotificationToggleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      updateNotificationSetting(name, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function usePublishRulesMutation() {
  return useMutation({
    mutationFn: publishRuleset,
  });
}
