import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Copy, Download, ExternalLink, FileText, Paperclip, ShieldAlert, TimerReset, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppLayout";
import { IfAllowed } from "@/components/IfAllowed";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  type CheckStatus,
  type RiskLevel,
  type Severity,
  type WorkflowStatus,
} from "@/data/platformData";
import { useInvoiceActionMutation, useInvoiceData } from "@/hooks/usePlatformApi";
import { useCurrentWorkspace } from "@/lib/workspace-context";
import { formatCurrency } from "@/lib/utils";
import { getEvidence, requestEvidenceLink, type EvidenceAttachment, type ApiWorkspaceContext, API_BASE } from "@/lib/api";
import { readStoredEnterpriseSession } from "@/lib/auth";

const statusTone: Record<WorkflowStatus, "success" | "warning" | "danger"> = {
  "auto-approved": "success",
  "pending-review": "warning",
  "needs-evidence": "warning",
  escalated: "danger",
  blocked: "danger",
};

const riskTone: Record<RiskLevel, "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

const checkTone: Record<CheckStatus, "success" | "warning" | "danger"> = {
  pass: "success",
  warning: "warning",
  fail: "danger",
};

const severityTone: Record<Severity, "warning" | "danger" | "neutral"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The workflow action could not be completed.";
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const { data: invoice, isError } = useInvoiceData(id);
  const invoiceAction = useInvoiceActionMutation(id);
  const { paths, mode, tenantSlug, session } = useCurrentWorkspace() as any;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [portalLink, setPortalLink] = useState<{ url: string; expiresAt: string; vendorEmail: string | null } | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const apiContext: ApiWorkspaceContext | undefined = mode === "enterprise"
    ? { mode: "enterprise", tenantSlug: tenantSlug ?? undefined, sessionToken: session?.sessionToken ?? undefined }
    : undefined;

  const { data: evidenceList = [] } = useQuery<EvidenceAttachment[]>({
    queryKey: ["evidence", id, tenantSlug],
    queryFn: () => getEvidence(id!, apiContext),
    enabled: !!id && mode === "enterprise",
    staleTime: 30_000,
  });

  const vendorLinkMutation = useMutation({
    mutationFn: () => requestEvidenceLink(id!, evidenceNote || "Please provide supporting documentation.", apiContext),
    onSuccess: (data) => {
      setPortalLink({ url: data.portalUrl, expiresAt: data.expiresAt, vendorEmail: data.vendorEmail });
      toast.success("Vendor portal link generated.");
    },
    onError: () => toast.error("Failed to generate vendor portal link."),
  });

  async function handleEvidenceUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const stored = readStoredEnterpriseSession();
    if (!stored) return;
    setUploadingEvidence(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const res = await fetch(`${API_BASE}/invoices/${id}/evidence`, {
        method: "POST",
        headers: {
          "X-Workspace-Mode": "enterprise",
          "X-Tenant-Slug": tenantSlug ?? "",
          "X-Session-Token": stored.sessionToken,
        },
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      toast.success("Evidence uploaded successfully.");
      queryClient.invalidateQueries({ queryKey: ["evidence", id, tenantSlug] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingEvidence(false);
    }
  }

  if (!invoice) {
    return (
      <AppShell
        eyebrow="Invoice Review"
        title="Invoice not found"
        description="The requested invoice record could not be loaded from the review workspace."
      >
        <Button asChild variant="outline" className="rounded-xl">
          <Link to={paths.dashboard}>Return to dashboard</Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Invoice Review"
      title={`${invoice.invoiceNumber} review workspace`}
      description={invoice.summary}
      actions={
        <Button asChild variant="hero" className="rounded-xl">
          <Link to={paths.comparison(invoice.id)}>Open correction workbench</Link>
        </Button>
      }
    >
      <BackendStatusNotice show={isError} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="rounded-xl">
          <Link to={paths.dashboard}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
        <StatusBadge tone={statusTone[invoice.status]}>{formatLabel(invoice.status)}</StatusBadge>
        <StatusBadge tone={riskTone[invoice.riskLevel]}>
          Risk {invoice.riskScore} / {invoice.riskLevel}
        </StatusBadge>
        <StatusBadge tone="info">Confidence {invoice.confidence}%</StatusBadge>
      </div>

      {invoice.status === "auto-approved" ? (
        <div className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          This invoice has been approved and moved out of the manual review queue. Dashboard and
          exceptions views will reflect it as resolved.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Vendor", value: invoice.vendorName },
          { label: "Amount", value: formatCurrency(invoice.amount) },
          { label: "Source", value: invoice.sourceChannel },
          { label: "Assigned reviewer", value: invoice.assignedReviewer },
          { label: "Aging", value: `${invoice.agingHours}h in queue` },
        ].map((item) => (
          <Card key={item.label} className="rounded-3xl border-border/70 bg-card/90">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-3 font-heading text-xl font-semibold tracking-tight text-foreground">
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-6">
          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-heading text-2xl tracking-tight">
                    Invoice preview
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Side-by-side review starts with the raw document and detected hotspots.
                  </p>
                </div>
                <StatusBadge tone="info">PDF view simulated</StatusBadge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-[28px] bg-slate-950 p-5 text-white">
                <div className="rounded-[24px] bg-white p-6 text-slate-950 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)]">
                  <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-4">
                    <div>
                      <p className="font-heading text-2xl font-semibold">{invoice.vendorName}</p>
                      <p className="mt-2 text-sm text-slate-600">Vendor code {invoice.vendorCode}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">Invoice</p>
                      <p className="font-heading text-xl font-semibold">{invoice.invoiceNumber}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        Invoice date
                      </p>
                      <p className="mt-2 font-medium text-slate-950">{invoice.invoiceDate}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        Due date
                      </p>
                      <p className="mt-2 font-medium text-slate-950">{invoice.dueDate}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-amber-600">
                        PO reference
                      </p>
                      <p className="mt-2 font-medium text-slate-950">{invoice.poNumber}</p>
                    </div>
                    <div className="rounded-2xl bg-rose-50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-rose-600">
                        Flagged area
                      </p>
                      <p className="mt-2 font-medium text-slate-950">
                        {invoice.flags[0]?.title ?? "No critical flags"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3 rounded-3xl border border-slate-200 p-4">
                    {invoice.lineItems.map((item) => (
                      <div key={item.description} className="flex items-center justify-between gap-4 text-sm">
                        <div>
                          <p className="font-medium text-slate-950">{item.description}</p>
                          <p className="text-slate-500">Qty {item.quantity}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-slate-950">{formatCurrency(item.total)}</p>
                          <StatusBadge tone={checkTone[item.status]} className="mt-2">
                            {item.status}
                          </StatusBadge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader className="pb-4">
              <CardTitle className="font-heading text-2xl tracking-tight">Audit trail</CardTitle>
              <p className="text-sm text-muted-foreground">
                Reviewer and system actions stay visible without leaving the invoice screen.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {invoice.auditTrail.map((event) => (
                <div key={`${event.timestamp}-${event.action}`} className="rounded-3xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-950">{event.action}</p>
                      <p className="mt-1 text-sm text-slate-600">{event.detail}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{event.actor}</p>
                      <p className="mt-1">{event.timestamp}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader className="pb-4">
              <CardTitle className="font-heading text-2xl tracking-tight">
                Extracted structured data
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Critical fields, source hints, and confidence scores are highlighted for reviewers.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {invoice.structuredFields.map((field) => (
                <div key={field.label} className="rounded-3xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-500">{field.label}</p>
                    <StatusBadge
                      tone={
                        field.confidence >= 90
                          ? "success"
                          : field.confidence >= 75
                          ? "warning"
                          : "danger"
                      }
                    >
                      {field.confidence}%
                    </StatusBadge>
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{field.value}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                    Source: {field.source}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader className="pb-4">
              <CardTitle className="font-heading text-2xl tracking-tight">
                Validation checkpoints
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Vendor, PO, duplicate, tax, and approval checks with visible reasoning.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {invoice.validationChecks.map((check) => (
                <div key={check.label} className="rounded-3xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">{check.label}</p>
                      <p className="mt-1 text-sm text-slate-600">{check.detail}</p>
                    </div>
                    <StatusBadge tone={checkTone[check.status]}>{check.status}</StatusBadge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader className="pb-4">
              <CardTitle className="font-heading text-2xl tracking-tight">
                Explainability and action panel
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Why the invoice was flagged, what changed, and what the reviewer can do next.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <IfAllowed permission="invoice:approve">
                  <Button
                    variant="hero"
                    className="rounded-2xl"
                    disabled={invoiceAction.isPending || invoice.status === "auto-approved"}
                    onClick={async () => {
                      try {
                        const result = await invoiceAction.mutateAsync({
                          action: "approve",
                          actor: "Finance Manager",
                        });
                        toast.success(result.message);
                      } catch (error) {
                        toast.error(buildActionErrorMessage(error));
                      }
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {invoice.status === "auto-approved" ? "Approved" : "Approve"}
                  </Button>
                </IfAllowed>
                <IfAllowed permission="invoice:request-evidence">
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    disabled={invoiceAction.isPending}
                    onClick={async () => {
                      try {
                        const result = await invoiceAction.mutateAsync({
                          action: "request-evidence",
                          actor: "AP Reviewer",
                        });
                        toast.success(result.message);
                      } catch (error) {
                        toast.error(buildActionErrorMessage(error));
                      }
                    }}
                  >
                    <FileText className="h-4 w-4" />
                    Request evidence
                  </Button>
                </IfAllowed>
                <IfAllowed permission="invoice:escalate">
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    disabled={invoiceAction.isPending}
                    onClick={async () => {
                      try {
                        const result = await invoiceAction.mutateAsync({
                          action: "escalate",
                          actor: "Finance Controls",
                        });
                        toast.success(result.message);
                      } catch (error) {
                        toast.error(buildActionErrorMessage(error));
                      }
                    }}
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Escalate
                  </Button>
                </IfAllowed>
                <IfAllowed permission="invoice:assign">
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    disabled={invoiceAction.isPending}
                    onClick={async () => {
                      try {
                        const result = await invoiceAction.mutateAsync({
                          action: "assign-reviewer",
                          actor: "Workflow Manager",
                          note: "Controls Review Queue",
                        });
                        toast.success(result.message);
                      } catch (error) {
                        toast.error(buildActionErrorMessage(error));
                      }
                    }}
                  >
                    <TimerReset className="h-4 w-4" />
                    Assign reviewer
                  </Button>
                </IfAllowed>
              </div>

              <div className="rounded-3xl bg-slate-950 p-5 text-white">
                <p className="font-heading text-xl font-semibold">Workflow recommendation</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{invoice.workflowRecommendation}</p>
              </div>

              <div className="space-y-3">
                {invoice.flags.length === 0 ? (
                  <div className="rounded-3xl bg-emerald-50 p-4 text-sm text-emerald-700">
                    No critical explainability alerts. This invoice satisfied the configured control
                    checks.
                  </div>
                ) : (
                  invoice.flags.map((flag) => (
                    <div key={flag.title} className="rounded-3xl bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-950">{flag.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{flag.detail}</p>
                        </div>
                        <StatusBadge tone={severityTone[flag.severity]}>{flag.severity}</StatusBadge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Evidence Panel — only in enterprise mode */}
      {mode === "enterprise" && (
        <div className="mt-8">
          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 font-heading text-xl tracking-tight">
                  <Paperclip className="h-5 w-5 text-primary" />
                  Evidence &amp; Supporting Documents
                </CardTitle>
                <StatusBadge tone="neutral">{evidenceList.length} file{evidenceList.length !== 1 ? "s" : ""}</StatusBadge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Existing attachments */}
              {evidenceList.length === 0 ? (
                <p className="text-sm text-muted-foreground">No evidence attached yet.</p>
              ) : (
                <div className="divide-y rounded-2xl border border-border overflow-hidden">
                  {evidenceList.map((att) => (
                    <div key={att.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-card">
                      <div>
                        <p className="text-sm font-medium">{att.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {(att.sizeBytes / 1024).toFixed(0)} KB · uploaded by {att.uploadedBy}
                          {att.fromVendorPortal ? " (vendor portal)" : ""}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="rounded-xl gap-1.5" asChild>
                        <a href={att.url} target="_blank" rel="noreferrer">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload evidence directly */}
              <IfAllowed permission="invoice:request-evidence">
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Upload evidence directly</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => handleEvidenceUpload(e.target.files)}
                  />
                  <Button
                    variant="outline"
                    className="rounded-xl gap-2"
                    disabled={uploadingEvidence}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingEvidence ? "Uploading…" : "Select files (PDF, PNG, JPEG)"}
                  </Button>
                </div>

                {/* Generate vendor portal link */}
                <div className="space-y-3 border-t border-border pt-5">
                  <p className="text-sm font-semibold text-foreground">Send vendor portal link</p>
                  <p className="text-xs text-muted-foreground">
                    Generates a secure 72-hour link the vendor can use to upload documents — no login required.
                  </p>
                  <Textarea
                    placeholder="Optional note to vendor (e.g. 'Please attach the original PO and delivery receipt.')"
                    className="rounded-xl text-sm resize-none"
                    rows={2}
                    value={evidenceNote}
                    onChange={(e) => setEvidenceNote(e.target.value)}
                  />
                  <Button
                    variant="hero"
                    className="rounded-xl gap-2"
                    disabled={vendorLinkMutation.isPending}
                    onClick={() => vendorLinkMutation.mutate()}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {vendorLinkMutation.isPending ? "Generating…" : "Generate vendor link"}
                  </Button>

                  {portalLink && (
                    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 space-y-2">
                      <p className="text-xs font-semibold text-teal-800">Portal link generated</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded-lg bg-white px-3 py-1.5 text-xs text-teal-900 border border-teal-200">
                          {portalLink.url}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg shrink-0"
                          onClick={() => { navigator.clipboard.writeText(portalLink.url); toast.success("Copied!"); }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-teal-700">
                        Expires {new Date(portalLink.expiresAt).toLocaleString()}
                        {portalLink.vendorEmail ? ` · Email sent to ${portalLink.vendorEmail}` : " · No vendor email on file"}
                      </p>
                    </div>
                  )}
                </div>
              </IfAllowed>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
