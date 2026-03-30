import { useState } from "react";
import { AppHeader } from "@/components/AppLayout";
import { mockInvoices } from "@/data/mockInvoices";
import { Button } from "@/components/ui/button";
import { Download, Check } from "lucide-react";
import { toast } from "sonner";

export default function ComparisonPage() {
  const columns = Object.keys(mockInvoices[0].excelData);
  const [data, setData] = useState(
    mockInvoices.map((inv) => ({ ...inv.excelData, _id: inv.id, _fixes: inv.suggestedFixes }))
  );

  const hasFix = (rowId: string, col: string) => {
    const inv = mockInvoices.find((i) => i.id === rowId);
    return inv?.suggestedFixes[col] !== undefined;
  };

  const getSuggestion = (rowId: string, col: string) => {
    const inv = mockInvoices.find((i) => i.id === rowId);
    return inv?.suggestedFixes[col];
  };

  const handleCellChange = (rowIndex: number, col: string, value: string) => {
    setData((prev) => prev.map((row, i) => (i === rowIndex ? { ...row, [col]: value } : row)));
  };

  const applySuggestion = (rowIndex: number, col: string) => {
    const suggestion = getSuggestion(data[rowIndex]._id, col);
    if (suggestion) {
      handleCellChange(rowIndex, col, suggestion);
      toast.success(`Applied suggested value for ${col}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Excel Comparison</h1>
            <p className="mt-1 text-muted-foreground">Review and correct mismatched values</p>
          </div>
          <Button
            variant="hero"
            onClick={() => toast.success("File saved! Download will start shortly.")}
          >
            <Download className="h-4 w-4" />
            Save & Download Updated File
          </Button>
        </div>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {columns.map((col) => (
                  <th key={col} className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, ri) => (
                <tr key={row._id} className="border-b border-border last:border-0">
                  {columns.map((col) => {
                    const isMismatch = hasFix(row._id, col);
                    const suggestion = getSuggestion(row._id, col);
                    const isFixed = suggestion && row[col] === suggestion;
                    return (
                      <td key={col} className="px-4 py-2 relative">
                        <div className="flex items-center gap-1">
                          <input
                            value={row[col] || ""}
                            onChange={(e) => handleCellChange(ri, col, e.target.value)}
                            className={`w-full rounded-lg border px-3 py-2 text-sm font-mono transition-colors ${
                              isFixed
                                ? "border-success/40 bg-success/5 text-success"
                                : isMismatch
                                ? "border-destructive/40 bg-destructive/5 text-destructive"
                                : "border-border bg-background text-foreground"
                            }`}
                          />
                          {isMismatch && !isFixed && (
                            <button
                              onClick={() => applySuggestion(ri, col)}
                              className="shrink-0 rounded-lg bg-success/10 p-1.5 text-success hover:bg-success/20 transition-colors"
                              title={`Apply suggestion: ${suggestion}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {isMismatch && !isFixed && (
                          <p className="mt-0.5 text-[10px] text-success">Suggested: {suggestion}</p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
