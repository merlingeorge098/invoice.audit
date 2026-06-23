import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db.ts";

export const apiKeysRouter = Router();

// GET /api/api-keys — list all API keys for tenant (hashes never exposed)
apiKeysRouter.get("/", async (_req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const keys = await db.tenantApiKey.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: true,
    },
  });

  res.json(keys);
});

// POST /api/api-keys — create a new API key (raw key shown once)
apiKeysRouter.post("/", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!session.permissions?.includes("settings:manage")) {
    res.status(403).json({ error: "permission_denied", message: "Only admins can create API keys." });
    return;
  }

  const { label, expiresAt } = req.body ?? {};
  if (!label?.trim()) {
    res.status(400).json({ error: "invalid_request", message: "label is required." });
    return;
  }

  const rawKey = `ia_${crypto.randomBytes(28).toString("hex")}`;
  const keyHash = await bcrypt.hash(rawKey, 10);
  const keyPrefix = rawKey.slice(0, 10);

  const apiKey = await db.tenantApiKey.create({
    data: {
      tenantId: session.tenantId,
      label: label.trim(),
      keyHash,
      keyPrefix,
      createdBy: session.userId,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  res.status(201).json({ ...apiKey, rawKey });
});

// DELETE /api/api-keys/:id — revoke an API key
apiKeysRouter.delete("/:id", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!session.permissions?.includes("settings:manage")) {
    res.status(403).json({ error: "permission_denied", message: "Only admins can revoke API keys." });
    return;
  }

  const key = await db.tenantApiKey.findFirst({
    where: { id: req.params.id, tenantId: session.tenantId },
  });

  if (!key) { res.status(404).json({ error: "not_found" }); return; }

  await db.tenantApiKey.update({
    where: { id: key.id },
    data: { revokedAt: new Date() },
  });

  res.json({ success: true });
});
