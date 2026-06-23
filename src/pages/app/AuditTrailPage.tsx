import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Shield, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppLayout";
import { getAuditTrail, API_BASE } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/workspace-context";

export default function AuditTrailPage() {
  const workspace = useCurrentWorkspace();
  const [page, setPage] = useState(1);
  const context = workspace.mode === "enterprise"
    ? { mode: "enterprise" as const, tenantSlug: workspace.tenantSlug ?? undefined, sessionToken: workspace.session?.sessionToken ?? undefined }
    : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["audit", "trail", workspace.tenantSlug, page],
    queryFn: () => getAuditTrail(page, context),
    enabled: workspace.mode === "enterprise",
  });

  function handleExport() {
    const token = workspace.session?.sessionToken ?? "";
    const slug = workspace.tenantSlug ?? "";
    window.open(
      `${API_BASE}/audit/export?tenantSlug=${slug}`,
      "_blank",
    );
  }

  return (
    <AppShell
      eyebrow="Compliance"
      title="Audit Trail"
      description="Tamper-evident log of all actions. Every event is HMAC-signed and verified on display."
      actions={
        <Button variant="outline" className="rounded-xl" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Export NDJSON
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Event log
            {data ? (
              <Badge variant="secondary">{data.total} events</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading audit trail…</p>
          ) : !data?.events?.length ? (
            <p className="text-sm text-muted-foreground">No audit events yet.</p>
          ) : (
            <>
              <div className="divide-y">
                {data.events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-4 py-4">
                    <div className="mt-0.5 flex-none">
                      {ev.hmacValid === false ? (
                        <XCircle className="h-4 w-4 text-rose-500" title="HMAC verification failed — possible tampering" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-teal-500" title="HMAC verified" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{ev.actor}</span>
                        <Badge variant="outline" className="font-mono text-xs">{ev.action}</Badge>
                        {ev.invoiceId ? (
                          <span className="text-xs text-muted-foreground font-mono">#{ev.invoiceId.slice(0, 8)}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{ev.detail}</p>
                    </div>
                    <div className="flex-none text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(ev.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {data.pages > 1 ? (
                <div className="mt-6 flex items-center justify-between">
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {data.page} of {data.pages}
                  </span>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                    disabled={page >= data.pages}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
