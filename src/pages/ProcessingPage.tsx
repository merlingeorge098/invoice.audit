import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, ScanSearch, ShieldCheck, Workflow } from "lucide-react";
import { AppShell } from "@/components/AppLayout";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useProcessingData } from "@/hooks/usePlatformApi";
import { demoPaths } from "@/lib/workspace";

export default function ProcessingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const { data, isError } = useProcessingData();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((previous) => {
        if (previous >= data.stages.length - 1) {
          clearInterval(interval);
          setTimeout(() => navigate(demoPaths.dashboard), 900);
          return previous;
        }

        return previous + 1;
      });
    }, 1100);

    return () => clearInterval(interval);
  }, [data.stages.length, navigate]);

  const progressValue = ((currentStep + 1) / data.stages.length) * 100;

  return (
    <AppShell
      eyebrow="Asynchronous Processing"
      title="Running the invoice intelligence pipeline"
      description="The platform is ingesting files, extracting fields, validating policy conditions, scoring risk, and writing the audit trail before routing decisions."
    >
      <BackendStatusNotice show={isError} />

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="font-heading text-2xl tracking-tight">{data.batchId}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  8 files queued across PDF, XML, and spreadsheet sources.
                </p>
              </div>
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={progressValue} className="h-3 bg-slate-100" />
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>{Math.round(progressValue)}% complete</span>
              <span>ETA {data.eta}</span>
            </div>

            <div className="mt-8 space-y-4">
              {data.stages.map((stage, index) => {
                const isComplete = index < currentStep;
                const isActive = index === currentStep;
                return (
                  <div
                    key={stage}
                    className={`rounded-3xl border p-4 transition-all ${
                      isActive
                        ? "border-primary bg-primary/5 shadow-card"
                        : isComplete
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-border/70 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{stage}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {index === 0 && "Capturing source bundle and validating file integrity."}
                          {index === 1 && "Normalizing scan quality, page splits, and table regions."}
                          {index === 2 && "Extracting core fields, line items, and payment metadata."}
                          {index === 3 && "Matching vendor, PO, tax, duplicate, and policy conditions."}
                          {index === 4 && "Assigning explainable risk score and severity classification."}
                          {index === 5 && "Routing for auto-approval, review, evidence, or escalation."}
                          {index === 6 && "Writing immutable timeline, reviewer ownership, and evidence links."}
                        </p>
                      </div>
                      <StatusBadge tone={isComplete ? "success" : isActive ? "info" : "neutral"}>
                        {isComplete ? "Done" : isActive ? "In progress" : "Queued"}
                      </StatusBadge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-tight">
                What the system is doing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-3xl bg-slate-950 p-5 text-white">
                <ScanSearch className="h-5 w-5 text-teal-300" />
                <p className="mt-3 font-heading text-xl font-semibold">Extraction intelligence</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Reading invoice number, vendor details, tax fields, PO references, totals, bank
                  information, and line-item structure.
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <p className="mt-3 font-heading text-xl font-semibold text-slate-950">
                  Validation controls
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Checking vendor master, PO and GRN match, duplicate probability, tax compliance,
                  confidence thresholds, and approval rules.
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <Workflow className="h-5 w-5 text-primary" />
                <p className="mt-3 font-heading text-xl font-semibold text-slate-950">
                  Workflow routing
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Deciding whether each invoice should auto-approve, enter reviewer queue, request
                  evidence, or be blocked and escalated.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
