import { useRef, useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  CircleAlert,
  CloudUpload,
  Download,
  FileSpreadsheet,
  FileStack,
  Loader2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppLayout";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIngestionData } from "@/hooks/usePlatformApi";
import { useCurrentWorkspace } from "@/lib/workspace-context";
import { useAuthSession } from "@/lib/auth-session-context";
import { usePermissions, PERMISSIONS } from "@/lib/permissions";
import { toast } from "sonner";

type UploadTab = "file" | "csv";

type QueuedFile = {
  id: string;
  file: File;
  name: string;
  sizeLabel: string;
  validation: "Ready" | "Needs review";
  note: string;
};

type ProcessingTracker = {
  filename: string;
  invoiceId: string;
  processingStep: string;
  status: string;
  invoiceNumber?: string;
  done: boolean;
  failed: boolean;
};

const STEP_LABELS: Record<string, string> = {
  queued: "Queued",
  ocr_processing: "OCR — reading invoice…",
  ocr_complete: "OCR complete",
  validating: "Running validation checks…",
  complete: "Complete",
  failed: "Processing failed",
};

function stepProgress(step: string): number {
  const order = ["queued", "ocr_processing", "ocr_complete", "validating", "complete"];
  const idx = order.indexOf(step);
  if (idx === -1) return step === "failed" ? 100 : 0;
  return Math.round(((idx + 1) / order.length) * 100);
}

const acceptedTypes = ".pdf,.png,.jpg,.jpeg";

const CSV_TEMPLATE_HEADERS =
  "invoice_number,vendor_name,vendor_code,entity,amount,invoice_date,due_date,po_number,description";

function buildQueuedFile(file: File): QueuedFile {
  const sizeInMb = file.size / (1024 * 1024);
  const needsReview = sizeInMb > 8;

  return {
    id: Math.random().toString(36).substring(7),
    file,
    name: file.name,
    sizeLabel: `${sizeInMb.toFixed(1)} MB`,
    validation: needsReview ? "Needs review" : "Ready",
    note: needsReview
      ? "Large file detected. May take longer to process via GPT-4o."
      : "File structure accepted for OCR ingestion.",
  };
}

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE_HEADERS + "\n"], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "invoice-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function EnterpriseUploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuthSession();
  const [activeTab, setActiveTab] = useState<UploadTab>(
    searchParams.get("tab") === "csv" ? "csv" : "file",
  );
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [trackers, setTrackers] = useState<ProcessingTracker[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { data, isError } = useIngestionData();
  const { paths, mode } = useCurrentWorkspace();
  const { can } = usePermissions();

  const allDone = trackers.length > 0 && trackers.every((t) => t.done || t.failed);

  // Poll status for each invoice that isn't done yet
  const pollStatuses = useCallback(async () => {
    if (!session) return;
    setTrackers((prev) => {
      const pending = prev.filter((t) => !t.done && !t.failed);
      if (pending.length === 0) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
      return prev;
    });

    // We need current trackers outside setState
    setTrackers((prev) => {
      const toFetch = prev.filter((t) => !t.done && !t.failed);
      if (toFetch.length === 0) return prev;

      Promise.all(
        toFetch.map((t) =>
          fetch(`/api/invoices/${t.invoiceId}/status`, {
            headers: {
              "X-Workspace-Mode": "enterprise",
              "X-Tenant-Slug": session.tenantSlug,
              "X-Session-Token": session.sessionToken,
            },
          })
            .then((r) => r.json())
            .catch(() => null),
        ),
      ).then((results) => {
        setTrackers((current) =>
          current.map((t) => {
            const fresh = results.find(
              (r: any) => r && r.id === t.invoiceId,
            ) as { processingStep: string; status: string; invoiceNumber: string } | null;
            if (!fresh) return t;
            const done = fresh.processingStep === "complete";
            const failed = fresh.processingStep === "failed";
            return {
              ...t,
              processingStep: fresh.processingStep,
              status: fresh.status,
              invoiceNumber: fresh.invoiceNumber !== t.invoiceId ? fresh.invoiceNumber : t.invoiceNumber,
              done,
              failed,
            };
          }),
        );
      });

      return prev;
    });
  }, [session]);

  useEffect(() => {
    if (trackers.length > 0 && !allDone) {
      pollTimerRef.current = setInterval(pollStatuses, 3000);
      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
    if (allDone && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackers.length, allDone]);

  const appendFiles = (incoming: File[]) => {
    setFiles((current) => [...current, ...incoming.map(buildQueuedFile)].slice(0, 8));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    appendFiles(Array.from(event.dataTransfer.files));
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      appendFiles(Array.from(event.target.files));
    }
  };

  const handleUpload = async () => {
    if (!session || files.length === 0) return;
    setIsUploading(true);
    const newTrackers: ProcessingTracker[] = [];

    for (const queued of files) {
      const formData = new FormData();
      formData.append("files", queued.file);

      try {
        const response = await fetch("/api/invoices/upload", {
          method: "POST",
          headers: {
            "X-Workspace-Mode": "enterprise",
            "X-Tenant-Slug": session.tenantSlug,
            "X-Session-Token": session.sessionToken,
          },
          body: formData,
        });

        if (!response.ok) {
          toast.error(`Failed to submit ${queued.name}`);
          continue;
        }

        const result = await response.json() as {
          results: { filename: string; invoiceId: string; status: string }[];
        };

        for (const r of result.results ?? []) {
          if (r.invoiceId) {
            newTrackers.push({
              filename: r.filename ?? queued.name,
              invoiceId: r.invoiceId,
              processingStep: r.status === "duplicate" ? "complete" : "queued",
              status: r.status === "duplicate" ? "duplicate" : "processing",
              invoiceNumber: undefined,
              done: r.status === "duplicate",
              failed: false,
            });
          }
        }
      } catch {
        toast.error(`Failed to ingest ${queued.name}`);
      }
    }

    setIsUploading(false);

    if (newTrackers.length > 0) {
      setFiles([]);
      setTrackers(newTrackers);
      toast.success(`${newTrackers.length} invoice(s) submitted — tracking OCR progress below.`);
    }
  };

  const handleCsvImport = async () => {
    if (!session || !csvFile) return;
    setIsImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", csvFile);

      const response = await fetch("/api/invoices/import-csv", {
        method: "POST",
        headers: {
          "X-Workspace-Mode": "enterprise",
          "X-Tenant-Slug": session.tenantSlug,
          "X-Session-Token": session.sessionToken,
        },
        body: formData,
      });

      const result = await response.json() as {
        message: string;
        imported: number;
        skipped: number;
        error?: string;
      };

      if (!response.ok) {
        toast.error(result.message ?? result.error ?? "CSV import failed.");
      } else {
        toast.success(`${result.imported} invoice(s) imported, ${result.skipped} skipped.`);
        setCsvFile(null);
        if (csvInputRef.current) csvInputRef.current.value = "";
        navigate(paths.dashboard);
      }
    } catch (err) {
      toast.error("Failed to import CSV. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSeedSample = async () => {
    if (!session) return;
    setIsSeeding(true);

    try {
      const response = await fetch("/api/invoices/seed-sample", {
        method: "POST",
        headers: {
          "X-Workspace-Mode": "enterprise",
          "X-Tenant-Slug": session.tenantSlug,
          "X-Session-Token": session.sessionToken,
        },
      });

      const result = await response.json() as { message: string; seeded?: number; error?: string };

      if (!response.ok) {
        if (response.status === 409) {
          toast.error("This workspace already has invoices. Sample data is only available for empty workspaces.");
        } else {
          toast.error(result.message ?? result.error ?? "Failed to seed sample data.");
        }
      } else {
        toast.success(result.message ?? "Sample invoices loaded.");
        navigate(paths.dashboard);
      }
    } catch (err) {
      toast.error("Failed to load sample data. Please try again.");
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <AppShell
      eyebrow="Enterprise Ingestion"
      title="Real OCR Extraction Pipeline"
      description="Drag and drop a PDF or Image invoice. It will be sent to the backend and processed via GPT-4o Vision into the SQLite database."
      actions={
        activeTab === "file" && can(PERMISSIONS.INVOICE_UPLOAD) ? (
          <Button variant="hero" className="rounded-xl" onClick={handleUpload} disabled={files.length === 0 || isUploading}>
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            {isUploading ? "Extracting via GPT-4o..." : "Upload & Extract"}
          </Button>
        ) : null
      }
    >
      <BackendStatusNotice show={isError} />

      {/* Live processing tracker — shown after upload until all invoices are done */}
      {trackers.length > 0 && (
        <div className="mb-6 rounded-3xl border border-border/70 bg-card/90 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-heading text-lg font-semibold text-foreground">Processing invoices</p>
              <p className="text-sm text-muted-foreground">
                {allDone
                  ? "All invoices processed. Results are in your dashboard."
                  : "OCR and validation running — updates every 3 seconds."}
              </p>
            </div>
            {allDone && (
              <Button asChild variant="hero" className="rounded-xl">
                <Link to={paths.dashboard}>View in dashboard</Link>
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {trackers.map((t) => (
              <div key={t.invoiceId} className="rounded-2xl border border-border/60 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {t.failed ? (
                      <XCircle className="h-4 w-4 text-rose-500 flex-none" />
                    ) : t.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-none" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-primary flex-none" />
                    )}
                    <span className="text-sm font-medium text-slate-900 truncate">{t.filename}</span>
                    {t.invoiceNumber && !t.invoiceNumber.startsWith("PENDING") && (
                      <span className="text-xs text-muted-foreground shrink-0">→ {t.invoiceNumber}</span>
                    )}
                  </div>
                  <span className={`text-xs shrink-0 font-medium ${t.failed ? "text-rose-600" : t.done ? "text-emerald-600" : "text-primary"}`}>
                    {t.failed ? "Failed" : t.status === "duplicate" ? "Duplicate detected" : STEP_LABELS[t.processingStep] ?? t.processingStep}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${t.failed ? "bg-rose-400" : t.status === "duplicate" ? "bg-amber-400" : "bg-primary"}`}
                    style={{ width: `${stepProgress(t.processingStep)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {allDone && (
            <button
              type="button"
              onClick={() => setTrackers([])}
              className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Upload more invoices
            </button>
          )}
        </div>
      )}

      {/* Tab switcher */}
      <div className="mb-6 flex gap-1 rounded-2xl border border-border/70 bg-slate-50 p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("file")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "file"
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-600 hover:text-slate-950"
          }`}
        >
          <Upload className="h-4 w-4" />
          File Upload
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("csv")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "csv"
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-600 hover:text-slate-950"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          CSV Import
        </button>
      </div>

      {activeTab === "file" && (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card className="rounded-3xl border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="font-heading text-2xl tracking-tight">
                  Upload Invoice Images
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Drop PNG, JPG, or PDF files. The backend will parse them in real-time.
                </p>
              </CardHeader>
              <CardContent>
                <div
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  className="rounded-[28px] border-2 border-dashed border-primary/30 bg-[linear-gradient(145deg,rgba(15,118,110,0.08),rgba(255,255,255,0.9))] p-8 cursor-pointer"
                  onClick={() => document.getElementById("intake-file-input")?.click()}
                >
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-3xl bg-white p-4 shadow-card">
                      <Upload className="h-8 w-8 text-primary" />
                    </div>
                    <p className="mt-4 font-heading text-2xl font-semibold text-slate-950">
                      Drop invoice packages here
                    </p>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                      Accepted formats: PDF, PNG, JPG. File will be sent directly to the Node.js backend.
                    </p>
                    <StatusBadge tone="info" className="mt-4">
                      Powered by GPT-4o Vision OCR
                    </StatusBadge>
                  </div>
                  <input
                    id="intake-file-input"
                    type="file"
                    multiple
                    accept={acceptedTypes}
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </div>

                <div className="mt-6 space-y-3">
                  {files.length === 0 ? (
                    <div className="rounded-3xl border border-border/70 bg-slate-50 p-5 text-sm text-slate-600">
                      No files queued yet. Select an image file to begin.
                    </div>
                  ) : (
                    files.map((file) => (
                      <div
                        key={file.id}
                        className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <div className="rounded-2xl bg-white p-3 shadow-card">
                            <FileStack className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-950">{file.name}</p>
                            <p className="mt-1 text-sm text-slate-600">{file.sizeLabel}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge tone={file.validation === "Ready" ? "success" : "warning"}>
                            {file.validation}
                          </StatusBadge>
                          <button
                            type="button"
                            onClick={() => setFiles((current) => current.filter((f) => f.id !== file.id))}
                            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-3xl border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="font-heading text-2xl tracking-tight">Validation checklist</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Transmit securely to backend OCR API",
                  "Extract structured Line Items via GPT-4o",
                  "Verify math correctness (Subtotals & Tax)",
                  "Check SQLite database for duplicates",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                    <CircleAlert className="mt-0.5 h-4 w-4 text-primary" />
                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button
              variant="hero"
              size="lg"
              className="w-full rounded-2xl"
              onClick={handleUpload}
              disabled={files.length === 0 || isUploading}
            >
              {isUploading ? "Uploading..." : "Launch ingestion workflow"}
            </Button>
          </div>
        </div>
      )}

      {activeTab === "csv" && (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Card className="rounded-3xl border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="font-heading text-2xl tracking-tight">
                  Import from CSV Spreadsheet
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Import structured invoice data from a spreadsheet. No OCR cost — data goes directly into your workspace.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={downloadCsvTemplate}
                >
                  <Download className="h-4 w-4" />
                  Download template
                </Button>

                <div className="rounded-[28px] border-2 border-dashed border-primary/30 bg-[linear-gradient(145deg,rgba(15,118,110,0.08),rgba(255,255,255,0.9))] p-8">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="rounded-3xl bg-white p-4 shadow-card">
                      <FileSpreadsheet className="h-8 w-8 text-primary" />
                    </div>
                    <p className="mt-4 font-heading text-xl font-semibold text-slate-950">
                      {csvFile ? csvFile.name : "Select a CSV file"}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {csvFile
                        ? `${(csvFile.size / 1024).toFixed(1)} KB — ready to import`
                        : "Choose a .csv file exported from your ERP or spreadsheet tool."}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4 rounded-xl"
                      onClick={() => csvInputRef.current?.click()}
                    >
                      {csvFile ? "Change file" : "Choose CSV file"}
                    </Button>
                    <input
                      ref={csvInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setCsvFile(f);
                      }}
                    />
                  </div>
                </div>

                {can(PERMISSIONS.INVOICE_UPLOAD) && (
                  <Button
                    variant="hero"
                    size="lg"
                    className="w-full rounded-2xl"
                    onClick={handleCsvImport}
                    disabled={!csvFile || isImporting}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <CloudUpload className="h-4 w-4" />
                        Import invoices
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-3xl border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="font-heading text-2xl tracking-tight">Supported columns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { col: "invoice_number", note: "Required — unique invoice identifier" },
                  { col: "vendor_name", note: "Required — supplier name" },
                  { col: "amount", note: "Required — numeric value (INR)" },
                  { col: "vendor_code", note: "Optional — short vendor code" },
                  { col: "entity", note: "Optional — business entity or cost centre" },
                  { col: "invoice_date", note: "Optional — YYYY-MM-DD format" },
                  { col: "due_date", note: "Optional — YYYY-MM-DD format" },
                  { col: "po_number", note: "Optional — purchase order reference" },
                  { col: "description", note: "Optional — line description or notes" },
                ].map(({ col, note }) => (
                  <div key={col} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                    <code className="mt-0.5 shrink-0 rounded-lg bg-white px-2 py-0.5 text-xs font-mono text-primary shadow-sm">
                      {col}
                    </code>
                    <p className="text-sm text-slate-600">{note}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Seed sample data — enterprise mode only */}
      {mode === "enterprise" && can(PERMISSIONS.INVOICE_UPLOAD) && (
        <div className="mt-8 rounded-3xl border border-border/70 bg-slate-50 p-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div>
            <p className="font-medium text-slate-950">No invoices yet?</p>
            <p className="mt-1 text-sm text-slate-600">
              Load 18 realistic sample invoices to explore the full audit workflow without uploading real documents.
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-xl shrink-0"
            onClick={handleSeedSample}
            disabled={isSeeding}
          >
            {isSeeding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading samples...
              </>
            ) : (
              "Load 18 sample invoices"
            )}
          </Button>
        </div>
      )}
    </AppShell>
  );
}
