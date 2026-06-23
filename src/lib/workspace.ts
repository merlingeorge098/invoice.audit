export const demoWorkspace = {
  mode: "demo" as const,
  id: "shared-enterprise-demo",
  name: "Shared Enterprise Demo",
  label: "Demo Workspace",
  dataSource: "Seeded enterprise invoice data",
  description:
    "Explore the guided product experience with curated sample invoices, controls, exceptions, and audit history.",
};

export const entryPath = "/";
export const authPaths = {
  start: "/auth/start",
  callback: "/auth/callback",
} as const;

export const workspaceEntryPath = authPaths.start;

export const demoPaths = {
  root: "/demo",
  dashboard: "/demo/dashboard",
  upload: "/demo/upload",
  processing: "/demo/processing",
  exceptions: "/demo/exceptions",
  reports: "/demo/reports",
  settings: "/demo/settings",
  reconciliation: "/demo/reconciliation",
  invoice: (invoiceId: string) => `/demo/invoice/${invoiceId}`,
  comparison: (invoiceId: string) => `/demo/comparison/${invoiceId}`,
} as const;

export const tenantPaths = {
  root: (tenantSlug: string) => `/app/${tenantSlug}`,
  dashboard: (tenantSlug: string) => `/app/${tenantSlug}/dashboard`,
  upload: (tenantSlug: string) => `/app/${tenantSlug}/upload`,
  processing: (tenantSlug: string) => `/app/${tenantSlug}/processing`,
  exceptions: (tenantSlug: string) => `/app/${tenantSlug}/exceptions`,
  reports: (tenantSlug: string) => `/app/${tenantSlug}/reports`,
  settings: (tenantSlug: string) => `/app/${tenantSlug}/settings`,
  reconciliation: (tenantSlug: string) => `/app/${tenantSlug}/reconciliation`,
  billing: (tenantSlug: string) => `/app/${tenantSlug}/settings/billing`,
  team: (tenantSlug: string) => `/app/${tenantSlug}/settings/team`,
  vendors: (tenantSlug: string) => `/app/${tenantSlug}/settings/vendors`,
  audit: (tenantSlug: string) => `/app/${tenantSlug}/audit`,
  notifications: (tenantSlug: string) => `/app/${tenantSlug}/notifications`,
  erp: (tenantSlug: string) => `/app/${tenantSlug}/settings/erp`,
  apiKeys: (tenantSlug: string) => `/app/${tenantSlug}/settings/api-keys`,
  invoice: (tenantSlug: string, invoiceId: string) => `/app/${tenantSlug}/invoice/${invoiceId}`,
  comparison: (tenantSlug: string, invoiceId: string) =>
    `/app/${tenantSlug}/comparison/${invoiceId}`,
} as const;

export function isDemoPath(pathname: string) {
  return pathname === demoPaths.root || pathname.startsWith(`${demoPaths.root}/`);
}

export function isTenantPath(pathname: string) {
  return pathname.startsWith("/app/");
}

export function buildWorkspacePaths(tenantSlug?: string) {
  if (!tenantSlug) {
    return demoPaths;
  }

  return {
    root: tenantPaths.root(tenantSlug),
    dashboard: tenantPaths.dashboard(tenantSlug),
    upload: tenantPaths.upload(tenantSlug),
    processing: tenantPaths.processing(tenantSlug),
    exceptions: tenantPaths.exceptions(tenantSlug),
    reports: tenantPaths.reports(tenantSlug),
    settings: tenantPaths.settings(tenantSlug),
    reconciliation: tenantPaths.reconciliation(tenantSlug),
    invoice: (invoiceId: string) => tenantPaths.invoice(tenantSlug, invoiceId),
    comparison: (invoiceId: string) => tenantPaths.comparison(tenantSlug, invoiceId),
  };
}
