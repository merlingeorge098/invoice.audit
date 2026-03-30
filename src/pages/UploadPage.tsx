import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, X, File } from "lucide-react";

export default function UploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [templateMode, setTemplateMode] = useState<"default" | "custom" | null>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).slice(0, 5);
    setFiles((prev) => [...prev, ...dropped].slice(0, 5));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).slice(0, 5);
      setFiles((prev) => [...prev, ...selected].slice(0, 5));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container max-w-3xl py-12">
        <h1 className="text-3xl font-bold text-foreground">Upload Invoices</h1>
        <p className="mt-2 text-muted-foreground">Choose a template or upload your own Excel file to get started.</p>

        {/* Template Selection */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setTemplateMode("default")}
            className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-8 transition-all duration-200 ${
              templateMode === "default"
                ? "border-primary bg-secondary shadow-elevated"
                : "border-border bg-card hover:border-primary/40 hover:shadow-card"
            }`}
          >
            <FileSpreadsheet className="h-10 w-10 text-primary" />
            <span className="text-lg font-semibold text-foreground">Use Default Template</span>
            <span className="text-sm text-muted-foreground">Pre-formatted Excel template</span>
          </button>
          <button
            onClick={() => setTemplateMode("custom")}
            className={`flex flex-col items-center gap-3 rounded-2xl border-2 p-8 transition-all duration-200 ${
              templateMode === "custom"
                ? "border-primary bg-secondary shadow-elevated"
                : "border-border bg-card hover:border-primary/40 hover:shadow-card"
            }`}
          >
            <Upload className="h-10 w-10 text-primary" />
            <span className="text-lg font-semibold text-foreground">Upload Your Excel File</span>
            <span className="text-sm text-muted-foreground">Use your own spreadsheet</span>
          </button>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="mt-8 flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 transition-colors hover:border-primary/40"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <Upload className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium text-foreground">Drag & drop invoice files here</p>
            <p className="mt-1 text-sm text-muted-foreground">or click to browse (up to 5 files)</p>
          </div>
          <input id="file-input" type="file" multiple accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={handleFileInput} />
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Uploaded Files ({files.length}/5)</h3>
            {files.map((file, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-card">
                <div className="flex items-center gap-3">
                  <File className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button onClick={() => removeFile(i)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="hero"
          size="lg"
          className="mt-8 w-full"
          onClick={() => navigate("/processing")}
          disabled={files.length === 0 && !templateMode}
        >
          Start Verification
        </Button>
      </div>
    </div>
  );
}
