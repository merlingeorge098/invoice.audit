import Stripe from "stripe";
import { db } from "../db.ts";

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-05-28.basil" });
}

export async function createStripeCustomer(tenantId: string): Promise<string> {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const stripe = getStripe();

  const customer = await stripe.customers.create({
    name: tenant.organizationName,
    metadata: { tenantId, tenantSlug: tenant.tenantSlug },
  });

  await db.stripeCustomer.upsert({
    where: { tenantId },
    update: { stripeCustomerId: customer.id },
    create: {
      tenantId,
      stripeCustomerId: customer.id,
      planSlug: "free",
      status: "trialing",
    },
  });

  return customer.id;
}

export async function startFreeTrial(tenantId: string): Promise<void> {
  const priceId = process.env.STRIPE_PRICE_FREE;
  if (!priceId) return; // Stripe not fully configured — skip silently

  const stripe = getStripe();
  let record = await db.stripeCustomer.findUnique({ where: { tenantId } });

  if (!record) {
    await createStripeCustomer(tenantId);
    record = await db.stripeCustomer.findUnique({ where: { tenantId } });
  }

  if (!record || record.stripeSubscriptionId) return; // Already has subscription

  const subscription = await stripe.subscriptions.create({
    customer: record.stripeCustomerId,
    items: [{ price: priceId }],
    trial_period_days: 14,
    metadata: { tenantId },
  });

  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  await db.stripeCustomer.update({
    where: { tenantId },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      planSlug: "free",
      status: "trialing",
      trialEndsAt: trialEnd,
    },
  });
}

export async function createCheckoutSession(
  tenantId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const stripe = getStripe();
  let record = await db.stripeCustomer.findUnique({ where: { tenantId } });

  if (!record) {
    await createStripeCustomer(tenantId);
    record = await db.stripeCustomer.findUnique({ where: { tenantId } });
  }

  const session = await stripe.checkout.sessions.create({
    customer: record!.stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tenantId },
    subscription_data: { metadata: { tenantId } },
  });

  return session.url!;
}

export async function createPortalSession(tenantId: string, returnUrl: string): Promise<string> {
  const stripe = getStripe();
  const record = await db.stripeCustomer.findUniqueOrThrow({ where: { tenantId } });

  const session = await stripe.billingPortal.sessions.create({
    customer: record.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

export async function getCurrentPlan(tenantId: string) {
  const record = await db.stripeCustomer.findUnique({ where: { tenantId } });
  const planSlug = record?.planSlug ?? "free";
  const planLimit = await db.planLimit.findUnique({ where: { planSlug } });
  return { ...record, planLimit };
}

export async function getMonthlyUsage(tenantId: string) {
  const periodMonth = Number(`${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const result = await db.usageEvent.aggregate({
    where: { tenantId, eventType: "invoice_processed", periodMonth },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

export async function handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not configured.");

  const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      if (!tenantId || !session.subscription) break;
      await db.stripeCustomer.update({
        where: { tenantId },
        data: { stripeSubscriptionId: String(session.subscription), status: "active" },
      });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) break;
      const priceId = sub.items.data[0]?.price.id;
      const planSlug = resolvePlanFromPrice(priceId ?? "");
      await db.stripeCustomer.update({
        where: { tenantId },
        data: {
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          planSlug,
          status: sub.status,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) break;
      await db.stripeCustomer.update({
        where: { tenantId },
        data: { status: "canceled", planSlug: "free" },
      });
      break;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const tenantId = (inv.subscription_details?.metadata as any)?.tenantId
        ?? (inv as any).metadata?.tenantId;
      if (!tenantId) break;
      await db.stripeCustomer.update({
        where: { tenantId },
        data: { status: "past_due" },
      });
      break;
    }

    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      const tenantId = (inv.subscription_details?.metadata as any)?.tenantId
        ?? (inv as any).metadata?.tenantId;
      if (!tenantId) break;
      const record = await db.stripeCustomer.findUnique({ where: { tenantId } });
      if (record?.status === "past_due") {
        await db.stripeCustomer.update({ where: { tenantId }, data: { status: "active" } });
      }
      break;
    }
  }
}

function resolvePlanFromPrice(priceId: string): string {
  if (priceId === process.env.STRIPE_PRICE_FREE) return "free";
  if (
    priceId === process.env.STRIPE_PRICE_PRO_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PRO_ANNUAL
  )
    return "pro";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return "enterprise";
  return "free";
}
