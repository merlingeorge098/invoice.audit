import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupOrganization } from "@/lib/api";
import { getEnterpriseSession, persistEnterpriseSession } from "@/lib/auth";
import { useAuthSession } from "@/lib/auth-session-context";
import { authPaths } from "@/lib/workspace";

export default function SignupPage() {
  const navigate = useNavigate();
  const { setSession } = useAuthSession();
  const [step, setStep] = useState<"form" | "done">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    organizationName: "",
    tenantSlug: "",
    domain: "",
    adminEmail: "",
    adminName: "",
  });

  function handleChange(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        if (key === "organizationName") {
          next.tenantSlug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        }
        return next;
      });
      setError(null);
    };
  }

  async function handleSubmit() {
    const { organizationName, tenantSlug, domain, adminEmail, adminName } = form;
    if (!organizationName || !tenantSlug || !domain || !adminEmail || !adminName) {
      setError("All fields are required.");
      return;
    }
    if (!adminEmail.includes("@")) {
      setError("Enter a valid admin email address.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(tenantSlug)) {
      setError("Workspace ID can only contain lowercase letters, numbers, and hyphens.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await signupOrganization({ organizationName, tenantSlug, domain, adminEmail, adminName });

      // Bootstrap full session from the returned token then redirect directly to dashboard
      try {
        const fullSession = await getEnterpriseSession(result.sessionToken);
        persistEnterpriseSession(fullSession);
        setSession(fullSession);
        toast.success("Workspace created! Welcome aboard.");
        navigate(result.targetPath ?? `/app/${result.tenantSlug}/dashboard`);
      } catch {
        // Session fetch failed — fall back to showing success screen so user can sign in manually
        setStep("done");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Signup failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.24),_transparent_28%),linear-gradient(160deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-10 lg:px-10">
        <Card className="w-full rounded-[28px] border-white/10 bg-white text-slate-950 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.85)]">
          <CardContent className="p-8 md:p-10">
            {step === "form" ? (
              <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
                {/* Left */}
                <div>
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <Building2 className="h-4 w-4 text-primary" />
                    Create your workspace
                  </div>
                  <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight">
                    Set up Invoice.Audit for your organization
                  </h1>
                  <p className="mt-4 text-base leading-8 text-slate-600">
                    Get a fully-isolated multi-tenant workspace with real invoice processing,
                    RBAC, audit trails, and GST reconciliation — live in under 2 minutes.
                  </p>
                  <div className="mt-8 space-y-3 rounded-3xl bg-slate-50 p-5 text-sm text-slate-700">
                    <p className="font-semibold">What you get on the free plan:</p>
                    <p>• 50 invoices / month, real OCR with GPT-4o</p>
                    <p>• 3 workspace seats</p>
                    <p>• Full audit trail and evidence management</p>
                    <p>• GST reconciliation and vendor master</p>
                    <p>• Upgrade to Pro or Enterprise anytime</p>
                  </div>
                </div>

                {/* Right: form */}
                <div className="rounded-[28px] bg-slate-950 p-6 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
                    Organization details
                  </p>

                  <div className="mt-6 space-y-4">
                    <div>
                      <Label className="text-slate-200">Organization name</Label>
                      <Input
                        className="mt-1 border-white/10 bg-white text-slate-950"
                        placeholder="Acme Corp"
                        value={form.organizationName}
                        onChange={handleChange("organizationName")}
                      />
                    </div>
                    <div>
                      <Label className="text-slate-200">Workspace ID</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-slate-400 text-sm">app/</span>
                        <Input
                          className="border-white/10 bg-white text-slate-950 font-mono"
                          placeholder="acme-corp"
                          value={form.tenantSlug}
                          onChange={handleChange("tenantSlug")}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">Lowercase letters, numbers, hyphens only</p>
                    </div>
                    <div>
                      <Label className="text-slate-200">Company email domain</Label>
                      <Input
                        className="mt-1 border-white/10 bg-white text-slate-950"
                        placeholder="acme.com"
                        value={form.domain}
                        onChange={handleChange("domain")}
                      />
                      <p className="mt-1 text-xs text-slate-400">Your team signs in from this domain</p>
                    </div>
                    <div>
                      <Label className="text-slate-200">Your name</Label>
                      <Input
                        className="mt-1 border-white/10 bg-white text-slate-950"
                        placeholder="Jane Smith"
                        value={form.adminName}
                        onChange={handleChange("adminName")}
                      />
                    </div>
                    <div>
                      <Label className="text-slate-200">Admin email</Label>
                      <Input
                        type="email"
                        className="mt-1 border-white/10 bg-white text-slate-950"
                        placeholder="jane@acme.com"
                        value={form.adminEmail}
                        onChange={handleChange("adminEmail")}
                      />
                    </div>
                  </div>

                  {error ? (
                    <div className="mt-4 rounded-2xl border border-rose-300/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                      {error}
                    </div>
                  ) : null}

                  <Button
                    variant="hero"
                    className="mt-6 w-full rounded-xl"
                    onClick={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? "Creating workspace..." : "Create workspace"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  <p className="mt-4 text-center text-xs text-slate-400">
                    Already have an account?{" "}
                    <Link to={authPaths.start} className="text-teal-300 hover:underline">
                      Sign in
                    </Link>
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-lg text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
                <h1 className="mt-6 font-heading text-4xl font-semibold tracking-tight">
                  Workspace created!
                </h1>
                <p className="mt-4 text-base leading-8 text-slate-600">
                  We've sent a login code to{" "}
                  <span className="font-medium text-slate-900">{form.adminEmail}</span>. Check your
                  email and sign in to start auditing invoices.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button asChild variant="hero" className="rounded-xl">
                    <Link to={authPaths.start}>
                      Sign in to your workspace
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Your workspace ID:{" "}
                  <span className="font-mono font-medium text-slate-900">{form.tenantSlug}</span>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-100 pt-6">
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/">
                  <ArrowLeft className="h-4 w-4" />
                  Back to home
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
