import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.ts";
import { AuditTrailService } from "../services/auditTrailService.ts";
import { permissionsByRole, type EnterpriseRole } from "../store.ts";

export const userManagementRouter = Router();

// GET /api/users — list all workspace members
userManagementRouter.get("/", async (_req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const members = await db.workspaceMembership.findMany({
    where: { tenantId: session.tenantId },
    include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true, createdAt: true } } },
    orderBy: { joinedAt: "asc" },
  });

  res.json(members.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    email: m.user.email,
    displayName: m.user.displayName,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    isActive: m.isActive,
    joinedAt: m.joinedAt.toISOString(),
    permissions: permissionsByRole[m.role as EnterpriseRole] ?? [],
  })));
});

// PATCH /api/users/:userId/role — change role
userManagementRouter.patch("/:userId/role", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { role } = req.body ?? {};
  const validRoles = ["AP Reviewer", "Finance Manager", "Controller", "Auditor", "Admin"];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "invalid_role" });
    return;
  }

  const membership = await db.workspaceMembership.findUnique({
    where: { userId_tenantId: { userId: req.params.userId, tenantId: session.tenantId } },
  });
  if (!membership) { res.status(404).json({ error: "member_not_found" }); return; }

  const oldRole = membership.role;
  await db.workspaceMembership.update({
    where: { id: membership.id },
    data: { role },
  });

  // Log role change
  const systemInvoice = await db.invoice.findFirst({ where: { tenantId: session.tenantId, invoiceNumber: "SYSTEM-SETTINGS" } });
  if (systemInvoice) {
    await AuditTrailService.logEvent(db, systemInvoice.id, session.displayName ?? "Admin", "Role Changed", `User ${req.params.userId} role changed from ${oldRole} to ${role}.`);
  }

  res.json({ success: true, role });
});

// DELETE /api/users/:userId — remove from workspace
userManagementRouter.delete("/:userId", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  if (req.params.userId === session.userId) {
    res.status(400).json({ error: "cannot_remove_self", message: "You cannot remove yourself from the workspace." });
    return;
  }

  await db.workspaceMembership.updateMany({
    where: { userId: req.params.userId, tenantId: session.tenantId },
    data: { isActive: false },
  });

  // Invalidate all sessions for this user in this tenant
  await db.session.deleteMany({ where: { userId: req.params.userId, tenantId: session.tenantId } });

  res.json({ success: true });
});

// GET /api/api-keys — list API keys for tenant
userManagementRouter.get("/api-keys", async (_req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const keys = await db.tenantApiKey.findMany({
    where: { tenantId: session.tenantId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, keyPrefix: true, createdBy: true, createdAt: true, expiresAt: true, lastUsedAt: true },
  });
  res.json(keys);
});

// POST /api/api-keys — generate new API key
userManagementRouter.post("/api-keys", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { label, expiresAt } = req.body ?? {};
  if (!label) { res.status(400).json({ error: "label is required" }); return; }

  const rawKey = `ia_${crypto.randomBytes(32).toString("hex")}`;
  const keyPrefix = rawKey.substring(0, 12);

  // Hash with bcrypt for storage
  const bcrypt = await import("bcryptjs");
  const keyHash = await bcrypt.hash(rawKey, 10);

  await db.tenantApiKey.create({
    data: {
      tenantId: session.tenantId,
      label,
      keyHash,
      keyPrefix,
      createdBy: session.displayName ?? "Admin",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    },
  });

  // Return the raw key ONCE — never retrievable again
  res.status(201).json({ key: rawKey, keyPrefix, label, message: "Store this key securely. It will not be shown again." });
});

// DELETE /api/api-keys/:id — revoke API key
userManagementRouter.delete("/api-keys/:id", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  await db.tenantApiKey.updateMany({
    where: { id: req.params.id, tenantId: session.tenantId },
    data: { revokedAt: new Date() },
  });
  res.json({ success: true });
});

// DELETE /api/users/me — GDPR right-to-erasure: anonymize and remove user data
userManagementRouter.delete("/me", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const userId = session.userId;
  const anonEmail = `deleted_${userId}@deleted.invalid`;

  await db.$transaction([
    // Anonymize PII
    db.user.update({
      where: { id: userId },
      data: {
        email: anonEmail,
        displayName: "Deleted User",
        avatarUrl: null,
        googleId: null,
      },
    }),
    // Deactivate all memberships
    db.workspaceMembership.updateMany({
      where: { userId },
      data: { isActive: false },
    }),
    // Revoke all sessions
    db.session.deleteMany({ where: { userId } }),
    // Remove notification events
    db.notificationEvent.deleteMany({ where: { userId } }),
  ]);

  // Clear the session cookie
  res.clearCookie("ia_session");
  res.json({ success: true, message: "Account data deleted. You have been signed out." });
});
