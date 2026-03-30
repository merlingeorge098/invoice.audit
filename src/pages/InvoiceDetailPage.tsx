import { useParams, Link } from "react-router-dom";
import { AppHeader } from "@/components/AppLayout";
import { mockInvoices, type InvoiceStatus } from "@/data/mockInvoices";
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const statusIcon: Record<InvoiceStatus, typeof CheckCircle> = {
  verified: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
};
const statusColor: Record<InvoiceStatus, string> = {
  verified: "text-success",
  warning: "text-warning",
  error: "text-destructive",
};
const statusBg: Record<InvoiceStatus, string> = {
  verified: "bg-success/10",
  warning: "bg-warning/10",
  error: "bg-destructive/10",
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const invoice = mockInvoices.find((inv) => inv.id === id);

  if (!invoice) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container py-20 text-center">
          <p className="text-lg text-muted-foreground">Invoice not found.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container max-w-4xl py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
          </Link>
        </Button>

        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">{invoice.invoiceNumber}</h1>
          <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${statusBg[invoice.status]} ${statusColor[invoice.status]}`}>
            {(() => { const Icon = statusIcon[invoice.status]; return <Icon className="h-4 w-4" />; })()}
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </span>
        </div>

        {/* Basic Details */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-lg font-semibold text-card-foreground">Basic Details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              ["Vendor", invoice.vendorName],
              ["GSTIN", invoice.gstin],
              ["Amount", `₹${invoice.amount.toLocaleString()}`],
              ["Date", invoice.date],
              ["Address", invoice.details.address],
              ["Email", invoice.details.email],
              ["Phone", invoice.details.phone],
              ["Description", invoice.details.description],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className="mt-1 text-sm font-medium text-card-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Validation Results */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-lg font-semibold text-card-foreground">Validation Results</h2>
          <div className="mt-4 space-y-3">
            {invoice.validationResults.map((v) => {
              const Icon = statusIcon[v.status];
              return (
                <div
                  key={v.field}
                  className={`flex items-start gap-3 rounded-xl p-4 ${statusBg[v.status]}`}
                >
                  <Icon className={`h-5 w-5 mt-0.5 ${statusColor[v.status]}`} />
                  <div>
                    <p className={`text-sm font-semibold ${statusColor[v.status]}`}>{v.field}</p>
                    <p className="text-sm text-foreground/80">{v.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Issues */}
        {invoice.status !== "verified" && Object.keys(invoice.suggestedFixes).length > 0 && (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <h2 className="text-lg font-semibold text-foreground">Issues Found</h2>
            <div className="mt-4 space-y-3">
              {Object.entries(invoice.suggestedFixes).map(([field, suggested]) => (
                <div key={field} className="flex items-center justify-between rounded-xl bg-card p-4 border border-border">
                  <div>
                    <p className="text-sm font-semibold text-destructive">{field}</p>
                    <p className="text-xs text-muted-foreground">
                      Current: <span className="text-destructive font-mono">{invoice.excelData[field]}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Suggested</p>
                    <p className="text-sm font-medium text-success font-mono">{suggested}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/comparison">Fix in Comparison View</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
