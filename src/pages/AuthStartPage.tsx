import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  discoverOrganization,
  signOutEnterpriseSession,
  startEnterpriseAuth,
  type DiscoveryResponse,
} from "@/lib/auth";
import { useAuthSession } from "@/lib/auth-session-context";
import { demoPaths, entryPath } from "@/lib/workspace";

const exampleEmails = [
  "finance.manager@northwind.com",
  "controller@acme.com",
  "auditor@globex.com",
];

export default function AuthStartPage() {
  const navigate = useNavigate();
  const { session, clearSession } = useAuthSession();
  const [email, setEmail] = useState("finance.manager@northwind.com");
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isClearingSession, setIsClearingSession] = useState(false);

  async function handleDiscover() {
    setIsDiscovering(true);
    setError(null);

    try {
      const result = await discoverOrganization(email);
      setDiscovery(result);
      toast.success(`Organization discovery matched ${result.organization.organizationName}.`);
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Organization discovery failed.";
      setDiscovery(null);
      setError(message);
      toast.error(message);
    } finally {
      setIsDiscovering(false);
    }
  }

  async function handleStartAuth() {
    setIsStarting(true);
    setError(null);

    try {
      const result = await startEnterpriseAuth(email);
      toast.success(`Routing to ${result.provider.providerLabel}.`);
      navigate(result.callbackUrl);
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Enterprise sign-in could not start.";
      setError(message);
      toast.error(message);
    } finally {
      setIsStarting(false);
    }
  }

  async function handleClearSession() {
    if (!session) {
      return;
    }

    setIsClearingSession(true);

    try {
      await signOutEnterpriseSession(session.sessionToken);
    } catch {
      // Clear the local session even if the mock API session is already gone.
    } finally {
      clearSession();
      setIsClearingSession(false);
      toast.success("Enterprise session cleared.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.24),_transparent_28%),linear-gradient(160deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-10 lg:px-10">
        <Card className="w-full rounded-[28px] border-white/10 bg-white text-slate-950 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.85)]">
          <CardContent className="p-8 md:p-10">
            <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Authentication start and organization discovery
                </div>

                <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-slate-950">
                  Discover the right enterprise sign-in path from a work email
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                  This mock enterprise flow identifies the organization by email domain, maps the
                  user to a workspace and role, and provisions a session model we can reuse when
                  tenant routing is introduced.
                </p>

                <div className="mt-8 rounded-3xl bg-slate-50 p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Try one of the seeded enterprise identities
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {exampleEmails.map((exampleEmail) => (
                      <button
                        key={exampleEmail}
                        type="button"
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition-colors hover:border-primary hover:text-primary"
                        onClick={() => {
                          setEmail(exampleEmail);
                          setDiscovery(null);
                          setError(null);
                        }}
                      >
                        {exampleEmail}
                      </button>
                    ))}
                  </div>
                </div>

                {session ? (
                  <div className="mt-8 rounded-3xl border border-teal-200 bg-teal-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                      Active enterprise session
                    </p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      <p>{session.organizationName}</p>
                      <p>
                        {session.displayName} ({session.role})
                      </p>
                      <p>Reserved route: {session.targetPath}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={handleClearSession}
                        disabled={isClearingSession}
                      >
                        {isClearingSession ? "Clearing session..." : "Clear enterprise session"}
                      </Button>
                      <Button asChild variant="hero" className="rounded-xl">
                        <Link to={demoPaths.dashboard}>Open demo workspace</Link>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[28px] bg-slate-950 p-6 text-white shadow-[0_40px_100px_-60px_rgba(15,23,42,0.85)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
                      Enterprise login start
                    </p>
                    <h2 className="mt-4 font-heading text-3xl font-semibold tracking-tight">
                      Enter your work email
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Supported mock domains: acme.com, northwind.com, and globex.com.
                    </p>
                  </div>
                  <div className="rounded-3xl bg-white/10 px-4 py-3 text-sm text-white">
                    <Mail className="mb-2 h-5 w-5 text-teal-300" />
                    Domain lookup
                  </div>
                </div>

                <div className="mt-8">
                  <label className="mb-2 block text-sm font-medium text-slate-200">Work email</label>
                  <Input
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setDiscovery(null);
                      setError(null);
                    }}
                    className="border-white/10 bg-white text-slate-950"
                    placeholder="name@company.com"
                  />
                </div>

                {error ? (
                  <div className="mt-4 rounded-2xl border border-rose-300/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    className="rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={handleDiscover}
                    disabled={isDiscovering || isStarting}
                  >
                    {isDiscovering ? "Discovering..." : "Discover organization"}
                  </Button>
                  <Button
                    variant="hero"
                    className="rounded-xl"
                    onClick={handleStartAuth}
                    disabled={isDiscovering || isStarting}
                  >
                    {isStarting ? "Starting sign-in..." : "Continue with enterprise sign-in"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

                {discovery ? (
                  <div className="mt-8 rounded-3xl bg-white/10 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
                      Discovery result
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white/10 p-4">
                        <Building2 className="h-5 w-5 text-teal-300" />
                        <p className="mt-3 font-heading text-xl font-semibold">
                          {discovery.organization.organizationName}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          Workspace: {discovery.organization.workspaceName}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          Tenant slug: {discovery.organization.tenantSlug}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-4">
                        <ShieldCheck className="h-5 w-5 text-teal-300" />
                        <p className="mt-3 font-heading text-xl font-semibold">
                          {discovery.provider.providerLabel}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          Protocol: {discovery.provider.protocol}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          MFA posture: {discovery.provider.mfa}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link to={entryPath}>
                      <ArrowLeft className="h-4 w-4" />
                      Back to entry
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="rounded-xl text-slate-200 hover:bg-white/10 hover:text-white"
                  >
                    <Link to={demoPaths.dashboard}>Explore demo instead</Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
