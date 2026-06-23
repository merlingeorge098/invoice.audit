import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrentWorkspace } from "@/lib/workspace-context";
import { getApiKeys, createApiKey, revokeApiKey, type ApiKey, type ApiWorkspaceContext } from "@/lib/api";

export default function APIKeysPage() {
  const workspace = useCurrentWorkspace();
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [revealedKey, setRevealedKey] = useState<{ id: string; rawKey: string } | null>(null);

  const context: ApiWorkspaceContext | undefined = workspace.mode === "enterprise"
    ? { mode: "enterprise", tenantSlug: workspace.tenantSlug ?? undefined, sessionToken: workspace.session?.sessionToken ?? undefined }
    : undefined;

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys", workspace.tenantSlug],
    queryFn: () => getApiKeys(context),
    enabled: workspace.mode === "enterprise",
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () => createApiKey({ label: newLabel.trim(), expiresAt: newExpiry || undefined }, context),
    onSuccess: (data) => {
      setRevealedKey({ id: data.id, rawKey: data.rawKey });
      setNewLabel("");
      setNewExpiry("");
      toast.success("API key created. Copy it now — it won't be shown again.");
      queryClient.invalidateQueries({ queryKey: ["api-keys", workspace.tenantSlug] });
    },
    onError: () => toast.error("Failed to create API key."),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeApiKey(id, context),
    onSuccess: () => {
      toast.success("API key revoked.");
      queryClient.invalidateQueries({ queryKey: ["api-keys", workspace.tenantSlug] });
    },
    onError: () => toast.error("Failed to revoke API key."),
  });

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <AppShell
      title="API Keys"
      description="Create and manage API keys for programmatic invoice ingestion via the API intake endpoint."
      eyebrow="Developer Settings"
    >
      <div className="space-y-8 max-w-3xl">
        {/* Create new key */}
        <Card className="rounded-3xl border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-xl">
              <Plus className="h-5 w-5 text-primary" />
              Create new API key
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="key-label">Label</Label>
                <Input
                  id="key-label"
                  placeholder="e.g. ERP Integration, CI Pipeline"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="key-expiry">Expires on (optional)</Label>
                <Input
                  id="key-expiry"
                  type="date"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="rounded-xl"
                />
              </div>
            </div>
            <Button
              variant="hero"
              className="rounded-xl gap-2"
              disabled={!newLabel.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <Key className="h-4 w-4" />
              {createMutation.isPending ? "Creating…" : "Create API key"}
            </Button>

            {/* Reveal raw key once */}
            {revealedKey && (
              <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 space-y-2">
                <p className="text-xs font-semibold text-teal-800">
                  Copy this key now — it will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-white border border-teal-200 px-3 py-2 text-xs font-mono text-teal-900">
                    {revealedKey.rawKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg shrink-0"
                    onClick={() => { navigator.clipboard.writeText(revealedKey.rawKey); toast.success("Copied!"); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-teal-700">
                  Send this key in the <code className="bg-teal-100 px-1 rounded">X-Api-Key</code> header when calling{" "}
                  <code className="bg-teal-100 px-1 rounded">POST /api/invoices/api-intake</code>.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Existing keys */}
        <Card className="rounded-3xl border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-xl">
              <Key className="h-5 w-5 text-primary" />
              Active keys
              {keys.length > 0 && <Badge variant="secondary">{keys.filter(k => !k.revokedAt).length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API keys yet. Create one above to start using the API intake endpoint.</p>
            ) : (
              <div className="divide-y rounded-2xl border border-border overflow-hidden">
                {keys.map((key) => (
                  <div key={key.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 bg-card">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{key.label}</p>
                        {key.revokedAt ? (
                          <Badge variant="destructive" className="text-xs">Revoked</Badge>
                        ) : key.expiresAt && new Date(key.expiresAt) < new Date() ? (
                          <Badge variant="secondary" className="text-xs">Expired</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-800">Active</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {key.keyPrefix}••••••••••••••••••••••••
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDate(key.createdAt)}
                        {key.expiresAt ? ` · Expires ${formatDate(key.expiresAt)}` : " · No expiry"}
                        {key.lastUsedAt ? ` · Last used ${formatDate(key.lastUsedAt)}` : " · Never used"}
                      </p>
                    </div>
                    {!key.revokedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-1.5 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                        disabled={revokeMutation.isPending}
                        onClick={() => {
                          if (confirm(`Revoke key "${key.label}"? Any integrations using it will stop working immediately.`)) {
                            revokeMutation.mutate(key.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage instructions */}
        <Card className="rounded-3xl border-border/70 bg-slate-950 text-white">
          <CardHeader>
            <CardTitle className="font-heading text-xl text-white">How to use the API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <p>Send a structured invoice payload to the intake endpoint:</p>
            <pre className="rounded-xl bg-slate-800 p-4 text-xs overflow-x-auto">{`POST /api/invoices/api-intake
X-Api-Key: ia_your_key_here
Content-Type: application/json

{
  "invoiceNumber": "INV-2024-001",
  "vendorName": "Acme Supplies",
  "amount": 150000,
  "invoiceDate": "2024-06-01",
  "dueDate": "2024-06-30",
  "poNumber": "PO-2024-045",
  "lineItems": [
    { "description": "Office supplies", "quantity": 10, "unitPrice": 15000, "total": 150000 }
  ]
}`}</pre>
            <p className="text-slate-400 text-xs">The invoice is immediately queued for validation and risk scoring. Poll <code className="bg-slate-800 px-1 rounded">GET /api/invoices/:id/status</code> for processing updates.</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
