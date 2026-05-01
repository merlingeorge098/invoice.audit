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
  invoice: (invoiceId: string) => `/demo/invoice/${invoiceId}`,
  comparison: (invoiceId: string) => `/demo/comparison/${invoiceId}`,
} as const;

export const tenantPaths = {
  root: (tenantSlug: string) => `/app/${tenantSlug}`,
  dashboard: (tenantSlug: string) => `/app/${tenantSlug}/dashboard`,
} as const;

export function isDemoPath(pathname: string) {
  return pathname === demoPaths.root || pathname.startsWith(`${demoPaths.root}/`);
}
