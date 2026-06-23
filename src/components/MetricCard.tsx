import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  info: "bg-sky-50 text-sky-700 ring-sky-100",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-rose-50 text-rose-700 ring-rose-100",
};

interface MetricCardProps {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone?: Tone;
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "info",
}: MetricCardProps) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card/90 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.45)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          </div>
          <div className={cn("rounded-2xl p-3 ring-1", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
