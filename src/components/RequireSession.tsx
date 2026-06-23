import type { ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useAuthSession } from "@/lib/auth-session-context";
import { authPaths } from "@/lib/workspace";

export function RequireSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { tenantSlug } = useParams();
  const { session } = useAuthSession();

  if (!session) {
    return <Navigate to={authPaths.start} replace state={{ from: location.pathname }} />;
  }

  if (!tenantSlug || tenantSlug !== session.tenantSlug) {
    return (
      <Navigate
        to="/unauthorized"
        replace
        state={{ blockedTenantPath: location.pathname }}
      />
    );
  }

  return <>{children}</>;
}
