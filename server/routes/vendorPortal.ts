import { Router } from "express";
import multer from "multer";
import { db } from "../db.ts";
import { uploadEvidenceFile, getSignedUrl } from "../services/storage.ts";
import { notifyEvidenceReceived } from "../services/notifications.ts";
import { AuditTrailService } from "../services/auditTrailService.ts";

export const vendorPortalRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/vendor-portal/:token — get invoice info for the vendor (public, token is auth)
vendorPortalRouter.get("/:token", async (req, res) => {
  const invite = await db.inviteToken.findUnique({ where: { token: req.params.token } });
  // Vendor portal tokens are stored as VerificationToken with a special email pattern
  const portalToken = await db.verificationToken.findUnique({ where: { token: req.params.token } });

  if (!portalToken || new Date() > portalToken.expiresAt) {
    res.status(404).json({ error: "invalid_token", message: "This link is invalid or has expired." });
    return;
  }

  // The email field stores `vendor-portal:{invoiceId}:{tenantId}`
  const [, invoiceId, tenantId] = portalToken.email.split(":");
  if (!invoiceId || !tenantId) {
    res.status(400).json({ error: "malformed_token" });
    return;
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { invoiceNumber: true, vendorName: true, amount: true, status: true },
  });

  if (!invoice) {
    res.status(404).json({ error: "invoice_not_found" });
    return;
  }

  res.json({
    invoiceNumber: invoice.invoiceNumber,
    vendorName: invoice.vendorName,
    amount: invoice.amount,
    expiresAt: portalToken.expiresAt.toISOString(),
  });
});

// POST /api/vendor-portal/:token/upload — vendor uploads evidence (public, token is auth)
vendorPortalRouter.post(
  "/:token/upload",
  (req, res, next) => {
    upload.array("files", 5)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    const portalToken = await db.verificationToken.findUnique({ where: { token: req.params.token } });

    if (!portalToken || new Date() > portalToken.expiresAt) {
      res.status(403).json({ error: "invalid_token" });
      return;
    }

    const [, invoiceId, tenantId] = portalToken.email.split(":");
    const files = (req.files as Express.Multer.File[]) ?? [];

    if (files.length === 0) {
      res.status(400).json({ error: "no_files" });
      return;
    }

    const uploaded: { fileName: string; attachmentId: string }[] = [];

    for (const file of files) {
      const { storagePath } = await uploadEvidenceFile(tenantId, invoiceId, file.buffer, file.mimetype, file.originalname);
      const attachment = await db.evidenceAttachment.create({
        data: {
          invoiceId,
          fileName: file.originalname,
          storagePath,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          uploadedBy: "Vendor Portal",
          fromVendorPortal: true,
        },
      });
      uploaded.push({ fileName: file.originalname, attachmentId: attachment.id });
    }

    // Update invoice status if it was waiting for evidence
    await db.invoice.updateMany({
      where: { id: invoiceId, status: "needs-evidence" },
      data: { status: "pending-review" },
    });

    await AuditTrailService.logEvent(db, invoiceId, "Vendor Portal", "Evidence Uploaded", `${files.length} file(s) uploaded via vendor portal.`);

    // Notify the assigned reviewer
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { invoiceNumber: true, assignedReviewer: true } });
    if (invoice) {
      const reviewer = await db.workspaceMembership.findFirst({
        where: { tenantId, isActive: true, role: { in: ["Finance Manager", "Controller", "Admin"] } },
      });
      if (reviewer) {
        await notifyEvidenceReceived(invoiceId, reviewer.userId, tenantId, invoice.invoiceNumber);
      }
    }

    res.json({ success: true, uploaded });
  },
);
