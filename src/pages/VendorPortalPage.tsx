import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, FileSearch, LoaderCircle, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { API_BASE } from "@/lib/api";

type InvoiceInfo = {
  invoiceNumber: string;
  vendorName: string;
  amount: number;
  status: string;
  organizationName: string;
};

export default function VendorPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InvoiceInfo | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!token) { setLoadStatus("error"); setLoadError("Invalid portal link."); return; }
    fetch(`${API_BASE}/vendor-portal/${token}`)
      .then((r) => r.ok ? r.json() : r.json().then((e) => Promise.reject(e)))
      .then((d) => { setInfo(d); setLoadStatus("ready"); })
      .catch((e) => { setLoadStatus("error"); setLoadError(e?.message ?? "This link is invalid or has expired."); });
  }, [token]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !token) return;
    setUploadStatus("uploading");
    setUploadError(null);

    const fd = new FormData();
    for (const f of Array.from(files)) {
      fd.append("files", f);
    }

    try {
      const r = await fetch(`${API_BASE}/vendor-portal/${token}/upload`, {
        method: "POST",
        body: fd,
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.message ?? "Upload failed.");
      }
      setUploadStatus("done");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setUploadStatus("error");
    }
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.24),_transparent_28%),linear-gradient(160deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-10">
        <div className="flex items-center gap-3 mb-6 text-teal-300">
          <FileSearch className="h-7 w-7" />
          <span className="font-heading text-xl font-semibold">Invoice.Audit Vendor Portal</span>
        </div>

        <Card className="w-full rounded-[28px] border-white/10 bg-white text-slate-950 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.85)]">
          <CardContent className="p-8">
            {loadStatus === "loading" ? (
              <div className="flex items-center gap-3 text-slate-600">
                <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                Loading invoice details…
              </div>
            ) : null}

            {loadStatus === "error" ? (
              <div>
                <XCircle className="h-10 w-10 text-rose-500" />
                <h1 className="mt-4 font-heading text-2xl font-semibold">Link invalid or expired</h1>
                <p className="mt-2 text-slate-600">{loadError}</p>
                <p className="mt-4 text-sm text-slate-500">
                  Contact the AP team at the company that requested your documents for a new link.
                </p>
              </div>
            ) : null}

            {loadStatus === "ready" && info ? (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                    Document request from {info.organizationName}
                  </p>
                  <h1 className="mt-3 font-heading text-2xl font-semibold">
                    Upload supporting documents for invoice #{info.invoiceNumber}
                  </h1>
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 space-y-1.5">
                    <p><span className="text-slate-500">Vendor:</span> {info.vendorName}</p>
                    <p><span className="text-slate-500">Amount:</span> ₹{info.amount?.toLocaleString("en-IN") ?? "—"}</p>
                    <p><span className="text-slate-500">Status:</span> {info.status}</p>
                  </div>
                </div>

                {uploadStatus === "done" ? (
                  <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center">
                    <CheckCircle2 className="h-10 w-10 text-primary" />
                    <p className="font-semibold text-teal-800">Documents uploaded successfully</p>
                    <p className="text-sm text-teal-700">
                      The AP team at {info.organizationName} has been notified and will review your documents.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className="text-sm font-medium text-slate-700 mb-3">
                      Accepted: PDF, images, Excel (max 10 MB each)
                    </p>
                    <label
                      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50"}`}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div className="text-center">
                        <p className="font-medium text-slate-700">Drag and drop files here</p>
                        <p className="text-sm text-muted-foreground">or click to browse</p>
                      </div>
                      <input
                        type="file"
                        multiple
                        className="sr-only"
                        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                        onChange={(e) => handleFiles(e.target.files)}
                      />
                    </label>

                    {uploadStatus === "uploading" ? (
                      <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                        <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                        Uploading documents…
                      </div>
                    ) : null}

                    {uploadStatus === "error" ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {uploadError}
                      </div>
                    ) : null}

                    {uploadStatus === "idle" ? (
                      <p className="mt-4 text-xs text-muted-foreground">
                        Your files are securely stored and only accessible to the AP team.
                        This link expires after use.
                      </p>
                    ) : null}
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        <p className="mt-6 text-xs text-slate-500">
          Powered by Invoice.Audit · This is a secure, single-use link
        </p>
      </div>
    </div>
  );
}
