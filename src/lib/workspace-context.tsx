import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuthSession } from "@/lib/auth-session-context";
import {
  buildWorkspacePaths,
  demoWorkspace,
  isDemoPath,
  isTenantPath,
} from "@/lib/workspace";

export type WorkspaceMode = "demo" | "enterprise";

export function useCurrentWorkspace() {
  const location = useLocation();
  const { tenantSlug: routeTenantSlug } = useParams();
  const { session } = useAuthSession();
  const tenantSlug = routeTenantSlug ?? session?.tenantSlug;
  const mode: WorkspaceMode = isTenantPath(location.pathname) ? "enterprise" : "demo";
  const paths = useMemo(
    () => buildWorkspacePaths(mode === "enterprise" ? tenantSlug : undefined),
    [mode, tenantSlug],
  );

  if (mode === "enterprise" && session && tenantSlug === session.tenantSlug) {
    return {
      mode,
      paths,
      key: `enterprise:${session.tenantSlug}`,
      tenantSlug: session.tenantSlug,
      label: session.workspaceName,
      dataSource: `${session.organizationName} tenant workspace`,
      description: `${session.displayName} is signed in as ${session.role}.`,
      session,
    } as const;
  }

  return {
    mode: "demo" as const,
    paths: buildWorkspacePaths(),
    key: "demo",
    tenantSlug: null,
    label: demoWorkspace.label,
    dataSource: demoWorkspace.dataSource,
    description: demoWorkspace.description,
    session: null,
    inDemoWorkspace: isDemoPath(location.pathname),
  };
}
