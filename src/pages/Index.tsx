import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCheck,
  LockKeyhole,
  ShieldCheck,
  ShieldEllipsis,
  Sparkles,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { demoPaths, workspaceEntryPath } from "@/lib/workspace";

const controlPillars = [
  {
    title: "Validate before payment",
    description:
      "Cross-check invoices against vendor master, POs, GRNs, contracts, and configurable policy rules.",
  },
  {
    title: "Score anomalies clearly",
    description:
      "Surface duplicate, fraud, tax, and approval-risk signals with explainable reasoning and confidence.",
  },
  {
    title: "Preserve audit evidence",
    description:
      "Keep a tamper-evident record of system decisions, reviewer actions, and supporting documents.",
  },
];

const trustSignals = [
  { label: "MFA for admins", icon: LockKeyhole },
  { label: "Role-based access", icon: ShieldCheck },
  { label: "Tamper-evident audit trail", icon: ShieldEllipsis },
];

export default function Index() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("finance.manager@northwind.com");
  const [password, setPassword] = useState("demo-password");

  const handleExploreDemo = () => {
    if (!email || !password) {
      toast.error("Enter an email and password to open the demo workspace.");
      return;
    }

    toast.success("Opening the shared enterprise demo workspace.");
    navigate(demoPaths.dashboard);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.24),_transparent_28%),linear-gradient(160deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="mx-auto grid min-h-screen max-w-7xl gap-12 px-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
        <div className="flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
              <Sparkles className="h-4 w-4 text-teal-300" />
              Invoice.Audit for finance controls and audit readiness
            </div>
            <h1 className="mt-8 max-w-3xl font-heading text-5xl font-semibold tracking-tight text-white md:text-6xl">
              Intelligent invoice assurance before payment is ever released.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              A control-first platform for invoice ingestion, extraction, validation, risk scoring,
              workflow routing, and audit evidence. Built for AP teams, finance managers, and
              internal auditors who need clarity at speed.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {controlPillars.map((pillar) => (
                <Card
                  key={pillar.title}
                  className="rounded-3xl border-white/10 bg-white/5 text-white shadow-[0_28px_80px_-50px_rgba(15,118,110,0.7)]"
                >
                  <CardContent className="p-6">
                    <p className="font-heading text-lg font-semibold">{pillar.title}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{pillar.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-12 flex flex-wrap gap-3">
            {trustSignals.map((signal) => (
              <div
                key={signal.label}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
              >
                <signal.icon className="h-4 w-4 text-teal-300" />
                {signal.label}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center">
          <Card className="w-full rounded-[28px] border-white/10 bg-white text-slate-950 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.85)]">
            <CardContent className="p-7 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <StatusBadge tone="info">Secure Login</StatusBadge>
                  <h2 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-slate-950">
                    Access the control workspace
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Sign in with your finance identity provider or use the demo credentials below.
                  </p>
                </div>
                <div className="hidden shrink-0 rounded-3xl bg-slate-950 px-4 py-3 text-sm text-white sm:block">
                  <Workflow className="mb-2 h-5 w-5 text-teal-300" />
                  SSO + MFA
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Demo email</label>
                  <Input value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Demo password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <Button variant="hero" size="lg" className="w-full" onClick={handleExploreDemo}>
                  Explore Demo
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="hero" size="lg" className="w-full" onClick={() => navigate(workspaceEntryPath)}>
                  Enter Your Workspace
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-8 rounded-3xl bg-slate-50 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-heading text-lg font-semibold text-slate-950">
                      Workspace preview
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Review queue, exception handling, and audit trail visibility.
                    </p>
                  </div>
                  <Link to={demoPaths.dashboard} className="text-sm font-medium text-primary">
                    Open demo
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 shadow-card">
                    <p className="text-sm font-medium text-slate-500">Today</p>
                    <p className="mt-2 font-heading text-3xl font-semibold text-slate-950">42</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      <CheckCheck className="h-4 w-4 text-emerald-600" />
                      pending review decisions
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 shadow-card">
                    <p className="text-sm font-medium text-slate-500">Controls</p>
                    <p className="mt-2 font-heading text-3xl font-semibold text-slate-950">9</p>
                    <p className="mt-2 text-sm text-slate-600">high-risk invoices currently blocked</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
