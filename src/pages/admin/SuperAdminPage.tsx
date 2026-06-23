import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Lock, Unlock, UserCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getSuperAdminTenants, lockTenant, unlockTenant, impersonateTenant } from "@/lib/api";
import { useAuthSession } from "@/lib/auth-session-context";

export default function SuperAdminPage() {
  const navigate = useNavigate();
  const { session, setSession } = useAuthSession();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["super-admin", "tenants"],
    queryFn: getSuperAdminTenants,
  });

  const lockMutation = useMutation({
    mutationFn: lockTenant,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["super-admin"] }); toast.success("Tenant locked."); },
    onError: () => toast.error("Could not lock tenant."),
  });

  const unlockMutation = useMutation({
    mutationFn: unlockTenant,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["super-admin"] }); toast.success("Tenant unlocked."); },
    onError: () => toast.error("Could not unlock tenant."),
  });

  const impersonateMutation = useMutation({
    mutationFn: impersonateTenant,
    onSuccess: (newSession) => {
      setSession(newSession);
      toast.success(`Impersonating ${newSession.organizationName}`);
      navigate(newSession.targetPath);
    },
    onError: () => toast.error("Impersonation failed."),
  });

  const tenants = (data?.tenants ?? []).filter((t: any) =>
    !search || t.organizationName.toLowerCase().includes(search.toLowerCase()) || t.tenantSlug.toLowerCase().includes(search.toLowerCase()),
  );

  // Basic guard — only admins with super-admin role
  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p>You must be signed in to access the admin console.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-heading text-3xl font-semibold">Super Admin Console</h1>
            <p className="text-sm text-muted-foreground">Signed in as {session.displayName} — {session.email}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Warning:</strong> Actions here affect production tenant data. All operations are logged in the platform audit trail.
        </div>

        <div className="mt-8 space-y-6">
          {/* Tenant list */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  All tenants
                  <Badge variant="secondary">{data?.tenants?.length ?? 0}</Badge>
                </span>
                <Input
                  placeholder="Search tenants…"
                  className="max-w-[260px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading tenants…</p>
              ) : !tenants.length ? (
                <p className="text-sm text-muted-foreground">No tenants found.</p>
              ) : (
                <div className="divide-y">
                  {tenants.map((t: any) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{t.organizationName}</span>
                          {t.planLocked ? (
                            <Badge className="bg-rose-100 text-rose-700 text-xs">Locked</Badge>
                          ) : (
                            <Badge className="bg-teal-100 text-teal-700 text-xs">Active</Badge>
                          )}
                          <Badge variant="outline" className="text-xs capitalize">{t.planName ?? "free"}</Badge>
                        </div>
                        <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                          <span className="font-mono">{t.tenantSlug}</span>
                          <span>{t._count?.invoices ?? 0} invoices</span>
                          <span>{t._count?.members ?? 0} members</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => impersonateMutation.mutate(t.id)}
                          disabled={impersonateMutation.isPending}
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1" />
                          Impersonate
                        </Button>
                        {t.planLocked ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-teal-600"
                            onClick={() => unlockMutation.mutate(t.id)}
                            disabled={unlockMutation.isPending}
                          >
                            <Unlock className="h-3.5 w-3.5 mr-1" />
                            Unlock
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-rose-600"
                            onClick={() => {
                              if (confirm(`Lock ${t.organizationName}? They will lose access immediately.`)) {
                                lockMutation.mutate(t.id);
                              }
                            }}
                            disabled={lockMutation.isPending}
                          >
                            <Lock className="h-3.5 w-3.5 mr-1" />
                            Lock
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
