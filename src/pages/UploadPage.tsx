import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleAlert, CloudUpload, FileStack, Link2, Upload, X } from "lucide-react";
import { AppShell } from "@/components/AppLayout";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type SourceChannel } from "@/data/platformData";
import { useIngestionData } from "@/hooks/usePlatformApi";
import { demoPaths } from "@/lib/workspace";

type QueuedFile = {
  name: string;
  sizeLabel: string;
  validation: "Ready" | "Needs review";
  note: string;
};

const acceptedTypes = ".pdf,.png,.jpg,.jpeg,.xml,.zip,.xlsx,.csv";

function buildQueuedFile(file: File): QueuedFile {
  const sizeInMb = file.size / (1024 * 1024);
  const needsReview = sizeInMb > 8 || file.name.toLowerCase().endsWith(".csv");

  return {
    name: file.name,
    sizeLabel: `${sizeInMb.toFixed(1)} MB`,
    validation: needsReview ? "Needs review" : "Ready",
    note: needsReview
      ? "Large file or tabular source detected. Normalization will run before extraction."
      : "File structure accepted for ingestion.",
  };
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [selectedChannel, setSelectedChannel] = useState<SourceChannel>("Manual Upload");
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const { data, isError } = useIngestionData();

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

  return (
    <AppShell
      eyebrow="Invoice Ingestion"
      title="Capture invoices from every intake channel"
      description="Set up upload, email, API, ERP, portal, or SFTP ingestion with validation feedback before invoices enter the extraction and control workflow."
      actions={
        <Button variant="hero" className="rounded-xl" onClick={() => navigate(demoPaths.processing)}>
          <CloudUpload className="h-4 w-4" />
          Start processing
        </Button>
      }
    >
      <BackendStatusNotice show={isError} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-tight">Ingestion channels</CardTitle>
              <p className="text-sm text-muted-foreground">
                Pick the source that best reflects how invoices enter your organization.
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {data.channels.map((channel) => (
                <button
                  key={channel.name}
                  type="button"
                  onClick={() => setSelectedChannel(channel.name as SourceChannel)}
                  className={`rounded-3xl border p-5 text-left transition-all ${
                    selectedChannel === channel.name
                      ? "border-primary bg-primary/5 shadow-card"
                      : "border-border/70 bg-slate-50 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-heading text-lg font-semibold text-slate-950">{channel.name}</p>
                    <StatusBadge tone={channel.status === "Connected" ? "success" : "info"}>
                      {channel.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{channel.description}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-tight">
                Batch upload workspace
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Drag PDFs, scans, XML files, ZIP bundles, or spreadsheets into the intake queue.
              </p>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                className="rounded-[28px] border-2 border-dashed border-primary/30 bg-[linear-gradient(145deg,rgba(15,118,110,0.08),rgba(255,255,255,0.9))] p-8"
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
                    Upload up to eight files at once. Accepted formats: PDF, image, XML, ZIP, CSV,
                    and Excel. File-level validation will run before the queue starts.
                  </p>
                  <StatusBadge tone="info" className="mt-4">
                    Best for batch intake and exception triage
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
                    No files queued yet. Select a connected channel or add a batch to simulate the
                    ingestion flow.
                  </div>
                ) : (
                  files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-2xl bg-white p-3 shadow-card">
                          <FileStack className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-950">{file.name}</p>
                          <p className="mt-1 text-sm text-slate-600">{file.sizeLabel}</p>
                          <p className="mt-1 text-sm text-slate-500">{file.note}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge tone={file.validation === "Ready" ? "success" : "warning"}>
                          {file.validation}
                        </StatusBadge>
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
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
              <CardTitle className="font-heading text-2xl tracking-tight">Selected source</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-3xl bg-slate-950 p-5 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-heading text-xl font-semibold">{selectedChannel}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {selectedChannel === "Manual Upload"
                        ? "Use this channel for ad hoc batches, received scans, or spreadsheet-led reconciliations."
                        : "This connected source can continuously push invoices into the control workflow with metadata and attachments."}
                    </p>
                  </div>
                  <Link2 className="h-5 w-5 text-teal-300" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-tight">
                Validation checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                "Verify file type, encryption, and corruption status",
                "Normalize scan quality and split multi-document bundles",
                "Confirm sender, vendor, or API signature trust",
                "Attach PO, GRN, contract, or vendor metadata before extraction",
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
            onClick={() => navigate(demoPaths.processing)}
            disabled={selectedChannel === "Manual Upload" && files.length === 0}
          >
            Launch ingestion workflow
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
