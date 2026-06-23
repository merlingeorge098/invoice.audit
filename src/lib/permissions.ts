import { useCurrentWorkspace } from "@/lib/workspace-context";

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard:view",
  EXCEPTIONS_VIEW: "exceptions:view",
  INVOICE_VIEW: "invoice:view",
  INVOICE_UPLOAD: "invoice:upload",
  INVOICE_APPROVE: "invoice:approve",
  INVOICE_ASSIGN: "invoice:assign",
  INVOICE_ESCALATE: "invoice:escalate",
  INVOICE_REQUEST_EVIDENCE: "invoice:request-evidence",
  INVOICE_APPLY_CORRECTION: "invoice:apply-correction",
  INVOICE_OVERRIDE_POLICY: "invoice:override-policy",
  REPORTS_VIEW: "reports:view",
  SETTINGS_VIEW: "settings:view",
  SETTINGS_MANAGE: "settings:manage",
  IDENTITY_MANAGE: "identity:manage",
  AUDIT_VIEW: "audit:view",
  RECONCILIATION_VIEW: "reconciliation:view",
  BILLING_MANAGE: "billing:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function usePermissions() {
  const workspace = useCurrentWorkspace();

  // Demo workspace: show everything so the product tour works fully
  if (workspace.mode === "demo") {
    return {
      can: (_p: Permission) => true,
      canAny: (..._ps: Permission[]) => true,
      role: null,
      permissions: Object.values(PERMISSIONS) as string[],
      isDemo: true,
    };
  }

  const permissions: string[] = workspace.session?.permissions ?? [];
  const role = workspace.session?.role ?? null;

  function can(permission: Permission): boolean {
    return permissions.includes(permission);
  }

  function canAny(...perms: Permission[]): boolean {
    return perms.some((p) => permissions.includes(p));
  }

  return { can, canAny, role, permissions, isDemo: false };
}
