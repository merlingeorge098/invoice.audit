import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  FileSearch,
  LayoutDashboard,
  Settings2,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoPaths, demoWorkspace, entryPath, isDemoPath, workspaceEntryPath } from "@/lib/workspace";
import { cn } from "@/lib/utils";

const navItems = [
  {
    to: demoPaths.dashboard,
    label: "Operations",
    icon: LayoutDashboard,
    matches: [demoPaths.dashboard, "/demo/invoice", "/demo/comparison", demoPaths.processing],
  },
  {
    to: demoPaths.upload,
    label: "Ingestion",
    icon: Upload,
    matches: [demoPaths.upload],
  },
  {
    to: demoPaths.exceptions,
    label: "Exceptions",
    icon: ShieldAlert,
    matches: [demoPaths.exceptions],
  },
  {
    to: demoPaths.reports,
    label: "Analytics",
    icon: BarChart3,
    matches: [demoPaths.reports],
  },
  {
    to: demoPaths.settings,
    label: "Controls",
    icon: Settings2,
    matches: [demoPaths.settings],
  },
];

interface AppShellProps {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}

export function AppShell({ title, description, children, actions, eyebrow }: AppShellProps) {
  const location = useLocation();
  const inDemoWorkspace = isDemoPath(location.pathname);

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.12),_transparent_30%),linear-gradient(180deg,_rgba(247,250,252,1),_rgba(241,245,249,1))]" />
      <div className="lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="hidden h-screen border-r border-border/70 bg-slate-950 px-6 py-7 text-slate-100 lg:sticky lg:top-0 lg:flex lg:flex-col">
          <Link to={demoPaths.dashboard} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#14b8a6,#0f766e)] shadow-[0_16px_40px_-24px_rgba(20,184,166,0.8)]">
              <FileSearch className="h-5 w-5" />
            </div>
            <div>
              <p className="font-heading text-lg font-semibold tracking-tight">Invoice.Audit</p>
              <p className="text-xs text-slate-400">
                {inDemoWorkspace ? demoWorkspace.label : "Control-first AP assurance"}
              </p>
            </div>
          </Link>

          {inDemoWorkspace ? (
            <div className="mt-6 rounded-3xl border border-teal-400/20 bg-teal-400/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
                {demoWorkspace.label}
              </p>
              <p className="mt-2 text-sm text-slate-200">{demoWorkspace.dataSource}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{demoWorkspace.description}</p>
            </div>
          ) : null}

          <div className="mt-10 space-y-2">
            {navItems.map((item) => {
              const active = item.matches.some((path) => location.pathname.startsWith(path));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-5">
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
                  <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground md:flex">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    {inDemoWorkspace ? "Shared demo workspace" : "4 escalations need attention"}
                  </div>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to={inDemoWorkspace ? entryPath : workspaceEntryPath}>
                      {inDemoWorkspace ? "Back to Entry" : "Enter Your Workspace"}
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
              ) : null}

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
                {navItems.map((item) => {
                  const active = item.matches.some((path) => location.pathname.startsWith(path));
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "whitespace-nowrap rounded-full px-4 py-2 text-sm",
                        active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                      )}
                    >
                      {item.label}
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
