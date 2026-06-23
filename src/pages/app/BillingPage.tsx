import { useQuery } from "@tanstack/react-query";
import { CreditCard, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppShell } from "@/components/AppLayout";
import { getBillingPlan, createCheckoutSession, createPortalSession } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/workspace-context";

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    period: "/month",
    priceId: import.meta.env.VITE_STRIPE_PRICE_FREE ?? "",
    features: ["50 invoices / month", "3 seats", "Full audit trail", "GST reconciliation", "Vendor master"],
    highlight: false,
  },
  {
    name: "Pro",
    price: "₹4,999",
    period: "/month",
    priceId: import.meta.env.VITE_STRIPE_PRICE_PRO_MONTHLY ?? "",
    features: ["500 invoices / month", "15 seats", "Everything in Free", "Evidence packages", "Priority support", "ERP integrations"],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    priceId: "",
    features: ["Unlimited invoices", "Unlimited seats", "Everything in Pro", "Dedicated CSM", "SLA guarantee", "Custom connectors"],
    highlight: false,
  },
];

export default function BillingPage() {
  const workspace = useCurrentWorkspace();
  const context = workspace.mode === "enterprise"
    ? { mode: "enterprise" as const, tenantSlug: workspace.tenantSlug ?? undefined, sessionToken: workspace.session?.sessionToken ?? undefined }
    : undefined;

  const { data: plan, isLoading } = useQuery({
    queryKey: ["billing", "plan", workspace.tenantSlug],
    queryFn: () => getBillingPlan(context),
    enabled: workspace.mode === "enterprise",
  });

  async function handleUpgrade(priceId: string) {
    if (!priceId) {
      toast.info("Contact sales for Enterprise pricing.");
      return;
    }
    try {
      const { url } = await createCheckoutSession(priceId, context);
      window.location.href = url;
    } catch (err) {
      toast.error("Could not open checkout. Please try again.");
    }
  }

  async function handleManageBilling() {
    try {
      const { url } = await createPortalSession(context);
      window.location.href = url;
    } catch (err) {
      toast.error("Could not open billing portal.");
    }
  }

  const invoicePct = plan ? Math.min(100, (plan.invoiceCount / Math.max(plan.invoiceLimit, 1)) * 100) : 0;
  const seatPct = plan ? Math.min(100, (plan.seatCount / Math.max(plan.seatLimit, 1)) * 100) : 0;

  return (
    <AppShell
      eyebrow="Settings"
      title="Billing & Plan"
      description="Manage your subscription, usage, and upgrade your plan."
    >
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading billing info…</div>
      ) : plan ? (
        <div className="space-y-8">
          {/* Current plan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Current plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-2xl font-semibold capitalize">{plan.planName}</p>
                  {plan.status === "canceled" ? (
                    <p className="mt-1 flex items-center gap-1 text-sm text-rose-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Subscription canceled
                      {plan.currentPeriodEnd ? ` — access until ${new Date(plan.currentPeriodEnd).toLocaleDateString()}` : ""}
                    </p>
                  ) : plan.cancelAtPeriodEnd ? (
                    <p className="mt-1 text-sm text-amber-600">
                      Cancels {plan.currentPeriodEnd ? `on ${new Date(plan.currentPeriodEnd).toLocaleDateString()}` : "at period end"}
                    </p>
                  ) : plan.currentPeriodEnd ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Renews {new Date(plan.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
                <Button variant="outline" className="rounded-xl" onClick={handleManageBilling}>
                  Manage billing
                </Button>
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Invoices this month</span>
                    <span className="font-medium">{plan.invoiceCount} / {plan.invoiceLimit}</span>
                  </div>
                  <Progress value={invoicePct} className="mt-2" />
                  {invoicePct >= 90 ? (
                    <p className="mt-1 text-xs text-amber-600">Near limit — consider upgrading</p>
                  ) : null}
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Seats used</span>
                    <span className="font-medium">{plan.seatCount} / {plan.seatLimit}</span>
                  </div>
                  <Progress value={seatPct} className="mt-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Plan comparison */}
          <div>
            <h2 className="font-heading text-xl font-semibold">Choose a plan</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {PLANS.map((p) => {
                const isCurrent = plan.planName.toLowerCase() === p.name.toLowerCase();
                return (
                  <Card
                    key={p.name}
                    className={p.highlight ? "border-primary shadow-md" : ""}
                  >
                    <CardContent className="p-6">
                      {p.highlight ? (
                        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Most popular</p>
                      ) : null}
                      <p className="font-heading text-xl font-semibold">{p.name}</p>
                      <p className="mt-1 text-3xl font-bold">
                        {p.price}
                        <span className="text-sm font-normal text-muted-foreground">{p.period}</span>
                      </p>
                      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                        {p.features.map((f) => (
                          <li key={f} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-primary" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={isCurrent ? "outline" : p.highlight ? "hero" : "outline"}
                        className="mt-6 w-full rounded-xl"
                        disabled={isCurrent}
                        onClick={() => handleUpgrade(p.priceId)}
                      >
                        {isCurrent ? "Current plan" : p.priceId ? (
                          <>Upgrade to {p.name} <ArrowRight className="h-4 w-4" /></>
                        ) : "Contact sales"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-muted-foreground text-sm">
            Billing information could not be loaded. Ensure Stripe is configured.
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
