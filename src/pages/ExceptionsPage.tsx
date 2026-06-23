import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, Eye, ShieldAlert, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/AppLayout";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type RiskLevel, type Severity } from "@/data/platformData";
import { useExceptionsData } from "@/hooks/usePlatformApi";
import { useCurrentWorkspace } from "@/lib/workspace-context";
import { formatCurrency } from "@/lib/utils";

const severityTone: Record<Severity, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

const riskTone: Record<RiskLevel, "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

export default function ExceptionsPage() {
  const [selectedType, setSelectedType] = useState("All exceptions");
  const { data, isError } = useExceptionsData(selectedType);
  const { paths } = useCurrentWorkspace();

  return (
    <AppShell
      eyebrow="Exceptions and Alerts"
      title="Flagged invoice review queue"
      description="Filter anomalies by type, severity, reviewer ownership, and aging so reviewers can act on the highest-risk invoices first."
      actions={
        <Button asChild variant="hero" className="rounded-xl">
          <Link to={paths.reports}>
            See analytics
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <BackendStatusNotice show={isError} />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="High-severity cases"
          value={String(data.summary.highestSeverityCount)}
          hint="Duplicate and fraud-style alerts with blocking potential."
          icon={ShieldAlert}
          tone="danger"
        />
        <MetricCard
          label="SLA breaches"
          value={String(data.summary.slaBreaches)}
          hint="Invoices that have been sitting more than 24 hours."
          icon={Clock3}
          tone="warning"
        />
        <MetricCard
          label="Evidence requests"
          value={String(data.summary.evidenceRequests)}
          hint="Cases waiting on vendor documentation before approval."
          icon={TriangleAlert}
          tone="info"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {data.filterOptions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSelectedType(option)}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              selectedType === option
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground shadow-card"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <Card className="mt-6 rounded-3xl border-border/70 bg-card/90">
        <CardHeader>
          <CardTitle className="font-heading text-2xl tracking-tight">Exceptions list</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each row shows risk severity, reviewer ownership, aging, and the next place to work.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.invoices.map((invoice) => {
            const dominantSeverity = invoice.flags[0]?.severity ?? "low";
            return (
              <div key={invoice.id} className="rounded-3xl border border-border/70 bg-slate-50 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-heading text-xl font-semibold text-slate-950">
                        {invoice.invoiceNumber}
                      </p>
                      <StatusBadge tone={riskTone[invoice.riskLevel]}>
                        {invoice.riskLevel} risk {invoice.riskScore}
                      </StatusBadge>
                      <StatusBadge tone={severityTone[dominantSeverity]}>
                        {dominantSeverity} severity
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {invoice.vendorName} | {formatCurrency(invoice.amount)} | {invoice.entity}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{invoice.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {invoice.anomalyTypes.map((type) => (
                        <StatusBadge key={type}>{type}</StatusBadge>
                      ))}
                    </div>
                  </div>

                  <div className="flex min-w-[260px] flex-col gap-3 rounded-3xl bg-white p-4 shadow-card">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">Owner</span>
                      <span className="font-medium text-slate-950">{invoice.assignedReviewer}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">Aging</span>
                      <span className="font-medium text-slate-950">{invoice.agingHours}h</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">Duplicate likelihood</span>
                      <span className="font-medium text-slate-950">{invoice.duplicateLikelihood}%</span>
                    </div>
                    <Button asChild variant="outline" className="mt-2 rounded-2xl">
                      <Link to={paths.invoice(invoice.id)}>
                        <Eye className="h-4 w-4" />
                        Open review
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </AppShell>
  );
}
