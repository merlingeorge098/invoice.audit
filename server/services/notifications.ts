import { db } from "../db.ts";
import { sendNotificationEmail } from "./email.ts";

export type NotificationType =
  | "assigned"
  | "sla_breach"
  | "escalated"
  | "approved"
  | "rejected"
  | "evidence_received"
  | "evidence_requested";

interface NotifyPayload {
  userId: string;
  tenantId: string;
  type: NotificationType;
  title: string;
  body: string;
  invoiceId?: string;
}

async function getUserEmailAndName(userId: string): Promise<{ email: string; displayName: string } | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true },
  });
  return user;
}

async function shouldSendEmail(tenantId: string, notificationName: string): Promise<boolean> {
  const setting = await db.notificationSetting.findFirst({
    where: { tenantId, name: notificationName },
  });
  return setting?.enabled !== false && setting?.emailEnabled !== false;
}

async function sendNotification(payload: NotifyPayload): Promise<void> {
  await db.notificationEvent.create({
    data: {
      userId: payload.userId,
      tenantId: payload.tenantId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      invoiceId: payload.invoiceId,
    },
  });

  const user = await getUserEmailAndName(payload.userId);
  if (!user) return;

  const notificationName = mapTypeToSettingName(payload.type);
  const emailEnabled = await shouldSendEmail(payload.tenantId, notificationName);

  if (emailEnabled) {
    const invoiceUrl = payload.invoiceId
      ? `${process.env.APP_URL}/app/${await getTenantSlug(payload.tenantId)}/invoice/${payload.invoiceId}`
      : undefined;
    sendNotificationEmail(user.email, user.displayName, payload.title, payload.body, invoiceUrl).catch(
      (err) => console.error("[Notifications] Email failed:", err),
    );
  }

  // Slack webhook
  const slackSetting = await db.notificationSetting.findFirst({
    where: { tenantId: payload.tenantId, name: notificationName },
    select: { slackWebhookUrl: true },
  });
  if (slackSetting?.slackWebhookUrl) {
    sendSlackNotification(slackSetting.slackWebhookUrl, payload.title, payload.body).catch(
      (err) => console.error("[Notifications] Slack failed:", err),
    );
  }
}

async function getTenantSlug(tenantId: string): Promise<string> {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { tenantSlug: true } });
  return t?.tenantSlug ?? tenantId;
}

async function sendSlackNotification(webhookUrl: string, title: string, body: string): Promise<void> {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `*${title}*\n${body}` }),
  });
}

function mapTypeToSettingName(type: NotificationType): string {
  const map: Record<NotificationType, string> = {
    assigned: "Invoice assigned",
    sla_breach: "SLA breach warning",
    escalated: "Invoice escalated",
    approved: "Invoice approved",
    rejected: "Invoice rejected",
    evidence_received: "Evidence received",
    evidence_requested: "Evidence received",
  };
  return map[type] ?? "Invoice assigned";
}

export async function notifyAssigned(invoiceId: string, assignedUserId: string, tenantId: string, invoiceNumber: string): Promise<void> {
  await sendNotification({
    userId: assignedUserId,
    tenantId,
    type: "assigned",
    title: "Invoice assigned to you",
    body: `Invoice ${invoiceNumber} has been assigned to you for review.`,
    invoiceId,
  });
}

export async function notifySlaBreached(invoiceId: string, assignedUserId: string, tenantId: string, invoiceNumber: string): Promise<void> {
  await sendNotification({
    userId: assignedUserId,
    tenantId,
    type: "sla_breach",
    title: `SLA breached: ${invoiceNumber}`,
    body: `Invoice ${invoiceNumber} has exceeded its SLA deadline and requires immediate attention.`,
    invoiceId,
  });
}

export async function notifyEscalated(invoiceId: string, escalatedToUserId: string, tenantId: string, invoiceNumber: string): Promise<void> {
  await sendNotification({
    userId: escalatedToUserId,
    tenantId,
    type: "escalated",
    title: `Escalated invoice: ${invoiceNumber}`,
    body: `Invoice ${invoiceNumber} has been escalated to your queue for a controller-level decision.`,
    invoiceId,
  });
}

export async function notifyEvidenceReceived(invoiceId: string, reviewerUserId: string, tenantId: string, invoiceNumber: string): Promise<void> {
  await sendNotification({
    userId: reviewerUserId,
    tenantId,
    type: "evidence_received",
    title: `Evidence received: ${invoiceNumber}`,
    body: `Supporting documents have been uploaded by the vendor for invoice ${invoiceNumber}.`,
    invoiceId,
  });
}

export async function notifyEvidenceRequested(invoiceId: string, vendorEmail: string | null, tenantId: string, invoiceNumber: string): Promise<void> {
  // Notify finance manager / controller / admin in the workspace
  const member = await db.workspaceMembership.findFirst({
    where: { tenantId, isActive: true, role: { in: ["Finance Manager", "Controller", "Admin"] } },
    include: { user: true },
  });
  if (!member) return;
  await sendNotification({
    userId: member.userId,
    tenantId,
    type: "evidence_requested",
    title: `Evidence requested: ${invoiceNumber}`,
    body: `A vendor portal link was generated for invoice ${invoiceNumber}${vendorEmail ? ` and sent to ${vendorEmail}` : ""}.`,
    invoiceId,
  });
}

export async function notifyRejected(invoiceId: string, assignedUserId: string, tenantId: string, invoiceNumber: string): Promise<void> {
  await sendNotification({
    userId: assignedUserId,
    tenantId,
    type: "rejected",
    title: `Invoice rejected: ${invoiceNumber}`,
    body: `Invoice ${invoiceNumber} has been rejected and removed from the approval queue.`,
    invoiceId,
  });
}

// Called by cron: /api/internal/check-slas
export async function checkAndNotifySlaBreaches(): Promise<number> {
  const overdueInvoices = await db.invoice.findMany({
    where: {
      slaDeadline: { lt: new Date() },
      status: { in: ["pending-review", "needs-evidence"] },
      slaNotifiedAt: null,
    },
    include: { tenant: true },
  });

  let notified = 0;
  for (const invoice of overdueInvoices) {
    // Find the assigned reviewer
    const member = await db.workspaceMembership.findFirst({
      where: { tenantId: invoice.tenantId, isActive: true, role: { in: ["Finance Manager", "Controller", "Admin"] } },
      include: { user: true },
    });

    if (member) {
      await notifySlaBreached(invoice.id, member.userId, invoice.tenantId, invoice.invoiceNumber);
    }

    await db.invoice.update({ where: { id: invoice.id }, data: { slaNotifiedAt: new Date() } });
    notified++;
  }

  return notified;
}
