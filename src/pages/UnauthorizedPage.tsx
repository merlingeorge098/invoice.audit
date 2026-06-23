import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth-session-context";
import { entryPath, tenantPaths, authPaths } from "@/lib/workspace";
import { ShieldAlert, LogOut, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const UnauthorizedPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, clearSession } = useAuthSession();
  const blockedPath = location.state?.blockedTenantPath || "another tenant's area";

  useEffect(() => {
    console.warn(
      `Access Denied: User ${session?.email || "anonymous"} attempted to access unauthorized path:`,
      blockedPath
    );
  }, [blockedPath, session]);

  const handleSignOut = () => {
    clearSession();
    toast.success("Successfully signed out of the workspace.");
    navigate(authPaths.start);
  };

  return (
    <AppShell
      eyebrow="Security Guard"
      title="Access Denied"
      description="You do not have permission to view this corporate workspace tenant."
    >
      <div className="rounded-3xl border border-destructive/20 bg-card/90 p-8 shadow-lg shadow-destructive/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive animate-pulse">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="font-heading text-xl font-semibold tracking-tight text-foreground">
              Workspace Isolation Triggered
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Requested path: <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-destructive">{blockedPath}</span>
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-border/50 pt-6">
          <p className="text-sm leading-6 text-muted-foreground">
            {session ? (
              <>
                You are currently signed in as <strong className="text-foreground">{session.displayName || session.email}</strong> under the organization <strong className="text-foreground">{session.organizationName}</strong>. You cannot access pages outside of your tenant environment (<code className="text-xs bg-muted px-1.5 py-0.5 rounded">{session.tenantSlug}</code>).
              </>
            ) : (
              "No active authenticated enterprise session was detected for this workspace."
            )}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {session ? (
            <Button asChild variant="hero" className="rounded-xl flex items-center gap-2">
              <Link to={tenantPaths.dashboard(session.tenantSlug)}>
                <ArrowLeft className="h-4 w-4" />
                Go to my dashboard
              </Link>
            </Button>
          ) : (
            <Button asChild variant="hero" className="rounded-xl">
              <Link to={authPaths.start}>Sign In</Link>
            </Button>
          )}

          {session && (
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="rounded-xl flex items-center gap-2 border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out / Switch account
            </Button>
          )}

          <Button asChild variant="ghost" className="rounded-xl">
            <Link to={entryPath}>Back to product home</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
};

export default UnauthorizedPage;
