import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, MoreHorizontal, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppLayout";
import { IfAllowed } from "@/components/IfAllowed";
import { getTeamMembers, changeRole, removeMember, sendInvite, type Member } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/workspace-context";

const ROLES = ["AP Reviewer", "Finance Manager", "Controller", "Auditor", "Admin"];

const ROLE_COLORS: Record<string, string> = {
  "Admin": "bg-rose-100 text-rose-700",
  "Controller": "bg-purple-100 text-purple-700",
  "Finance Manager": "bg-blue-100 text-blue-700",
  "Auditor": "bg-amber-100 text-amber-700",
  "AP Reviewer": "bg-teal-100 text-teal-700",
};

export default function TeamPage() {
  const workspace = useCurrentWorkspace();
  const qc = useQueryClient();
  const context = workspace.mode === "enterprise"
    ? { mode: "enterprise" as const, tenantSlug: workspace.tenantSlug ?? undefined, sessionToken: workspace.session?.sessionToken ?? undefined }
    : undefined;

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("AP Reviewer");

  const { data, isLoading } = useQuery({
    queryKey: ["team", "members", workspace.tenantSlug],
    queryFn: () => getTeamMembers(context),
    enabled: workspace.mode === "enterprise",
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => changeRole(userId, role, context),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Role updated."); },
    onError: () => toast.error("Could not update role."),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember(userId, context),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Member removed."); },
    onError: () => toast.error("Could not remove member."),
  });

  const inviteMutation = useMutation({
    mutationFn: () => sendInvite(inviteEmail, inviteRole, context),
    onSuccess: () => { toast.success(`Invite sent to ${inviteEmail}.`); setInviteEmail(""); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not send invite."),
  });

  function handleInvite() {
    if (!inviteEmail.includes("@")) { toast.error("Enter a valid email."); return; }
    inviteMutation.mutate();
  }

  const currentUserId = workspace.session?.userId;

  return (
    <AppShell
      eyebrow="Settings"
      title="Team"
      description="Manage team members, invite colleagues, and control access roles."
    >
      <div className="space-y-8">
        {/* Invite */}
        <IfAllowed
          permission="settings:manage"
          fallback={
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Only Admins can invite team members and change roles. Contact your workspace Admin.
            </div>
          }
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Invite a team member
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  className="max-w-xs"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="hero" className="rounded-xl" onClick={handleInvite} disabled={inviteMutation.isPending}>
                  <Mail className="h-4 w-4" />
                  {inviteMutation.isPending ? "Sending…" : "Send invite"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </IfAllowed>

        {/* Members list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Team members
              {data?.members ? (
                <Badge variant="secondary">{data.members.length}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading members…</p>
            ) : !data?.members?.length ? (
              <p className="text-sm text-muted-foreground">No members yet. Invite your team above.</p>
            ) : (
              <div className="divide-y">
                {data.members.map((m: Member) => (
                  <div key={m.userId} className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div>
                      <p className="font-medium text-sm">{m.displayName}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[m.role] ?? "bg-slate-100 text-slate-700"}`}>
                        {m.role}
                      </span>
                      {m.userId !== currentUserId ? (
                        <IfAllowed permission="settings:manage">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {ROLES.filter((r) => r !== m.role).map((r) => (
                                <DropdownMenuItem
                                  key={r}
                                  onClick={() => roleMutation.mutate({ userId: m.userId, role: r })}
                                >
                                  <Shield className="mr-2 h-4 w-4" />
                                  Change to {r}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuItem
                                className="text-rose-600"
                                onClick={() => {
                                  if (confirm(`Remove ${m.displayName} from the workspace?`)) {
                                    removeMutation.mutate(m.userId);
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove from workspace
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </IfAllowed>
                      ) : (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
