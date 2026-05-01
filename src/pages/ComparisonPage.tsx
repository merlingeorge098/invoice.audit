import { Link, useParams } from "react-router-dom";
import { Check, Download, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppLayout";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApplyComparisonMutation, useInvoiceData } from "@/hooks/usePlatformApi";
import { demoPaths } from "@/lib/workspace";

export default function ComparisonPage() {
  const { id } = useParams();
  const { data: invoice, isError } = useInvoiceData(id);
  const applyComparison = useApplyComparisonMutation(id);

  if (!invoice) {
    return (
      <AppShell
        eyebrow="Correction Workbench"
        title="Invoice not found"
        description="No comparison data is available for the selected invoice."
      >
        <Button asChild variant="outline" className="rounded-xl">
          <Link to={demoPaths.dashboard}>Return to dashboard</Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Correction Workbench"
      title={`Field comparison for ${invoice.invoiceNumber}`}
      description="Review extracted values against submitted content, apply the system suggestion, and preserve the correction rationale for audit."
      actions={
        <Button
          variant="hero"
          className="rounded-xl"
          onClick={() => toast.success("Updated correction package prepared for export.")}
        >
          <Download className="h-4 w-4" />
          Export reviewed file
        </Button>
      }
    >
      <BackendStatusNotice show={isError} />

      <Card className="rounded-3xl border-border/70 bg-card/90">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="font-heading text-2xl tracking-tight">
                Suggested corrections
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Differences between inbound values, extracted output, and recommended fixes.
              </p>
            </div>
            <StatusBadge tone="warning">{invoice.fieldComparisons.length} fields need review</StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-3 font-medium">Field</th>
                <th className="pb-3 font-medium">Submitted</th>
                <th className="pb-3 font-medium">Extracted</th>
                <th className="pb-3 font-medium">Suggestion</th>
                <th className="pb-3 font-medium">Reason</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoice.fieldComparisons.map((comparison) => {
                const applied = comparison.extracted === comparison.suggestion;
                return (
                  <tr key={comparison.field} className="border-b border-border/70 last:border-0">
                    <td className="py-4 pr-4 font-medium text-foreground">{comparison.field}</td>
                    <td className="py-4 pr-4 text-slate-600">{comparison.submitted}</td>
                    <td className="py-4 pr-4">
                      <div className="rounded-2xl bg-slate-50 px-3 py-2 text-slate-700">
                        {comparison.extracted}
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">
                        {comparison.suggestion}
                      </div>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">{comparison.reason}</td>
                    <td className="py-4">
                      <Button
                        variant={applied ? "outline" : "hero"}
                        size="sm"
                        className="rounded-xl"
                        disabled={applyComparison.isPending}
                        onClick={async () => {
                          const result = await applyComparison.mutateAsync(comparison.field);
                          toast.success(result.message);
                        }}
                      >
                        {applied ? (
                          <>
                            <Check className="h-4 w-4" />
                            Applied
                          </>
                        ) : (
                          <>
                            <WandSparkles className="h-4 w-4" />
                            Apply
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
