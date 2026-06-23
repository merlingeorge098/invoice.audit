import { Router } from "express";
import { db } from "../db.ts";

export const notificationsRouter = Router();

// GET /api/notifications — paginated notifications for current user (?page=1)
notificationsRouter.get("/", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const PAGE_SIZE = 25;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [events, total, unreadCount] = await Promise.all([
    db.notificationEvent.findMany({
      where: { userId: session.userId, tenantId: session.tenantId },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    db.notificationEvent.count({ where: { userId: session.userId, tenantId: session.tenantId } }),
    db.notificationEvent.count({ where: { userId: session.userId, tenantId: session.tenantId, readAt: null } }),
  ]);

  res.json({
    items: events,
    unreadCount,
    page,
    hasMore: skip + events.length < total,
    total,
  });
});

// POST /api/notifications/:id/read
notificationsRouter.post("/:id/read", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  await db.notificationEvent.updateMany({
    where: { id: req.params.id, userId: session.userId },
    data: { readAt: new Date() },
  });
  res.json({ success: true });
});

// POST /api/notifications/read-all
notificationsRouter.post("/read-all", async (_req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  await db.notificationEvent.updateMany({
    where: { userId: session.userId, tenantId: session.tenantId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ success: true });
});
