import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppLayout";
import { BackendStatusNotice } from "@/components/BackendStatusNotice";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { IfAllowed } from "@/components/IfAllowed";
import { usePermissions, PERMISSIONS } from "@/lib/permissions";
import {
  useNotificationToggleMutation,
  usePublishRulesMutation,
  useRuleToggleMutation,
  useSettingsData,
} from "@/hooks/usePlatformApi";

export default function SettingsPage() {
  const { data, isError } = useSettingsData();
  const ruleToggle = useRuleToggleMutation();
  const notificationToggle = useNotificationToggleMutation();
  const publishRules = usePublishRulesMutation();
  const { can } = usePermissions();

  return (
    <AppShell
      eyebrow="Settings and Rule Configuration"
      title="Govern the platform controls"
      description="Manage approval policy, detection rules, user roles, integrations, and alert preferences from a single control surface."
      actions={
        can(PERMISSIONS.SETTINGS_MANAGE) ? (
          <Button
            variant="hero"
            className="rounded-xl"
            onClick={async () => {
              const result = await publishRules.mutateAsync();
              toast.success(`Ruleset published at ${new Date(result.publishedAt).toLocaleTimeString()}.`);
            }}
          >
            <Save className="h-4 w-4" />
            Publish ruleset
          </Button>
        ) : null
      }
    >
      <BackendStatusNotice show={isError} />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-tight">Business rules</CardTitle>
            <p className="text-sm text-muted-foreground">
              Toggle critical validation and workflow rules used by the assurance engine.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.rules.map((rule) => (
              <div key={rule.name} className="rounded-3xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-950">{rule.name}</p>
                      <StatusBadge tone="info">{rule.owner}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{rule.description}</p>
                  </div>
                  <Switch
                    checked={rule.enabled}
                    disabled={!can(PERMISSIONS.SETTINGS_MANAGE)}
                    onCheckedChange={(checked) =>
                      ruleToggle.mutate(
                        { name: rule.name, enabled: checked },
                        { onSuccess: () => toast.success(`${rule.name} updated.`) },
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-tight">Approval matrix</CardTitle>
            <p className="text-sm text-muted-foreground">
              Make escalation paths and approval thresholds explicit for reviewers.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Level</th>
                  <th className="pb-3 font-medium">Limit</th>
                  <th className="pb-3 font-medium">Condition</th>
                </tr>
              </thead>
              <tbody>
                {data.approvalMatrix.map((row) => (
                  <tr key={row.level} className="border-b border-border/70 last:border-0">
                    <td className="py-4 pr-4 font-medium text-foreground">{row.level}</td>
                    <td className="py-4 pr-4 text-slate-700">{row.limit}</td>
                    <td className="py-4 text-slate-600">{row.condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-3xl border-border/70 bg-card/90">
          <CardHeader>
            <CardTitle className="font-heading text-2xl tracking-tight">Integrations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Connected systems that enrich validation and distribute workflow outcomes.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.integrations.map((integration) => (
              <div key={integration.name} className="rounded-3xl bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-950">{integration.name}</p>
                  <StatusBadge tone={integration.status === "Connected" ? "success" : "info"}>
                    {integration.status}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{integration.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-tight">
                Roles and permissions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.roles.map((role) => (
                <div key={role.role} className="rounded-3xl bg-slate-50 p-4">
                  <p className="font-medium text-slate-950">{role.role}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{role.access}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="font-heading text-2xl tracking-tight">Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.notifications.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-4 rounded-3xl bg-slate-50 p-4"
                >
                  <p className="text-sm font-medium text-slate-950">{item.name}</p>
                  <Switch
                    checked={item.enabled}
                    disabled={!can(PERMISSIONS.SETTINGS_MANAGE)}
                    onCheckedChange={(checked) =>
                      notificationToggle.mutate(
                        { name: item.name, enabled: checked },
                        { onSuccess: () => toast.success(`${item.name} updated.`) },
                      )
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
