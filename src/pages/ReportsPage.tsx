import { AppHeader } from "@/components/AppLayout";
import { mockInvoices } from "@/data/mockInvoices";
import { Button } from "@/components/ui/button";
import { Download, FileText, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

export default function ReportsPage() {
  const verified = mockInvoices.filter((i) => i.status === "verified").length;
  const warnings = mockInvoices.filter((i) => i.status === "warning").length;
  const errors = mockInvoices.filter((i) => i.status === "error").length;

  const chartData = [
    { name: "Verified", value: verified, color: "hsl(142, 71%, 45%)" },
    { name: "Warnings", value: warnings, color: "hsl(38, 92%, 50%)" },
    { name: "Errors", value: errors, color: "hsl(0, 84%, 60%)" },
  ];

  const totalAmount = mockInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container max-w-4xl py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Verification Report</h1>
            <p className="mt-1 text-muted-foreground">Summary of all invoice verification results</p>
          </div>
          <Button variant="hero" onClick={() => toast.success("Report download started!")}>
            <Download className="h-4 w-4" />
            Download Excel Report
          </Button>
        </div>

        {/* Summary */}
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            { label: "Total Invoices", value: mockInvoices.length, icon: FileText, color: "text-primary" },
            { label: "Verified", value: verified, icon: CheckCircle, color: "text-success" },
            { label: "Warnings", value: warnings, icon: AlertTriangle, color: "text-warning" },
            { label: "Errors", value: errors, icon: XCircle, color: "text-destructive" },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
              <p className="mt-2 text-2xl font-bold text-card-foreground">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-lg font-semibold text-card-foreground">Verification Breakdown</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} dataKey="value">
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    fontSize: "13px",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Amount Summary */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-card">
          <h2 className="text-lg font-semibold text-card-foreground">Financial Summary</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Invoice Amount</p>
              <p className="mt-1 text-2xl font-bold text-card-foreground">₹{totalAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Verified Amount</p>
              <p className="mt-1 text-2xl font-bold text-success">
                ₹{mockInvoices.filter((i) => i.status === "verified").reduce((s, i) => s + i.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
