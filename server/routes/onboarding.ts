import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.ts";
import { permissionsByRole, type EnterpriseRole } from "../store.ts";
import { sendInviteEmail } from "../services/email.ts";

export const onboardingRouter = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await db.tenant.findUnique({ where: { tenantSlug: slug } });
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

// POST /api/signup — self-serve tenant + first-user creation
onboardingRouter.post("/signup", async (req, res) => {
  // Accept both legacy {email,name,companyName} and new {adminEmail,adminName,organizationName,domain,tenantSlug}
  const body = req.body ?? {};
  const email: string = (body.adminEmail ?? body.email ?? "").toString().toLowerCase().trim();
  const name: string = (body.adminName ?? body.name ?? "").toString().trim();
  const companyName: string = (body.organizationName ?? body.companyName ?? "").toString().trim();
  const domainOverride: string = (body.domain ?? "").toString().toLowerCase().trim();
  const slugOverride: string = (body.tenantSlug ?? "").toString().toLowerCase().trim();

  if (!email || !name || !companyName) {
    res.status(400).json({ error: "invalid_request", message: "adminEmail, adminName, and organizationName are required." });
    return;
  }

  if (!email.includes("@")) {
    res.status(400).json({ error: "invalid_email", message: "A valid work email is required." });
    return;
  }

  const domain = domainOverride || email.split("@")[1].toLowerCase();

  // Check if domain is already registered
  const existingDomain = await db.tenantDomain.findUnique({ where: { domain } });
  if (existingDomain) {
    res.status(409).json({
      error: "domain_taken",
      message: "An organization is already registered for that email domain. Try signing in instead.",
      tenantSlug: (await db.tenant.findUnique({ where: { id: existingDomain.tenantId } }))?.tenantSlug,
    });
    return;
  }

  const baseSlug = slugOverride || slugify(companyName);
  const tenantSlug = await uniqueSlug(baseSlug);
  const workspaceId = `ws-${crypto.randomUUID()}`;

  const [tenant, user] = await db.$transaction(async (tx) => {
    const newTenant = await tx.tenant.create({
      data: {
        organizationName: companyName,
        workspaceId,
        workspaceName: `${companyName} Finance Controls`,
        tenantSlug,
        authMethod: "otp",
        domains: { create: { domain } },
        rules: {
          create: defaultRules(workspaceId),
        },
        notifications: {
          create: defaultNotifications(workspaceId),
        },
      },
    });

    const localPart = (email as string).split("@")[0];
    const displayName = name || localPart.split(/[._-]/).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");

    const newUser = await tx.user.create({
      data: {
        email: (email as string).toLowerCase().trim(),
        displayName,
        memberships: {
          create: {
            tenantId: newTenant.id,
            role: "Admin",
          },
        },
      },
    });

    return [newTenant, newUser];
  });

  // Create session for the new user
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      sessionToken,
      userId: user.id,
      tenantId: tenant.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      expiresAt,
    },
  });

  res.status(201).json({
    tenantSlug: tenant.tenantSlug,
    sessionToken,
    expiresAt: expiresAt.toISOString(),
    targetPath: `/app/${tenant.tenantSlug}/dashboard`,
    role: "Admin",
    permissions: permissionsByRole["Admin"],
  });
});

// POST /api/invites — send invite (requires identity:manage from middleware in index.ts)
onboardingRouter.post("/invites", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { email, role } = req.body ?? {};
  if (!email || !role) {
    res.status(400).json({ error: "invalid_request", message: "email and role are required." });
    return;
  }

  const validRoles = ["AP Reviewer", "Finance Manager", "Controller", "Auditor", "Admin"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "invalid_role", message: `Role must be one of: ${validRoles.join(", ")}` });
    return;
  }

  // Check seat limits
  const activeMembers = await db.workspaceMembership.count({
    where: { tenantId: session.tenantId, isActive: true },
  });
  const stripeCustomer = await db.stripeCustomer.findUnique({ where: { tenantId: session.tenantId } });
  const planSlug = stripeCustomer?.planSlug ?? "free";
  const planLimit = await db.planLimit.findUnique({ where: { planSlug } });
  if (planLimit && planLimit.maxSeats !== -1 && activeMembers >= planLimit.maxSeats) {
    res.status(402).json({
      error: "seat_limit_reached",
      message: `Your ${planSlug} plan allows ${planLimit.maxSeats} seats. Upgrade to add more team members.`,
    });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  await db.inviteToken.create({
    data: {
      tenantId: session.tenantId,
      email: (email as string).toLowerCase().trim(),
      role,
      token,
      invitedBy: session.userId ?? session.email,
      expiresAt,
    },
  });

  const inviteUrl = `${process.env.APP_URL}/invite/${token}`;
  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId } });

  try {
    await sendInviteEmail(email, session.displayName, tenant?.organizationName ?? "your organization", role, inviteUrl);
  } catch (err) {
    console.error("[Invite] email send failed:", err);
  }

  res.json({ success: true, expiresAt: expiresAt.toISOString() });
});

// GET /api/invites/:token — get invite details (public)
onboardingRouter.get("/invites/:token", async (req, res) => {
  const invite = await db.inviteToken.findUnique({
    where: { token: req.params.token },
    include: { tenant: true },
  });

  if (!invite || new Date() > invite.expiresAt || invite.acceptedAt) {
    res.status(404).json({ error: "invite_not_found", message: "This invite link is invalid or has expired." });
    return;
  }

  // Look up inviter display name if invitedBy is a userId
  let inviterName = invite.invitedBy;
  try {
    const inviter = await db.user.findUnique({ where: { id: invite.invitedBy } });
    if (inviter) inviterName = inviter.displayName;
  } catch {}

  res.json({
    email: invite.email,
    role: invite.role,
    organizationName: invite.tenant.organizationName,
    workspaceName: invite.tenant.workspaceName,
    tenantSlug: invite.tenant.tenantSlug,
    inviterName,
    expiresAt: invite.expiresAt.toISOString(),
  });
});

// POST /api/invites/:token/accept — accept invite (public — user authenticates via OTP afterwards)
onboardingRouter.post("/invites/:token/accept", async (req, res) => {
  const invite = await db.inviteToken.findUnique({
    where: { token: req.params.token },
    include: { tenant: true },
  });

  if (!invite || new Date() > invite.expiresAt || invite.acceptedAt) {
    res.status(404).json({ error: "invite_not_found", message: "This invite link is invalid or has expired." });
    return;
  }

  // Upsert user and create membership
  await db.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      const displayName = invite.email.split("@")[0].split(/[._-]/).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
      user = await tx.user.create({ data: { email: invite.email, displayName } });
    }

    const existingMembership = await tx.workspaceMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: invite.tenantId } },
    });

    if (!existingMembership) {
      await tx.workspaceMembership.create({
        data: { userId: user.id, tenantId: invite.tenantId, role: invite.role },
      });
    }

    await tx.inviteToken.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  });

  res.json({ success: true, tenantSlug: invite.tenant.tenantSlug });
});

// GET /api/invites — list pending invites for tenant (requires identity:manage)
onboardingRouter.get("/invites", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const invites = await db.inviteToken.findMany({
    where: { tenantId: session.tenantId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  res.json(invites.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    invitedBy: i.invitedBy,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
    isExpired: new Date() > i.expiresAt,
  })));
});

// DELETE /api/invites/:id — revoke invite (requires identity:manage)
onboardingRouter.delete("/invites/:id", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  await db.inviteToken.deleteMany({
    where: { id: req.params.id, tenantId: session.tenantId },
  });

  res.json({ success: true });
});

// PATCH /api/settings/workspace — update workspace details (requires settings:manage)
onboardingRouter.patch("/settings/workspace", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { organizationName, logoUrl, fiscalYearStart, currency, inviteOnly } = req.body ?? {};

  const updated = await db.tenant.update({
    where: { id: session.tenantId },
    data: {
      ...(organizationName && { organizationName }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(fiscalYearStart !== undefined && { fiscalYearStart: Number(fiscalYearStart) }),
      ...(currency && { currency }),
      ...(inviteOnly !== undefined && { inviteOnly: Boolean(inviteOnly) }),
    },
  });

  res.json({
    organizationName: updated.organizationName,
    logoUrl: updated.logoUrl,
    fiscalYearStart: updated.fiscalYearStart,
    currency: updated.currency,
    inviteOnly: updated.inviteOnly,
    tenantSlug: updated.tenantSlug,
  });
});

function defaultRules(workspaceId: string) {
  return [
    { name: "Duplicate detection", description: "Flag invoices with matching number, vendor, and amount submitted within 30 days.", enabled: true, owner: "AP Controls" },
    { name: "Vendor master check", description: "Block payment to vendors not in the approved vendor registry.", enabled: true, owner: "Procurement" },
    { name: "PO match required", description: "Invoices above ₹50,000 must reference a valid Purchase Order.", enabled: true, owner: "Finance" },
    { name: "GRN three-way match", description: "Verify goods receipt before releasing payment on inventory invoices.", enabled: false, owner: "Warehouse" },
    { name: "Tax compliance check", description: "Validate GST treatment against registered vendor classification.", enabled: true, owner: "Tax" },
    { name: "Approval policy", description: "Enforce approval authority matrix based on invoice amount and entity.", enabled: true, owner: "Finance Controls" },
    { name: "Evidence required", description: "Invoices above ₹1,00,000 require supporting documents before payment.", enabled: true, owner: "Internal Audit" },
  ];
}

function defaultNotifications(_workspaceId: string) {
  return [
    { name: "Invoice assigned", enabled: true },
    { name: "SLA breach warning", enabled: true },
    { name: "Invoice escalated", enabled: true },
    { name: "Invoice approved", enabled: false },
    { name: "Evidence received", enabled: true },
    { name: "New invoice uploaded", enabled: false },
  ];
}
