import { Link } from "react-router-dom";
import {
  Activity,
  Clock3,
  Copy,
  Eye,
  FileText,
  ShieldAlert,
  TimerReset,
  Upload,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { AppShell } from "@/components/AppLayout";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type RiskLevel, type WorkflowStatus } from "@/data/platformData";
import { useDashboardData } from "@/hooks/usePlatformApi";
import { demoPaths } from "@/lib/workspace";
import { formatCurrency } from "@/lib/utils";

const metricIcons = [FileText, Activity, ShieldAlert, Copy, TimerReset, Clock3];

const statusTone: Record<WorkflowStatus, "info" | "warning" | "danger" | "success"> = {
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

function formatStatusLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function DashboardPage() {
  const { data, isError } = useDashboardData();

  return (
    <AppShell
      eyebrow="Main Dashboard"
      title="Invoice operations command center"
      description="Track ingestion volume, review backlog, exception risk, and workflow throughput across the invoice assurance lifecycle."
      actions={
        <Button asChild variant="hero" className="rounded-xl">
          <Link to={demoPaths.upload}>
            <Upload className="h-4 w-4" />
            New intake
          </Link>
        </Button>
      }
    >
      <BackendStatusNotice show={isError} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.metrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            icon={metricIcons[index]}
            tone={metric.tone}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="font-heading text-2xl tracking-tight">
                  Invoice flow over the week
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Processed volume versus flagged invoices and duplicate alerts.
                </p>
              </div>
              <StatusBadge tone="info">Auto-refreshing analytics</StatusBadge>
            </div>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="processedFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="flaggedFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="processed"
                  stroke="#0f766e"
                  strokeWidth={2}
                  fill="url(#processedFill)"
                />
                <Area
                  type="monotone"
                  dataKey="flagged"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#flaggedFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader className="pb-4">
            <CardTitle className="font-heading text-2xl tracking-tight">Workflow load</CardTitle>
            <p className="text-sm text-muted-foreground">
              Current routing posture across automation, review, evidence, and controls.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.workflowLanes.map((lane) => (
              <div key={lane.label} className="rounded-3xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-lg font-semibold text-slate-950">{lane.label}</p>
                    <p className="mt-1 text-sm text-slate-600">{lane.description}</p>
                  </div>
                  <p className="font-heading text-3xl font-semibold text-slate-950">{lane.count}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="font-heading text-2xl tracking-tight">Reviewer queue</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Priority invoices with visible risk, confidence, and next action.
                </p>
              </div>
              <Button asChild variant="outline" className="rounded-xl">
                <Link to={demoPaths.exceptions}>View exceptions</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Invoice</th>
                  <th className="pb-3 font-medium">Vendor</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Risk</th>
                  <th className="pb-3 font-medium">Confidence</th>
                  <th className="pb-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.reviewerQueue.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border/70 last:border-0">
                    <td className="py-4 pr-4">
                      <p className="font-medium text-foreground">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{invoice.sourceChannel}</p>
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-medium text-foreground">{invoice.vendorName}</p>
                      <p className="text-xs text-muted-foreground">{invoice.entity}</p>
                    </td>
                    <td className="py-4 pr-4 font-medium text-foreground">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusBadge tone={statusTone[invoice.status]}>
                        {formatStatusLabel(invoice.status)}
                      </StatusBadge>
                    </td>
                    <td className="py-4 pr-4">
                      <StatusBadge tone={riskTone[invoice.riskLevel]}>
                        {invoice.riskLevel.toUpperCase()} {invoice.riskScore}
                      </StatusBadge>
                    </td>
                    <td className="py-4 pr-4 text-foreground">{invoice.confidence}%</td>
                    <td className="py-4">
                      <Button asChild variant="ghost" size="sm" className="rounded-xl">
                        <Link to={demoPaths.invoice(invoice.id)}>
                          <Eye className="h-4 w-4" />
                          Review
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader className="pb-4">
            <CardTitle className="font-heading text-2xl tracking-tight">Control insights</CardTitle>
            <p className="text-sm text-muted-foreground">
              Immediate hotspots that warrant reviewer or controller attention.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.insights.map((invoice) => (
              <div key={invoice.id} className="rounded-3xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">{invoice.vendorName}</p>
                    <p className="mt-1 text-sm text-slate-600">{invoice.summary}</p>
                  </div>
                  <StatusBadge tone={riskTone[invoice.riskLevel]}>{invoice.riskLevel}</StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {invoice.anomalyTypes.slice(0, 2).map((anomaly) => (
                    <StatusBadge key={anomaly}>{anomaly}</StatusBadge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
