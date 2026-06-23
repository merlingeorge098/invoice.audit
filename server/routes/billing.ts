import { Router, type Request, type Response } from "express";
import express from "express";
import {
  createCheckoutSession,
  createPortalSession,
  getCurrentPlan,
  getMonthlyUsage,
  handleStripeWebhook,
  startFreeTrial,
} from "../services/billing.ts";
import { db } from "../db.ts";

export const billingRouter = Router();

// POST /api/billing/webhook — Stripe webhook (no auth middleware)
billingRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    if (!sig) {
      res.status(400).json({ error: "missing_signature" });
      return;
    }

    try {
      await handleStripeWebhook(req.body as Buffer, sig);
      res.json({ received: true });
    } catch (err: any) {
      console.error("[Billing] Webhook error:", err.message);
      res.status(400).json({ error: "webhook_failed", message: err.message });
    }
  },
);

// GET /api/billing — current plan + usage (requires billing:manage from middleware)
billingRouter.get("/", async (_req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const [plan, invoicesUsed, seatsUsed] = await Promise.all([
    getCurrentPlan(session.tenantId),
    getMonthlyUsage(session.tenantId),
    db.workspaceMembership.count({ where: { tenantId: session.tenantId, isActive: true } }),
  ]);

  res.json({
    plan: plan?.planSlug ?? "free",
    status: plan?.status ?? "active",
    trialEndsAt: plan?.trialEndsAt,
    currentPeriodEnd: plan?.currentPeriodEnd,
    cancelAtPeriodEnd: plan?.cancelAtPeriodEnd,
    limits: plan?.planLimit ?? null,
    usage: {
      invoicesThisMonth: invoicesUsed,
      seats: seatsUsed,
    },
  });
});

// POST /api/billing/checkout — create Stripe Checkout session
billingRouter.post("/checkout", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { priceId } = req.body ?? {};
  if (!priceId) {
    res.status(400).json({ error: "priceId is required" });
    return;
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  try {
    const url = await createCheckoutSession(
      session.tenantId,
      priceId,
      `${appUrl}/app/${session.tenantSlug}/settings/billing?success=1`,
      `${appUrl}/app/${session.tenantSlug}/settings/billing?canceled=1`,
    );
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: "checkout_failed", message: err.message });
  }
});

// POST /api/billing/portal — Stripe Customer Portal
billingRouter.post("/portal", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  try {
    const url = await createPortalSession(
      session.tenantId,
      `${appUrl}/app/${session.tenantSlug}/settings/billing`,
    );
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: "portal_failed", message: err.message });
  }
});

// POST /api/billing/start-trial — start free trial (called on signup)
billingRouter.post("/start-trial", async (req: Request, res: Response) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    await startFreeTrial(session.tenantId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "trial_failed", message: err.message });
  }
});
