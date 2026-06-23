import type { ReactNode } from "react";
import { usePermissions, type Permission } from "@/lib/permissions";

interface IfAllowedProps {
  permission: Permission;
  children: ReactNode;
  /** Rendered when the user lacks the permission. Defaults to nothing. */
  fallback?: ReactNode;
}

/**
 * Renders children only when the current session has the required permission.
 * In demo mode, always renders children.
 *
 * Usage:
 *   <IfAllowed permission="invoice:approve">
 *     <Button>Approve</Button>
 *   </IfAllowed>
 *
 *   <IfAllowed permission="settings:manage" fallback={<p>Contact your Admin.</p>}>
 *     <TeamManagementPanel />
 *   </IfAllowed>
 */
export function IfAllowed({ permission, children, fallback = null }: IfAllowedProps) {
  const { can } = usePermissions();
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}
