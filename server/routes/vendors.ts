import { Router } from "express";
import { db } from "../db.ts";

export const vendorRouter = Router();

// GET /api/vendors
vendorRouter.get("/", async (_req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const vendors = await db.vendorMaster.findMany({
    where: { tenantId: session.tenantId, isActive: true },
    orderBy: { vendorName: "asc" },
  });
  res.json(vendors);
});

// POST /api/vendors
vendorRouter.post("/", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { vendorName, vendorCode, gstin, panNumber, bankAccount, ifscCode, vendorEmail, vendorPhone } = req.body ?? {};
  if (!vendorName) { res.status(400).json({ error: "vendorName is required" }); return; }

  const vendor = await db.vendorMaster.create({
    data: {
      tenantId: session.tenantId,
      vendorName,
      vendorCode,
      gstin,
      panNumber,
      bankAccount,
      ifscCode,
      vendorEmail,
      vendorPhone,
      addedBy: session.displayName ?? "Admin",
    },
  });
  res.status(201).json(vendor);
});

// PUT /api/vendors/:id
vendorRouter.put("/:id", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const vendor = await db.vendorMaster.findFirst({
    where: { id: req.params.id, tenantId: session.tenantId },
  });
  if (!vendor) { res.status(404).json({ error: "not_found" }); return; }

  const updated = await db.vendorMaster.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(updated);
});

// DELETE /api/vendors/:id (soft delete)
vendorRouter.delete("/:id", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  await db.vendorMaster.updateMany({
    where: { id: req.params.id, tenantId: session.tenantId },
    data: { isActive: false },
  });
  res.json({ success: true });
});

// POST /api/vendors/import — bulk CSV import
vendorRouter.post("/import", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { vendors } = req.body ?? {};
  if (!Array.isArray(vendors) || vendors.length === 0) {
    res.status(400).json({ error: "vendors array required" });
    return;
  }

  const created = await db.vendorMaster.createMany({
    data: vendors.map((v: any) => ({
      tenantId: session.tenantId,
      vendorName: v.vendorName,
      vendorCode: v.vendorCode,
      gstin: v.gstin,
      panNumber: v.panNumber,
      bankAccount: v.bankAccount,
      ifscCode: v.ifscCode,
      vendorEmail: v.vendorEmail,
      addedBy: session.displayName ?? "Bulk Import",
    })),
    skipDuplicates: true,
  });
  res.json({ imported: created.count });
});

// GET /api/purchase-orders
vendorRouter.get("/purchase-orders", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const pos = await db.purchaseOrder.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { issuedAt: "desc" },
    take: 200,
  });
  res.json(pos);
});

// POST /api/purchase-orders
vendorRouter.post("/purchase-orders", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { poNumber, vendorName, totalAmount, issuedAt, expiresAt } = req.body ?? {};
  if (!poNumber || !vendorName || !totalAmount) {
    res.status(400).json({ error: "poNumber, vendorName, totalAmount required" });
    return;
  }

  const vendor = await db.vendorMaster.findFirst({
    where: { tenantId: session.tenantId, vendorName: { contains: vendorName, mode: "insensitive" } },
  });

  const po = await db.purchaseOrder.create({
    data: {
      tenantId: session.tenantId,
      vendorId: vendor?.id,
      poNumber,
      vendorName,
      totalAmount: Number(totalAmount),
      issuedAt: new Date(issuedAt),
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    },
  });
  res.status(201).json(po);
});

// POST /api/purchase-orders/import — bulk import
vendorRouter.post("/purchase-orders/import", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { orders } = req.body ?? {};
  if (!Array.isArray(orders)) { res.status(400).json({ error: "orders array required" }); return; }

  const result = await db.purchaseOrder.createMany({
    data: orders.map((o: any) => ({
      tenantId: session.tenantId,
      poNumber: o.poNumber,
      vendorName: o.vendorName,
      totalAmount: Number(o.totalAmount),
      issuedAt: new Date(o.issuedAt),
    })),
    skipDuplicates: true,
  });
  res.json({ imported: result.count });
});

// POST /api/goods-receipts
vendorRouter.post("/goods-receipts", async (req, res) => {
  const session = res.locals.enterpriseSession;
  if (!session) { res.status(401).json({ error: "unauthorized" }); return; }

  const { grnNumber, poId, receivedAt, receivedAmount } = req.body ?? {};
  if (!grnNumber || !receivedAmount) { res.status(400).json({ error: "grnNumber and receivedAmount required" }); return; }

  const grn = await db.goodsReceipt.create({
    data: {
      tenantId: session.tenantId,
      grnNumber,
      poId,
      receivedAt: new Date(receivedAt ?? Date.now()),
      receivedAmount: Number(receivedAmount),
    },
  });
  res.status(201).json(grn);
});
