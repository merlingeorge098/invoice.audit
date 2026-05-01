import {
  AlertTriangle,
  Clock3,
  Download,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppLayout";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReportsData } from "@/hooks/usePlatformApi";
import { formatPercent } from "@/lib/utils";

const metricCards = [
  {
    label: "Exception trend",
    value: "-12%",
    hint: "Flagged invoice rate is down against last month.",
    icon: TrendingUp,
    tone: "success" as const,
  },
  {
    label: "Duplicate alerts",
    value: "6",
    hint: "2 are open in controls review right now.",
    icon: AlertTriangle,
    tone: "warning" as const,
  },
  {
    label: "Approval SLA",
    value: "89%",
    hint: "Invoices are cleared within SLA more consistently this week.",
    icon: Clock3,
    tone: "info" as const,
  },
  {
    label: "Compliance health",
    value: "93%",
    hint: "Most entities are staying inside policy thresholds.",
    icon: ShieldAlert,
    tone: "success" as const,
  },
];

export default function ReportsPage() {
  const { data, isError } = useReportsData();

  return (
    <AppShell
      eyebrow="Analytics and Reporting"
      title="Risk, exception, and approval analytics"
      description="Monitor operational trends, duplicate patterns, vendor risk concentration, and compliance performance by entity or period."
      actions={
        <Button
          variant="hero"
          className="rounded-xl"
          onClick={() => toast.success("Analytics export prepared.")}
        >
          <Download className="h-4 w-4" />
          Export audit pack
        </Button>
      }
    >
      <BackendStatusNotice show={isError} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-tight">
              Exception and duplicate trend
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Weekly line of processed invoices versus flagged and duplicate-prone cases.
            </p>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ea" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="flagged" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                <Bar dataKey="duplicates" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-tight">Exception mix</CardTitle>
            <p className="text-sm text-muted-foreground">
              Category distribution across current exception inventory.
            </p>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.exceptionMix} dataKey="value" innerRadius={68} outerRadius={104} paddingAngle={3}>
                  {data.exceptionMix.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-tight">
              Vendor anomaly leaderboard
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Suppliers with the highest concentration of repeat risk patterns.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.vendorRiskLeaderboard.map((vendor, index) => (
              <div key={vendor.vendor} className="rounded-3xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-950">
                      {index + 1}. {vendor.vendor}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{vendor.issue}</p>
                  </div>
                  <StatusBadge tone={vendor.riskIndex > 80 ? "danger" : "warning"}>
                    Risk {vendor.riskIndex}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-tight">Compliance by entity</CardTitle>
            <p className="text-sm text-muted-foreground">
              Current control posture across manufacturing, distribution, shared services, and projects.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Entity</th>
                  <th className="pb-3 font-medium">Compliant</th>
                  <th className="pb-3 font-medium">Needs review</th>
                  <th className="pb-3 font-medium">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {data.complianceSummary.map((entity) => (
                  <tr key={entity.entity} className="border-b border-border/70 last:border-0">
                    <td className="py-4 pr-4 font-medium text-foreground">{entity.entity}</td>
                    <td className="py-4 pr-4">
                      <StatusBadge tone="success">{formatPercent(entity.compliant)}</StatusBadge>
                    </td>
                    <td className="py-4 pr-4">
                      <StatusBadge tone="warning">{formatPercent(entity.needsReview)}</StatusBadge>
                    </td>
                    <td className="py-4 pr-4">
                      <StatusBadge tone={entity.blocked > 3 ? "danger" : "neutral"}>
                        {formatPercent(entity.blocked)}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
