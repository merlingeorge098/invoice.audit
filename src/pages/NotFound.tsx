import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { demoPaths, entryPath } from "@/lib/workspace";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <AppShell
      eyebrow="Route Error"
      title="This workspace route does not exist"
      description="The requested URL is not part of the invoice assurance application."
    >
      <div className="rounded-3xl border border-border/70 bg-card/90 p-8">
        <p className="font-heading text-5xl font-semibold tracking-tight text-foreground">404</p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Try returning to the dashboard or re-opening the secure sign-in screen to restart the
          workflow from a known page.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="hero" className="rounded-xl">
            <Link to={demoPaths.dashboard}>Go to demo dashboard</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to={entryPath}>Go to entry page</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
};

export default NotFound;
