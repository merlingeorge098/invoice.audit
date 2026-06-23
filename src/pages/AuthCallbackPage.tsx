import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { completeEnterpriseAuth, persistEnterpriseSession } from "@/lib/auth";
import { useAuthSession } from "@/lib/auth-session-context";
import { authPaths, entryPath } from "@/lib/workspace";

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const authRequestId = searchParams.get("requestId");
  const { setSession } = useAuthSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!authRequestId) {
      setStatus("error");
      setError("The callback is missing the auth request reference.");
      return;
    }

    let isActive = true;

    completeEnterpriseAuth(authRequestId)
      .then((nextSession) => {
        if (!isActive) return;
        persistEnterpriseSession(nextSession);
        setSession(nextSession);
        setStatus("success");
        navigate(nextSession.targetPath, { replace: true });
      })
      .catch((nextError: Error) => {
        if (!isActive) return;
        setError(nextError.message);
        setStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, [authRequestId, setSession, navigate]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.24),_transparent_28%),linear-gradient(160deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-10 lg:px-10">
        <Card className="w-full rounded-[28px] border-white/10 bg-white text-slate-950 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.85)]">
          <CardContent className="p-8 md:p-10">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Enterprise authentication callback
            </div>

            {status === "loading" ? (
              <>
                <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-slate-950">
                  Establishing your workspace session
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                  The mock identity provider response is being validated and mapped to an
                  organization, workspace, and role.
                </p>
                <div className="mt-8 flex items-center gap-3 rounded-3xl bg-slate-50 p-5 text-slate-700">
                  <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                  Creating the tenant-scoped session model for the next routing phase.
                </div>
              </>
            ) : null}

            {status === "error" ? (
              <>
                <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-slate-950">
                  Workspace sign-in could not be completed
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                  {error ?? "The callback request could not be validated."}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild variant="hero" className="rounded-xl">
                    <Link to={authPaths.start}>Try enterprise sign-in again</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to={entryPath}>
                      <ArrowLeft className="h-4 w-4" />
                      Back to entry
                    </Link>
                  </Button>
                </div>
              </>
            ) : null}

            {status === "success" && session ? (
              <>
                <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-slate-950">
                  Workspace session established for {session.organizationName}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                  Identity was mapped to the <span className="font-medium">{session.role}</span>{" "}
                  role, the workspace session was created, and the reserved tenant route is ready
                  for the next implementation step.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <Building2 className="h-5 w-5 text-primary" />
                    <p className="mt-3 font-heading text-xl font-semibold text-slate-950">
                      Session details
                    </p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                      <p>{session.displayName}</p>
                      <p>{session.email}</p>
                      <p>{session.workspaceName}</p>
                      <p>Tenant slug: {session.tenantSlug}</p>
                    </div>
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-5">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <p className="mt-3 font-heading text-xl font-semibold text-slate-950">
                      Enterprise posture
                    </p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                      <p>{session.provider.providerLabel}</p>
                      <p>{session.provider.protocol} discovery flow</p>
                      <p>MFA: {session.assurance.mfa}</p>
                      <p>Reserved route: {session.targetPath}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Ready for phase 3
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Tenant-aware route guards and workspace shells are next. Until then, you can
                    continue exploring the product in demo mode while keeping this enterprise
                    session persisted locally.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild variant="hero" className="rounded-xl">
                    <Link to={session.targetPath}>
                      Enter tenant workspace
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to={authPaths.start}>View sign-in details</Link>
                  </Button>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
