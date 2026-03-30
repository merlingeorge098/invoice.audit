import { useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@/components/AppLayout";
import { mockInvoices, type InvoiceStatus } from "@/data/mockInvoices";
import { FileText, CheckCircle, AlertTriangle, XCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

const statusConfig: Record<InvoiceStatus, { label: string; class: string; icon: typeof CheckCircle }> = {
  verified: { label: "Verified", class: "bg-success/10 text-success", icon: CheckCircle },
  warning: { label: "Warning", class: "bg-warning/10 text-warning", icon: AlertTriangle },
  error: { label: "Error", class: "bg-destructive/10 text-destructive", icon: XCircle },
};

const riskColors = { low: "text-success", medium: "text-warning", high: "text-destructive" };

export default function DashboardPage() {
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");

  const filtered = filter === "all" ? mockInvoices : mockInvoices.filter((inv) => inv.status === filter);
  const total = mockInvoices.length;
  const verified = mockInvoices.filter((i) => i.status === "verified").length;
  const issues = mockInvoices.filter((i) => i.status !== "verified").length;

  const summaryCards = [
    { label: "Total Invoices", value: total, icon: FileText, color: "text-primary" },
    { label: "Verified", value: verified, icon: CheckCircle, color: "text-success" },
    { label: "Issues Found", value: issues, icon: AlertTriangle, color: "text-warning" },
  ];

  const filters: { label: string; value: "all" | InvoiceStatus }[] = [
    { label: "Show All", value: "all" },
    { label: "Verified", value: "verified" },
    { label: "Warnings", value: "warning" },
    { label: "Errors", value: "error" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container py-8">
        <h1 className="text-3xl font-bold text-foreground">Verification Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Overview of your invoice verification results</p>

        {/* Summary Cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <p className="mt-2 text-3xl font-bold text-card-foreground">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-8 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                filter === f.value
                  ? "gradient-primary text-primary-foreground shadow-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Invoice Number</th>
                <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Vendor Name</th>
                <th className="px-6 py-3 text-left font-semibold text-muted-foreground hidden sm:table-cell">GSTIN</th>
                <th className="px-6 py-3 text-right font-semibold text-muted-foreground">Amount</th>
                <th className="px-6 py-3 text-center font-semibold text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-center font-semibold text-muted-foreground hidden md:table-cell">Risk</th>
                <th className="px-6 py-3 text-center font-semibold text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const sc = statusConfig[inv.status];
                return (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-card-foreground">{inv.invoiceNumber}</td>
                    <td className="px-6 py-4 text-card-foreground">{inv.vendorName}</td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs hidden sm:table-cell">{inv.gstin}</td>
                    <td className="px-6 py-4 text-right font-medium text-card-foreground">₹{inv.amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${sc.class}`}>
                        <sc.icon className="h-3.5 w-3.5" />
                        {sc.label}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-center capitalize font-medium hidden md:table-cell ${riskColors[inv.riskLevel]}`}>
                      {inv.riskLevel}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/invoice/${inv.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
