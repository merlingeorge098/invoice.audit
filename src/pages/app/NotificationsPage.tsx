import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/AppLayout";
import {
  getNotificationsPaged,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationItem,
  type ApiWorkspaceContext,
} from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/workspace-context";

const TYPE_COLORS: Record<string, string> = {
  sla_breach: "bg-rose-100 text-rose-700",
  assigned: "bg-blue-100 text-blue-700",
  escalated: "bg-amber-100 text-amber-700",
  evidence_received: "bg-teal-100 text-teal-700",
  evidence_requested: "bg-violet-100 text-violet-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

export default function NotificationsPage() {
  const workspace = useCurrentWorkspace();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<NotificationItem[]>([]);

  const context: ApiWorkspaceContext | undefined = workspace.mode === "enterprise"
    ? { mode: "enterprise" as const, tenantSlug: workspace.tenantSlug ?? undefined, sessionToken: workspace.session?.sessionToken ?? undefined }
    : undefined;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["notifications-paged", workspace.tenantSlug, page],
    queryFn: async () => {
      const result = await getNotificationsPaged(page, context);
      if (page === 1) {
        setAllItems(result.items);
      } else {
        setAllItems((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const newOnes = result.items.filter((i) => !existingIds.has(i.id));
          return [...prev, ...newOnes];
        });
      }
      return result;
    },
    enabled: workspace.mode === "enterprise",
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id, context),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-paged", workspace.tenantSlug] });
      qc.invalidateQueries({ queryKey: ["notifications", "unread"] });
      setPage(1);
    },
  });

  const readAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(context),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-paged", workspace.tenantSlug] });
      qc.invalidateQueries({ queryKey: ["notifications", "unread"] });
      toast.success("All notifications marked as read.");
      setPage(1);
    },
  });

  const unread = data?.unreadCount ?? 0;
  const hasMore = data?.hasMore ?? false;

  return (
    <AppShell
      eyebrow="Inbox"
      title="Notifications"
      description="In-app alerts for invoice assignments, SLA breaches, and evidence uploads."
      actions={
        unread > 0 ? (
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending}
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        ) : undefined
      }
    >
      <Card className="rounded-3xl border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading text-xl">
            <Bell className="h-5 w-5 text-primary" />
            Inbox
            {unread > 0 ? (
              <Badge className="bg-rose-500 text-white">{unread}</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && page === 1 ? (
            <p className="text-sm text-muted-foreground">Loading notifications…</p>
          ) : !allItems.length ? (
            <p className="text-sm text-muted-foreground">No notifications. All caught up!</p>
          ) : (
            <>
              <div className="divide-y">
                {allItems.map((n: NotificationItem) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-4 py-4 cursor-pointer transition-colors hover:bg-slate-50/50 rounded-lg px-2 ${!n.readAt ? "bg-teal-50/50" : ""}`}
                    onClick={() => { if (!n.readAt) readMutation.mutate(n.id); }}
                  >
                    <div className="mt-1 flex-none">
                      <span className={`inline-block h-2 w-2 rounded-full ${n.readAt ? "bg-slate-200" : "bg-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{n.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[n.type] ?? "bg-slate-100 text-slate-700"}`}>
                          {n.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                    </div>
                    <div className="flex-none text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(n.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    className="rounded-xl gap-2"
                    disabled={isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                    {isFetching ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
