import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getInviteInfo, acceptInvite } from "@/lib/api";
import { authPaths } from "@/lib/workspace";

type InviteInfo = {
  email: string;
  role: string;
  organizationName: string;
  workspaceName: string;
  inviterName: string;
  tenantSlug: string;
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "accepting" | "done" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Invalid invite link.");
      return;
    }
    getInviteInfo(token)
      .then((info) => {
        setInvite(info);
        setStatus("ready");
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "This invite link is invalid or has expired.");
      });
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setStatus("accepting");
    try {
      await acceptInvite(token);
      setStatus("done");
      toast.success("Invite accepted — please sign in to access your workspace.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not accept invite.";
      setErrorMsg(message);
      setStatus("error");
      toast.error(message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.24),_transparent_28%),linear-gradient(160deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-10 lg:px-10">
        <Card className="w-full rounded-[28px] border-white/10 bg-white text-slate-950 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.85)]">
          <CardContent className="p-8 md:p-10">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Workspace invitation
            </div>

            {status === "loading" ? (
              <div className="mt-8 flex items-center gap-3 text-slate-600">
                <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                Validating your invitation…
              </div>
            ) : null}

            {status === "error" ? (
              <>
                <XCircle className="mt-8 h-12 w-12 text-rose-500" />
                <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight">
                  Invite link invalid
                </h1>
                <p className="mt-3 text-slate-600">{errorMsg}</p>
                <Button asChild variant="hero" className="mt-6 rounded-xl">
                  <Link to={authPaths.start}>Go to sign-in</Link>
                </Button>
              </>
            ) : null}

            {(status === "ready" || status === "accepting") && invite ? (
              <>
                <h1 className="mt-6 font-heading text-3xl font-semibold tracking-tight">
                  You've been invited to join {invite.organizationName}
                </h1>
                <p className="mt-3 text-slate-600">
                  {invite.inviterName} has invited you to join the{" "}
                  <span className="font-medium">{invite.workspaceName}</span> workspace as a{" "}
                  <span className="font-medium">{invite.role}</span>.
                </p>

                <div className="mt-6 rounded-3xl bg-slate-50 p-5 space-y-2 text-sm text-slate-700">
                  <p><span className="text-slate-500">Email:</span> {invite.email}</p>
                  <p><span className="text-slate-500">Role:</span> {invite.role}</p>
                  <p><span className="text-slate-500">Workspace:</span> {invite.workspaceName}</p>
                </div>

                <div className="mt-6 flex gap-3">
                  <Button
                    variant="hero"
                    className="rounded-xl"
                    onClick={handleAccept}
                    disabled={status === "accepting"}
                  >
                    {status === "accepting" ? "Accepting…" : "Accept invitation"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : null}

            {status === "done" && invite ? (
              <>
                <CheckCircle2 className="mt-8 h-12 w-12 text-primary" />
                <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight">
                  Invitation accepted!
                </h1>
                <p className="mt-3 text-slate-600">
                  Your account has been added to <span className="font-medium">{invite.organizationName}</span>.
                  Sign in with <span className="font-medium">{invite.email}</span> to access your workspace.
                </p>
                <Button asChild variant="hero" className="mt-6 rounded-xl">
                  <Link to={authPaths.start}>
                    Sign in now
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
