import { useRef, useState } from "react";
import {
  CheckCircle,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { useCurrentWorkspace } from "@/lib/workspace-context";
import { useAuthSession } from "@/lib/auth-session-context";
import { formatCurrency } from "@/lib/utils";

interface GstRow {
  classification: "INWARD" | "OUTWARD";
  partyName: string;
  gstNumber: string;
  documentNumber: string;
  documentDate: string;
  nonTaxableAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

interface RunTotals {
  totalInward: number;
  totalOutward: number;
  cgst: number;
  sgst: number;
  igst: number;
  mismatches: number;
}

interface GstinWarning {
  gstin: string;
  reason: string;
}

export default function EnterpriseReconciliationPage() {
  const { tenantSlug } = useCurrentWorkspace();
  const { session } = useAuthSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [inwardData, setInwardData] = useState<GstRow[]>([]);
  const [outwardData, setOutwardData] = useState<GstRow[]>([]);
  const [totals, setTotals] = useState<RunTotals | null>(null);
  const [warnings, setWarnings] = useState<GstinWarning[]>([]);
  const [hasExtracted, setHasExtracted] = useState(false);

  const sessionHeaders = {
    "X-Workspace-Mode": "enterprise",
    "X-Tenant-Slug": tenantSlug ?? "",
    "X-Session-Token": session?.sessionToken ?? "",
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type.includes("pdf") || f.type.includes("image"),
    );
    if (files.length + dropped.length > 5) {
      toast.error("Maximum 5 files per reconciliation run.");
      return;
    }
    setFiles((prev) => [...prev, ...dropped]);
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleRun = async () => {
    if (files.length === 0) return;
    setIsRunning(true);

    const formData = new FormData();
    files.forEach((f) => formData.append("invoices", f));

    try {
      const res = await fetch("/api/reconciliation/run", {
        method: "POST",
        headers: sessionHeaders,
        body: formData,
      });

      const data = await res.json() as {
        inward: GstRow[];
        outward: GstRow[];
        gstinWarnings: GstinWarning[];
        totals: RunTotals;
        error?: string;
        message?: string;
      };

      if (!res.ok) throw new Error(data.message ?? data.error ?? "Extraction failed.");

      setInwardData(data.inward ?? []);
      setOutwardData(data.outward ?? []);
      setTotals(data.totals ?? null);
      setWarnings(data.gstinWarnings ?? []);
      setHasExtracted(true);

      if (data.gstinWarnings?.length) {
        toast.warning(`${data.gstinWarnings.length} GSTIN format warning(s) detected.`);
      } else {
        toast.success(`Extracted ${data.inward.length} inward + ${data.outward.length} outward documents.`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Reconciliation run failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/reconciliation/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders,
        },
        body: JSON.stringify({ inward: inwardData, outward: outwardData }),
      });

      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Export failed.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GST_Reconciliation_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Excel report downloaded.");
    } catch (err: any) {
      toast.error(err.message ?? "Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const updateRow = (
    list: "inward" | "outward",
    index: number,
    field: keyof GstRow,
    value: string | number,
  ) => {
    const numericFields = ["nonTaxableAmount", "taxableAmount", "cgst", "sgst", "igst", "totalAmount"];
    const parsed = numericFields.includes(field) ? Number(value) : value;
    if (list === "inward") {
      setInwardData((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: parsed } : r)));
    } else {
      setOutwardData((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: parsed } : r)));
    }
  };

  const renderTable = (title: string, data: GstRow[], type: "inward" | "outward") => (
    <Card className="rounded-3xl border-border/70 bg-card/90">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          {type === "inward"
            ? <Download className="h-5 w-5 text-emerald-500" />
            : <UploadCloud className="h-5 w-5 text-amber-500" />}
          <CardTitle className="font-heading text-xl tracking-tight">
            {title} ({data.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Party Name</th>
              <th className="px-4 py-3">GST No.</th>
              <th className="px-4 py-3">Doc No.</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Taxable</th>
              <th className="px-4 py-3 text-right">CGST</th>
              <th className="px-4 py-3 text-right">SGST</th>
              <th className="px-4 py-3 text-right">IGST</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                  No {type} documents extracted.
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr key={idx} className="border-b border-border/60 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-2.5">
                    <input
                      className="w-full bg-transparent outline-none border-b border-transparent hover:border-slate-300 focus:border-primary transition-colors"
                      value={row.partyName}
                      onChange={(e) => updateRow(type, idx, "partyName", e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      className="w-32 bg-transparent outline-none border-b border-transparent hover:border-slate-300 focus:border-primary transition-colors font-mono text-xs"
                      value={row.gstNumber}
                      onChange={(e) => updateRow(type, idx, "gstNumber", e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      className="w-24 bg-transparent outline-none border-b border-transparent hover:border-slate-300 focus:border-primary transition-colors"
                      value={row.documentNumber}
                      onChange={(e) => updateRow(type, idx, "documentNumber", e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="date"
                      className="bg-transparent outline-none border-b border-transparent hover:border-slate-300 focus:border-primary transition-colors text-xs"
                      value={row.documentDate}
                      onChange={(e) => updateRow(type, idx, "documentDate", e.target.value)}
                    />
                  </td>
                  {(["taxableAmount", "cgst", "sgst", "igst"] as const).map((field) => (
                    <td key={field} className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        step="0.01"
                        className="w-20 bg-transparent text-right outline-none border-b border-transparent hover:border-slate-300 focus:border-primary transition-colors"
                        value={row[field]}
                        onChange={(e) => updateRow(type, idx, field, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <AppShell
      eyebrow="Compliance"
      title="GST Reconciliation"
      description="Upload purchase/sale invoices. GPT-4o classifies them as Inward or Outward, validates GSTINs, and generates the Excel filing template."
      actions={
        hasExtracted ? (
          <Button
            variant="hero"
            className="rounded-xl"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {isExporting ? "Generating…" : "Download Excel"}
          </Button>
        ) : undefined
      }
    >
      {!hasExtracted ? (
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          {/* Upload panel */}
          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-tight">Upload invoices</CardTitle>
              <p className="text-sm text-muted-foreground">
                Drag and drop up to 5 PDFs or images. AI will classify each as Inward (purchase) or Outward (sale).
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-[28px] border-2 border-dashed border-primary/30 bg-[linear-gradient(145deg,rgba(15,118,110,0.08),rgba(255,255,255,0.9))] p-10 flex flex-col items-center justify-center text-center transition-colors hover:border-primary/60 hover:bg-teal-50/30"
              >
                <div className="rounded-3xl bg-white p-4 shadow-card">
                  <FileSpreadsheet className="h-8 w-8 text-primary" />
                </div>
                <p className="mt-4 font-heading text-xl font-semibold text-slate-950">
                  Drop invoices here
                </p>
                <p className="mt-2 text-sm text-slate-500">PDF, PNG, JPG — max 5 files</p>
                <Button variant="outline" className="mt-4 rounded-xl" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Browse files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    if (files.length + picked.length > 5) {
                      toast.error("Maximum 5 files per run.");
                      return;
                    }
                    setFiles((prev) => [...prev, ...picked]);
                    e.target.value = "";
                  }}
                />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between rounded-2xl border border-border/70 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-primary flex-none" />
                        <span className="text-sm text-slate-800 truncate max-w-xs">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <Button
                    variant="hero"
                    size="lg"
                    className="mt-2 w-full rounded-2xl"
                    onClick={handleRun}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running via GPT-4o…
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Run reconciliation
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info panel */}
          <div className="space-y-4">
            <Card className="rounded-3xl border-border/70 bg-card/90">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-lg tracking-tight">What this does</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                {[
                  "Classifies each invoice as Inward (purchase) or Outward (sale)",
                  "Validates GSTIN format against the 15-character checksum rule",
                  "Extracts CGST, SGST, IGST breakdown per document",
                  "Generates a ready-to-file Excel in the GSTR format",
                  "Inline editing — correct any extracted value before export",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-teal-500 flex-none" />
                    <p>{item}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="rounded-3xl border-border/70 bg-card/90">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-lg tracking-tight flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  Processing time
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-2">
                <p>5 invoices typically process in 15–30 seconds via GPT-4o Vision.</p>
                <StatusBadge tone="info">OCR cost ≈ ₹0.8–4 per run</StatusBadge>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary bar */}
          {totals && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Total Inward", value: formatCurrency(totals.totalInward), tone: "success" as const },
                { label: "Total Outward", value: formatCurrency(totals.totalOutward), tone: "info" as const },
                { label: "Net Tax (CGST+SGST+IGST)", value: formatCurrency(totals.cgst + totals.sgst + totals.igst), tone: "warning" as const },
                { label: "GSTIN Warnings", value: String(totals.mismatches), tone: totals.mismatches > 0 ? "danger" as const : "success" as const },
              ].map((m) => (
                <Card key={m.label} className="rounded-2xl border-border/70">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="mt-1 font-heading text-2xl font-semibold text-foreground">{m.value}</p>
                    <StatusBadge tone={m.tone} className="mt-2">Extracted</StatusBadge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* GSTIN warnings */}
          {warnings.length > 0 && (
            <Card className="rounded-3xl border-amber-200 bg-amber-50">
              <CardContent className="p-5">
                <p className="font-semibold text-amber-900 mb-3">GSTIN format warnings</p>
                <div className="space-y-1">
                  {warnings.map((w, i) => (
                    <p key={i} className="text-sm text-amber-800">
                      <span className="font-mono font-semibold">{w.gstin}</span> — {w.reason}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {renderTable("Inward Invoices (Purchases)", inwardData, "inward")}
          {renderTable("Outward Invoices (Sales)", outwardData, "outward")}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => { setHasExtracted(false); setFiles([]); setInwardData([]); setOutwardData([]); setTotals(null); setWarnings([]); }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors underline"
            >
              Start a new batch
            </button>
            <Button variant="hero" className="rounded-xl" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {isExporting ? "Generating…" : "Download Excel"}
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
