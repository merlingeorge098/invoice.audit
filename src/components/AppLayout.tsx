import { type ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronUp,
  FileSearch,
  FileSpreadsheet,
  LayoutDashboard,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useCurrentWorkspace } from "@/lib/workspace-context";
import { entryPath, workspaceEntryPath, tenantPaths } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { getNotifications } from "@/lib/api";
import { usePermissions, PERMISSIONS } from "@/lib/permissions";

interface AppShellProps {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}

// Persists which sidebar groups are open across navigations
function useOpenGroups(defaultOpen: string[]) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("invoice-audit.nav-groups");
      return stored ? new Set(JSON.parse(stored)) : new Set(defaultOpen);
    } catch {
      return new Set(defaultOpen);
    }
  });

  const toggle = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        localStorage.setItem("invoice-audit.nav-groups", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const ensureOpen = (label: string) => {
    setOpenGroups((prev) => {
      if (prev.has(label)) return prev;
      const next = new Set(prev);
      next.add(label);
      try {
        localStorage.setItem("invoice-audit.nav-groups", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  return { openGroups, toggle, ensureOpen };
}

export function AppShell({ title, description, children, actions, eyebrow }: AppShellProps) {
  const location = useLocation();
  const workspace = useCurrentWorkspace();
  const inDemoWorkspace = workspace.mode === "demo";
  const tenantPrefix = workspace.tenantSlug ? `/app/${workspace.tenantSlug}` : "/demo";

  const context = workspace.mode === "enterprise"
    ? { mode: "enterprise" as const, tenantSlug: workspace.tenantSlug ?? undefined, sessionToken: workspace.session?.sessionToken ?? undefined }
    : undefined;

  const { data: notifData } = useQuery({
    queryKey: ["notifications", "unread", workspace.tenantSlug],
    queryFn: () => getNotifications(context),
    enabled: workspace.mode === "enterprise",
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unreadCount = notifData?.unreadCount ?? 0;
  const { can } = usePermissions();

  // Build nav groups — each group is collapsible
  type NavItem = {
    to: string;
    label: string;
    icon: React.ElementType;
    matches: string[];
    badge?: number;
  };

  type NavGroup = {
    label: string;
    items: NavItem[];
  };

  const navGroups: NavGroup[] = [
    {
      label: "Operations",
      items: [
        {
          to: workspace.paths.dashboard,
          label: "Dashboard",
          icon: LayoutDashboard,
          matches: [
            workspace.paths.dashboard,
            `${tenantPrefix}/invoice`,
            `${tenantPrefix}/comparison`,
            workspace.paths.processing,
          ],
        },
        {
          to: workspace.paths.upload,
          label: "Ingestion",
          icon: Upload,
          matches: [workspace.paths.upload],
        },
        {
          to: workspace.paths.exceptions,
          label: "Exceptions",
          icon: ShieldAlert,
          matches: [workspace.paths.exceptions],
        },
      ],
    },
    ...(can(PERMISSIONS.REPORTS_VIEW) || can(PERMISSIONS.RECONCILIATION_VIEW) ? [{
      label: "Insights",
      items: [
        ...(can(PERMISSIONS.REPORTS_VIEW) ? [{
          to: workspace.paths.reports,
          label: "Analytics",
          icon: BarChart3,
          matches: [workspace.paths.reports],
        }] : []),
        ...(can(PERMISSIONS.RECONCILIATION_VIEW) ? [{
          to: workspace.paths.reconciliation,
          label: "GST Reconciliation",
          icon: FileSpreadsheet,
          matches: [workspace.paths.reconciliation],
        }] : []),
      ] as NavItem[],
    }] : []),
    ...(workspace.mode === "enterprise" && workspace.tenantSlug ? [{
      label: "Compliance",
      items: [
        ...(can(PERMISSIONS.AUDIT_VIEW) ? [{
          to: tenantPaths.audit(workspace.tenantSlug!),
          label: "Audit Trail",
          icon: ShieldCheck,
          matches: [tenantPaths.audit(workspace.tenantSlug!)],
        }] : []),
        {
          to: tenantPaths.notifications(workspace.tenantSlug!),
          label: "Notifications",
          icon: Bell,
          matches: [tenantPaths.notifications(workspace.tenantSlug!)],
          badge: unreadCount > 0 ? unreadCount : undefined,
        },
      ] as NavItem[],
    }] : []),
  ];

  const { openGroups, toggle, ensureOpen } = useOpenGroups(
    navGroups.map((g) => g.label),
  );

  // Auto-expand the group containing the active route
  useEffect(() => {
    for (const group of navGroups) {
      const groupHasActive = group.items.some((item) =>
        item.matches.some((path) => location.pathname.startsWith(path)),
      );
      if (groupHasActive) ensureOpen(group.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Flat list for mobile top nav (groups + Controls)
  const allNavItems = [
    ...navGroups.flatMap((g) => g.items),
    {
      to: workspace.paths.settings,
      label: "Controls",
      icon: Settings2,
      matches: [workspace.paths.settings],
      badge: undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.12),_transparent_30%),linear-gradient(180deg,_rgba(247,250,252,1),_rgba(241,245,249,1))]" />
      <div className="lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden h-screen border-r border-border/70 bg-slate-950 px-6 py-7 text-slate-100 lg:sticky lg:top-0 lg:flex lg:flex-col">
          <Link to={workspace.paths.dashboard} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#14b8a6,#0f766e)] shadow-[0_16px_40px_-24px_rgba(20,184,166,0.8)]">
              <FileSearch className="h-5 w-5" />
            </div>
            <div>
              <p className="font-heading text-lg font-semibold tracking-tight">Invoice.Audit</p>
              <p className="text-xs text-slate-400">{workspace.label}</p>
            </div>
          </Link>

          <div className="mt-6 rounded-3xl border border-teal-400/20 bg-teal-400/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
              {inDemoWorkspace ? "Demo Workspace" : "Enterprise Workspace"}
            </p>
            <p className="mt-2 text-sm text-slate-200">{workspace.dataSource}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{workspace.description}</p>
            {workspace.mode === "enterprise" && workspace.session?.role ? (
              <span className="mt-3 inline-block rounded-full bg-teal-500/20 px-2.5 py-0.5 text-xs font-semibold text-teal-300">
                {workspace.session.role}
              </span>
            ) : null}
          </div>

          {/* Collapsible nav groups */}
          <nav className="mt-8 flex-1 space-y-1 overflow-y-auto">
            {navGroups.map((group) => {
              const isOpen = openGroups.has(group.label);
              const groupHasActive = group.items.some((item) =>
                item.matches.some((path) => location.pathname.startsWith(path)),
              );

              return (
                <div key={group.label}>
                  <button
                    onClick={() => toggle(group.label)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                      groupHasActive
                        ? "text-teal-300"
                        : "text-slate-400 hover:text-slate-200",
                    )}
                  >
                    <span className="flex-1 text-left">{group.label}</span>
                    <div className="flex flex-col items-center gap-[1px]">
                      <ChevronUp
                        className={cn(
                          "h-3 w-3 transition-opacity",
                          isOpen ? "opacity-60" : "opacity-30",
                        )}
                      />
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-opacity",
                          !isOpen ? "opacity-60" : "opacity-30",
                        )}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mb-1 ml-3 space-y-0.5 border-l border-white/10 pl-2">
                      {group.items.map((item) => {
                        const active = item.matches.some((path) =>
                          location.pathname.startsWith(path),
                        );
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                              active
                                ? "bg-white/10 text-white"
                                : "text-slate-300 hover:bg-white/5 hover:text-white",
                            )}
                          >
                            <item.icon className="h-4 w-4 flex-none" />
                            <span className="flex-1">{item.label}</span>
                            {item.badge ? (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-medium text-white">
                                {item.badge > 99 ? "99+" : item.badge}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Controls link (settings overview) */}
            {(() => {
              const active = location.pathname.startsWith(workspace.paths.settings);
              return (
                <Link
                  to={workspace.paths.settings}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Settings2 className="h-4 w-4 flex-none" />
                  <span className="flex-1">Controls</span>
                </Link>
              );
            })()}
          </nav>

          {/* Settings sub-nav for enterprise */}
          {workspace.mode === "enterprise" && workspace.tenantSlug && can(PERMISSIONS.SETTINGS_VIEW) ? (
            <div className="mt-4 space-y-1 border-t border-white/10 pt-4">
              <p className="px-4 text-xs font-semibold uppercase tracking-widest text-slate-500">Settings</p>
              {[
                ...(can(PERMISSIONS.BILLING_MANAGE) ? [{ to: tenantPaths.billing(workspace.tenantSlug), label: "Billing" }] : []),
                ...(can(PERMISSIONS.SETTINGS_MANAGE) ? [
                  { to: tenantPaths.team(workspace.tenantSlug), label: "Team" },
                  { to: tenantPaths.vendors(workspace.tenantSlug), label: "Vendor Master" },
                  { to: tenantPaths.erp(workspace.tenantSlug), label: "ERP Connectors" },
                  { to: tenantPaths.apiKeys(workspace.tenantSlug), label: "API Keys" },
                ] : []),
              ].map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-2 text-xs transition-colors",
                      active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
              Control Coverage
            </p>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl bg-white/5 px-3 py-2">Ingestion, OCR, and enrichment live</div>
              <div className="rounded-2xl bg-white/5 px-3 py-2">Validation, risk, and workflow visible</div>
              <div className="rounded-2xl bg-white/5 px-3 py-2">Audit trail and evidence always attached</div>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
            <div className="px-4 py-4 md:px-8 xl:px-10">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  {eyebrow ? (
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{eyebrow}</p>
                  ) : null}
                  <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight text-foreground">
                    {title}
                  </h1>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {workspace.mode === "enterprise" && workspace.tenantSlug ? (
                    <Link
                      to={tenantPaths.notifications(workspace.tenantSlug)}
                      className="relative flex items-center justify-center h-9 w-9 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Bell className="h-4 w-4" />
                      {unreadCount > 0 ? (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground md:flex">
                      <Bell className="h-3.5 w-3.5 text-primary" />
                      {inDemoWorkspace ? "Shared demo workspace" : `${workspace.session?.role ?? "Workspace user"} access`}
                    </div>
                  )}
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to={inDemoWorkspace ? entryPath : workspaceEntryPath}>
                      {inDemoWorkspace ? "Back to Entry" : "Session Details"}
                    </Link>
                  </Button>
                  {actions}
                </div>
              </div>

              {inDemoWorkspace ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  You are exploring the shared demo workspace. The workflow is real, but the data is
                  seeded sample enterprise content.
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
                  You are inside {workspace.label}. Tenant routing is active for{" "}
                  {workspace.session?.email}.
                </div>
              )}

              {/* Mobile horizontal nav */}
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {allNavItems.map((item) => {
                  const active = item.matches.some((path) => location.pathname.startsWith(path));
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "relative whitespace-nowrap rounded-full px-4 py-2 text-sm",
                        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                      )}
                    >
                      {item.label}
                      {item.badge ? (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-8 md:py-8 xl:px-10">{children}</main>
        </div>
      </div>
    </div>
  );
}
