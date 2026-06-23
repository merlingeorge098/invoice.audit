import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.ts";
import { permissionsByRole, type EnterpriseRole } from "../store.ts";

export const superAdminRouter = Router();

function requireSuperAdmin(req: any, res: any, next: any) {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }
  // Super-admin flag checked against DB session user
  db.user.findUnique({ where: { id: session.userId }, select: { isSuperAdmin: true } }).then((user) => {
    if (!user?.isSuperAdmin) {
      res.status(403).json({ error: "super_admin_required" });
      return;
    }
    next();
  }).catch(() => res.status(500).json({ error: "internal_error" }));
}

// GET /api/admin/tenants
superAdminRouter.get("/tenants", requireSuperAdmin, async (req, res) => {
  const tenants = await db.tenant.findMany({
    include: {
      _count: { select: { invoices: true, users: true } },
      stripeCustomer: { select: { planSlug: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(tenants);
});

// POST /api/admin/tenants/:id/lock
superAdminRouter.post("/tenants/:id/lock", requireSuperAdmin, async (req, res) => {
  await db.stripeCustomer.upsert({
    where: { tenantId: req.params.id },
    update: { status: "locked" },
    create: { tenantId: req.params.id, stripeCustomerId: `manual-${req.params.id}`, status: "locked", planSlug: "free" },
  });
  res.json({ success: true });
});

// POST /api/admin/tenants/:id/unlock
superAdminRouter.post("/tenants/:id/unlock", requireSuperAdmin, async (req, res) => {
  await db.stripeCustomer.updateMany({
    where: { tenantId: req.params.id },
    data: { status: "active" },
  });
  res.json({ success: true });
});

// GET /api/admin/users
superAdminRouter.get("/users", requireSuperAdmin, async (req, res) => {
  const { q } = req.query as { q?: string };
  const users = await db.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : undefined,
    include: { memberships: { select: { tenantId: true, role: true } } },
    take: 50,
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
});

// POST /api/admin/impersonate/:userId
superAdminRouter.post("/impersonate/:userId", requireSuperAdmin, async (req, res) => {
  const adminSession = res.locals.enterpriseSession;
  const targetUser = await db.user.findUnique({
    where: { id: req.params.userId },
    include: { memberships: { take: 1, include: { tenant: true } } },
  });
  if (!targetUser || !targetUser.memberships[0]) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }

  const membership = targetUser.memberships[0];
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours max

  await db.session.create({
    data: {
      sessionToken,
      userId: targetUser.id,
      tenantId: membership.tenantId,
      isImpersonation: true,
      impersonatedBy: adminSession.userId,
      expiresAt,
    },
  });

  res.json({
    sessionToken,
    tenantSlug: membership.tenant.tenantSlug,
    email: targetUser.email,
    targetPath: `/app/${membership.tenant.tenantSlug}/dashboard`,
    expiresAt: expiresAt.toISOString(),
  });
});

// POST /api/admin/impersonate-tenant/:tenantId — impersonate the admin user of a tenant
superAdminRouter.post("/impersonate-tenant/:tenantId", requireSuperAdmin, async (req, res) => {
  const adminSession = res.locals.enterpriseSession;

  const tenant = await db.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant) { res.status(404).json({ error: "tenant_not_found" }); return; }

  // Find the admin user (prefer Admin role, fall back to any member)
  const adminMembership = await db.workspaceMembership.findFirst({
    where: { tenantId: req.params.tenantId, role: "Admin", isActive: true },
    include: { user: true },
  }) ?? await db.workspaceMembership.findFirst({
    where: { tenantId: req.params.tenantId, isActive: true },
    include: { user: true },
  });

  if (!adminMembership) { res.status(404).json({ error: "no_members" }); return; }

  const user = adminMembership.user;
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      sessionToken,
      userId: user.id,
      tenantId: tenant.id,
      isImpersonation: true,
      impersonatedBy: adminSession.userId,
      expiresAt,
    },
  });

  res.json({
    sessionToken,
    userId: user.id,
    organizationId: tenant.id,
    organizationName: tenant.organizationName,
    workspaceId: tenant.workspaceId,
    workspaceName: tenant.workspaceName,
    tenantSlug: tenant.tenantSlug,
    email: user.email,
    displayName: user.displayName,
    role: adminMembership.role,
    permissions: permissionsByRole[adminMembership.role as EnterpriseRole] ?? [],
    provider: { providerId: "impersonation", providerLabel: "Super Admin Impersonation", protocol: "INTERNAL", loginLabel: "", mfa: "app-enforced" },
    assurance: { mfa: "app-enforced", sessionType: "impersonation" },
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    targetPath: `/app/${tenant.tenantSlug}/dashboard`,
    isImpersonation: true,
  });
});

// GET /api/admin/metrics
superAdminRouter.get("/metrics", requireSuperAdmin, async (_req, res) => {
  const [tenantCount, userCount, invoiceCount, stripeCustomers] = await Promise.all([
    db.tenant.count(),
    db.user.count(),
    db.invoice.count({ where: { status: { not: "system" } } }),
    db.stripeCustomer.groupBy({ by: ["planSlug"], _count: { id: true } }),
  ]);

  const planBreakdown = stripeCustomers.reduce((acc: Record<string, number>, row) => {
    acc[row.planSlug] = row._count.id;
    return acc;
  }, {});

  res.json({ tenantCount, userCount, invoiceCount, planBreakdown });
});
