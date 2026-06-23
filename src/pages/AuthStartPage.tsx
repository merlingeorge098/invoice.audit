import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  startEnterpriseAuth,
  verifyOtp,
  signOutEnterpriseSession,
  persistEnterpriseSession,
} from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import { useAuthSession } from "@/lib/auth-session-context";
import { demoPaths, entryPath, tenantPaths } from "@/lib/workspace";

export default function AuthStartPage() {
  const navigate = useNavigate();
  const { session, setSession, clearSession } = useAuthSession();
  const [email, setEmail] = useState("");
  const [authRequest, setAuthRequest] = useState<{ authRequestId: string } | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isClearingSession, setIsClearingSession] = useState(false);

  function handleGoogleSignIn() {
    window.location.href = `${API_BASE}/auth/google`;
  }

  async function handleStartAuth() {
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid work email address.");
      return;
    }
    setIsStarting(true);
    setError(null);
    try {
      const result = await startEnterpriseAuth(email.trim());
      if (result.requireOtp) {
        setAuthRequest({ authRequestId: result.authRequestId });
        toast.info("A secure code has been sent to your email.");
      } else if (result.callbackUrl) {
        navigate(result.callbackUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in could not start.";
      setError(message);
      toast.error(message);
    } finally {
      setIsStarting(false);
    }
  }

  async function handleVerifyOtp() {
    if (!authRequest) return;
    setIsStarting(true);
    setError(null);
    try {
      const sessionData = await verifyOtp(authRequest.authRequestId, otp);
      persistEnterpriseSession(sessionData);
      setSession(sessionData);
      toast.success("Identity verified — welcome back.");
      navigate(sessionData.targetPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid code.";
      setError(message);
      toast.error(message);
    } finally {
      setIsStarting(false);
    }
  }

  async function handleClearSession() {
    if (!session) return;
    setIsClearingSession(true);
    try {
      await signOutEnterpriseSession(session.sessionToken);
    } catch {
      // Clear locally even if server fails
    } finally {
      clearSession();
      setIsClearingSession(false);
      toast.success("Session cleared.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.28),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.24),_transparent_28%),linear-gradient(160deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]" />
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-10 lg:px-10">
        <Card className="w-full rounded-[28px] border-white/10 bg-white text-slate-950 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.85)]">
          <CardContent className="p-8 md:p-10">
            <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              {/* Left: branding */}
              <div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Enterprise workspace sign-in
                </div>
                <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-slate-950">
                  Sign in to your workspace
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-8 text-slate-600">
                  Use Google SSO or your work email to sign in. New to Invoice.Audit?{" "}
                  <Link to="/signup" className="font-medium text-primary hover:underline">
                    Create a workspace
                  </Link>
                  .
                </p>

                <div className="mt-8 rounded-3xl bg-slate-50 p-5 space-y-3">
                  <p className="text-sm font-semibold text-slate-700">Security posture</p>
                  <div className="text-sm text-slate-600 space-y-1">
                    <p>• All sessions are HttpOnly cookie-secured and expire in 8 hours</p>
                    <p>• OTP codes expire in 15 minutes and are rate-limited</p>
                    <p>• All access is logged in the tamper-evident audit trail</p>
                    <p>• Role-based access control enforced on every API route</p>
                  </div>
                </div>

                {session ? (
                  <div className="mt-8 rounded-3xl border border-teal-200 bg-teal-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                      Active session
                    </p>
                    <div className="mt-3 space-y-1 text-sm leading-6 text-slate-700">
                      <p className="font-medium">{session.organizationName}</p>
                      <p>{session.displayName} — {session.role}</p>
                      <p className="text-slate-500">{session.email}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button variant="outline" className="rounded-xl" onClick={handleClearSession} disabled={isClearingSession}>
                        {isClearingSession ? "Signing out..." : "Sign out"}
                      </Button>
                      <Button asChild variant="hero" className="rounded-xl">
                        <Link to={tenantPaths.dashboard(session.tenantSlug)}>
                          Open workspace
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Right: sign-in form */}
              <div className="rounded-[28px] bg-slate-950 p-6 text-white shadow-[0_40px_100px_-60px_rgba(15,23,42,0.85)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
                  Sign in
                </p>
                <h2 className="mt-4 font-heading text-2xl font-semibold tracking-tight">
                  Choose your sign-in method
                </h2>

                {/* Google OAuth */}
                <Button
                  variant="outline"
                  className="mt-6 w-full rounded-xl border-white/20 bg-white text-slate-950 hover:bg-slate-100 font-medium gap-3"
                  onClick={handleGoogleSignIn}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </Button>

                <div className="my-6 flex items-center gap-4">
                  <Separator className="flex-1 bg-white/10" />
                  <span className="text-xs text-slate-400">or sign in with email OTP</span>
                  <Separator className="flex-1 bg-white/10" />
                </div>

                {!authRequest ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-200">Work email</label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(null); }}
                        onKeyDown={(e) => e.key === "Enter" && handleStartAuth()}
                        className="border-white/10 bg-white text-slate-950"
                        placeholder="name@company.com"
                      />
                    </div>

                    {error ? (
                      <div className="mt-3 rounded-2xl border border-rose-300/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                        {error}
                        {error.includes("404") || error.toLowerCase().includes("no workspace") ? (
                          <p className="mt-2 text-xs text-rose-200">
                            No workspace linked to this email.{" "}
                            <a href="/signup" className="underline">Create one</a> or check that you used the same email during signup.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <Button
                      variant="hero"
                      className="mt-4 w-full rounded-xl"
                      onClick={handleStartAuth}
                      disabled={isStarting}
                    >
                      {isStarting ? "Sending code..." : "Send login code"}
                      <Mail className="h-4 w-4" />
                    </Button>

                    <p className="mt-3 text-xs text-slate-500 text-center">
                      No email service configured? Check your server terminal for the OTP code.
                    </p>
                  </>
                ) : (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">
                      6-digit code sent to {email}
                    </label>
                    <Input
                      value={otp}
                      onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                      onKeyDown={(e) => e.key === "Enter" && otp.length === 6 && handleVerifyOtp()}
                      className="border-white/10 bg-white text-slate-950 max-w-[200px] text-center text-lg tracking-widest font-mono"
                      placeholder="000000"
                      maxLength={6}
                    />
                    {error ? (
                      <div className="mt-3 rounded-2xl border border-rose-300/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                        {error}
                      </div>
                    ) : null}
                    <div className="mt-4 flex gap-3">
                      <Button
                        variant="outline"
                        className="rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                        onClick={() => { setAuthRequest(null); setOtp(""); setError(null); }}
                      >
                        Back
                      </Button>
                      <Button
                        variant="hero"
                        className="rounded-xl"
                        onClick={handleVerifyOtp}
                        disabled={isStarting || otp.length < 6}
                      >
                        {isStarting ? "Verifying..." : "Verify code"}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-8 flex flex-wrap gap-3 border-t border-white/10 pt-6">
                  <Button asChild variant="outline" className="rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                    <Link to={entryPath}>
                      <ArrowLeft className="h-4 w-4" />
                      Back to home
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" className="rounded-xl text-slate-200 hover:bg-white/10 hover:text-white">
                    <Link to={demoPaths.dashboard}>Explore demo</Link>
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
