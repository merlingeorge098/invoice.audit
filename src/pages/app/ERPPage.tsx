import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppLayout";
import { useCurrentWorkspace } from "@/lib/workspace-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { type ApiWorkspaceContext, API_BASE } from "@/lib/api";
import { apiRequest } from "@/lib/api";
import { readStoredEnterpriseSession } from "@/lib/auth";
import {
  Upload,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  Plug,
  Settings2,
  Download,
} from "lucide-react";

interface ErpConfig {
  erpWebhookUrl: string | null;
  hasApiKey: boolean;
}

interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created: number;
    updated?: number;
    skipped?: number;
    errors: number;
  };
  errors: { row: number; reason: string }[];
}

interface SyncLog {
  id: string;
  syncedAt: string;
  status: string;
  recordCount: number;
  errorMessage?: string;
}

// These functions accept a context so the enterprise session headers are included
async function getErpConfigApi(context?: import("@/lib/api").ApiWorkspaceContext): Promise<ErpConfig> {
  return apiRequest("/erp/config", undefined, context);
}

async function saveErpConfigApi(
  data: { erpWebhookUrl: string; erpApiKey?: string },
  context?: import("@/lib/api").ApiWorkspaceContext,
) {
  return apiRequest("/erp/config", { method: "PUT", body: JSON.stringify(data) }, context);
}

async function importCsv(endpoint: string, file: File): Promise<ImportResult> {
  const session = readStoredEnterpriseSession();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/erp/${endpoint}`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: {
      "X-Workspace-Mode": "enterprise",
      ...(session?.sessionToken ? { "X-Session-Token": session.sessionToken } : {}),
      ...(session?.tenantSlug ? { "X-Tenant-Slug": session.tenantSlug } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Import failed: ${res.statusText}`);
  }
  return res.json();
}

async function getSyncHistoryApi(context?: import("@/lib/api").ApiWorkspaceContext): Promise<SyncLog[]> {
  return apiRequest("/erp/sync-history", undefined, context);
}

export default function ERPPage() {
  const { tenantSlug = "" } = useParams();
  const workspace = useCurrentWorkspace();
  const context = workspace.mode === "enterprise"
    ? { mode: "enterprise" as const, tenantSlug: workspace.tenantSlug ?? undefined, sessionToken: (workspace as any).session?.sessionToken ?? undefined }
    : undefined;
  const { toast } = useToast();
  const qc = useQueryClient();

  const vendorFileRef = useRef<HTMLInputElement>(null);
  const poFileRef = useRef<HTMLInputElement>(null);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [vendorResult, setVendorResult] = useState<ImportResult | null>(null);
  const [poResult, setPoResult] = useState<ImportResult | null>(null);
  const [importingVendors, setImportingVendors] = useState(false);
  const [importingPOs, setImportingPOs] = useState(false);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["erp-config", tenantSlug],
    queryFn: () => getErpConfigApi(context),
    onSuccess: (d: ErpConfig) => { if (d.erpWebhookUrl) setWebhookUrl(d.erpWebhookUrl); },
    enabled: workspace.mode === "enterprise",
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ["erp-sync-history", tenantSlug],
    queryFn: () => getSyncHistoryApi(context),
    refetchInterval: 30_000,
    enabled: workspace.mode === "enterprise",
  });

  const configMutation = useMutation({
    mutationFn: (data: { erpWebhookUrl: string; erpApiKey?: string }) => saveErpConfigApi(data, context),
    onSuccess: () => {
      toast({ title: "ERP configuration saved" });
      qc.invalidateQueries({ queryKey: ["erp-config"] });
      setApiKey("");
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  async function handleVendorImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingVendors(true);
    setVendorResult(null);
    try {
      const result = await importCsv("csv-import/vendors", file);
      setVendorResult(result);
      toast({
        title: "Vendor import complete",
        description: `Created: ${result.summary.created}, Updated: ${result.summary.updated ?? 0}, Errors: ${result.summary.errors}`,
      });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportingVendors(false);
      if (vendorFileRef.current) vendorFileRef.current.value = "";
    }
  }

  async function handlePoImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPOs(true);
    setPoResult(null);
    try {
      const result = await importCsv("csv-import/purchase-orders", file);
      setPoResult(result);
      toast({
        title: "PO import complete",
        description: `Created: ${result.summary.created}, Skipped: ${result.summary.skipped ?? 0}, Errors: ${result.summary.errors}`,
      });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportingPOs(false);
      if (poFileRef.current) poFileRef.current.value = "";
    }
  }

  return (
    <AppShell title="ERP Connectors" description="Connect your ERP system via webhook or CSV import.">
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ERP Connectors</h1>
          <p className="text-muted-foreground mt-1">
            Configure your ERP webhook, import master data via CSV, and sync approved invoices.
          </p>
        </div>

        <Tabs defaultValue="webhook">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="webhook"><Plug className="w-3.5 h-3.5 mr-1.5" />Webhook</TabsTrigger>
            <TabsTrigger value="import"><FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />CSV Import</TabsTrigger>
            <TabsTrigger value="history"><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Sync History</TabsTrigger>
          </TabsList>

          {/* Webhook Config Tab */}
          <TabsContent value="webhook" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  ERP Webhook Configuration
                </CardTitle>
                <CardDescription>
                  When an invoice is approved, Invoice.Audit will POST a signed payload to this URL.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {configLoading ? (
                  <div className="h-20 animate-pulse bg-muted rounded" />
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="webhook-url">Webhook URL</Label>
                      <Input
                        id="webhook-url"
                        type="url"
                        placeholder="https://your-erp.example.com/webhooks/invoice"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="api-key">
                        API Key{" "}
                        {config?.hasApiKey && (
                          <span className="ml-1 text-xs text-muted-foreground">(already set — enter new value to rotate)</span>
                        )}
                      </Label>
                      <Input
                        id="api-key"
                        type="password"
                        placeholder={config?.hasApiKey ? "••••••••••••••••" : "Bearer token sent in Authorization header"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <AlertCircle className="w-4 h-4 flex-none" />
                      The webhook payload is signed with your tenant key. Verify the{" "}
                      <code className="font-mono text-xs">X-Invoice-Audit-Signature</code> header on your server.
                    </div>
                    <Button
                      onClick={() => configMutation.mutate({ erpWebhookUrl: webhookUrl, erpApiKey: apiKey || undefined })}
                      disabled={configMutation.isPending || !webhookUrl}
                    >
                      {configMutation.isPending ? "Saving…" : "Save Configuration"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payload Schema</CardTitle>
                <CardDescription>Example POST body sent to your webhook on invoice approval.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-auto rounded bg-muted p-4 text-xs text-foreground/80">
{`{
  "source": "Invoice.Audit Pro",
  "syncTimestamp": "2025-01-15T10:30:00Z",
  "invoicePayload": {
    "vendorName": "ABC Supplies Ltd",
    "invoiceNumber": "INV-2025-001",
    "amount": 125000,
    "date": "2025-01-10",
    "dueDate": "2025-01-25",
    "poNumber": "PO-2025-042",
    "lineItems": [ ... ]
  }
}`}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CSV Import Tab */}
          <TabsContent value="import" className="space-y-4 mt-4">
            {/* Vendors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import Vendors</CardTitle>
                <CardDescription>
                  Upload a CSV to bulk-create or update vendors in your Vendor Master.
                  Required columns: <code className="text-xs font-mono">vendor_name</code>.
                  Optional: <code className="text-xs font-mono">vendor_code, gstin, pan_number, email, phone</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <a
                  href="data:text/csv;charset=utf-8,vendor_name,vendor_code,gstin,pan_number,email,phone%0AABC Supplies,V001,27AAACB1234C1Z5,AAACB1234C,abc@example.com,9876543210"
                  download="vendor_import_template.csv"
                  className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:underline"
                >
                  <Download className="w-3 h-3" />
                  Download CSV template
                </a>
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 p-8 cursor-pointer hover:border-teal-400/60 transition-colors"
                  onClick={() => vendorFileRef.current?.click()}
                >
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {importingVendors ? "Importing…" : "Click to select a CSV file"}
                  </p>
                </div>
                <input
                  ref={vendorFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleVendorImport}
                  disabled={importingVendors}
                />
                {vendorResult && <ImportResultCard result={vendorResult} />}
              </CardContent>
            </Card>

            {/* Purchase Orders */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import Purchase Orders</CardTitle>
                <CardDescription>
                  Upload a CSV of open POs for 3-way matching during invoice validation.
                  Required: <code className="text-xs font-mono">po_number, vendor_name, total_amount</code>.
                  Optional: <code className="text-xs font-mono">currency, issued_at, expires_at, status</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <a
                  href="data:text/csv;charset=utf-8,po_number,vendor_name,total_amount,currency,issued_at,expires_at%0APO-001,ABC Supplies,125000,INR,2025-01-01,2025-12-31"
                  download="po_import_template.csv"
                  className="inline-flex items-center gap-1.5 text-xs text-teal-600 hover:underline"
                >
                  <Download className="w-3 h-3" />
                  Download CSV template
                </a>
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 p-8 cursor-pointer hover:border-teal-400/60 transition-colors"
                  onClick={() => poFileRef.current?.click()}
                >
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {importingPOs ? "Importing…" : "Click to select a CSV file"}
                  </p>
                </div>
                <input
                  ref={poFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handlePoImport}
                  disabled={importingPOs}
                />
                {poResult && <ImportResultCard result={poResult} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sync History Tab */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ERP Sync History</CardTitle>
                <CardDescription>Last 50 invoice sync events pushed to your ERP webhook.</CardDescription>
              </CardHeader>
              <CardContent>
                {syncLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No sync events yet. Approve an invoice to trigger the first sync.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syncLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">{new Date(log.syncedAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={log.status === "success" ? "default" : "destructive"}>
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{log.recordCount ?? "—"}</TableCell>
                          <TableCell className="text-xs text-destructive">{log.errorMessage ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function ImportResultCard({ result }: { result: ImportResult }) {
  const { summary, errors } = result;
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {summary.errors === 0 ? (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        ) : (
          <XCircle className="w-4 h-4 text-destructive" />
        )}
        <span className="text-sm font-medium">
          {summary.total} rows processed — {summary.created} created
          {summary.updated != null ? `, ${summary.updated} updated` : ""}
          {summary.skipped != null ? `, ${summary.skipped} skipped` : ""}
          {summary.errors > 0 ? `, ${summary.errors} errors` : ""}
        </span>
      </div>
      {errors.length > 0 && (
        <div className="space-y-1 text-xs text-destructive max-h-32 overflow-y-auto">
          {errors.map((e, i) => (
            <p key={i}>Row {e.row}: {e.reason}</p>
          ))}
        </div>
      )}
    </div>
  );
}
