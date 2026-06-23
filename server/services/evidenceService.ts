import { db } from "../db.ts";
import crypto from "crypto";
import { gzip } from "zlib";
import { promisify } from "util";
import { uploadEvidencePackage, getSignedUrl } from "./storage.ts";

const gzipAsync = promisify(gzip);

export class EvidenceService {
  /**
   * Compiles a tamper-evident compliance evidence bundle for an invoice.
   * Bundles invoice data, line items, validation checks, flags, and audit trail
   * into a SHA-256 signed JSON manifest, GZip-compresses it, and uploads to
   * Supabase Storage. Tracks the result in the EvidencePackage model.
   */
  static async compileEvidencePackage(
    invoiceId: string,
    tenantId: string,
    requestedBy: string,
  ): Promise<{ packageId: string; storagePath: string; sha256Hash: string }> {
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lineItems: true,
        validationChecks: true,
        flags: true,
        structuredFields: true,
        evidenceAttachments: {
          select: { fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true, fromVendorPortal: true },
        },
        auditTrail: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

    const compiledAt = new Date().toISOString();

    const bundle: Record<string, unknown> = {
      schemaVersion: "1.0",
      compiledAt,
      requestedBy,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorName: invoice.vendorName,
        vendorCode: invoice.vendorCode,
        entity: invoice.entity,
        amount: invoice.amount,
        currency: invoice.currency,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        poNumber: invoice.poNumber,
        grnNumber: invoice.grnNumber,
        gstin: invoice.gstin,
        status: invoice.status,
        riskLevel: invoice.riskLevel,
        riskScore: invoice.riskScore,
        confidence: invoice.confidence,
        duplicateLikelihood: invoice.duplicateLikelihood,
        sourceChannel: invoice.sourceChannel,
        fileHash: invoice.fileHash,
        summary: invoice.summary,
        workflowRecommendation: invoice.workflowRecommendation,
      },
      lineItems: invoice.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        hsn: item.hsn,
        taxRate: item.taxRate,
        status: item.status,
      })),
      validationChecks: invoice.validationChecks.map((check) => ({
        label: check.label,
        status: check.status,
        detail: check.detail,
      })),
      flags: invoice.flags.map((flag) => ({
        title: flag.title,
        severity: flag.severity,
        detail: flag.detail,
      })),
      evidenceAttachments: invoice.evidenceAttachments.map((att) => ({
        fileName: att.fileName,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        uploadedAt: att.uploadedAt,
        fromVendorPortal: att.fromVendorPortal,
      })),
      auditTrail: invoice.auditTrail.map((event) => ({
        timestamp: event.timestamp,
        actor: event.actor,
        action: event.action,
        detail: event.detail,
        signature: event.signature,
      })),
    };

    // Compute content hash before adding it to the bundle
    const contentBytes = Buffer.from(JSON.stringify(bundle), "utf8");
    const sha256Hash = crypto.createHash("sha256").update(contentBytes).digest("hex");
    bundle.sha256Hash = sha256Hash;

    const signedBytes = Buffer.from(JSON.stringify(bundle, null, 2), "utf8");
    const compressed = await gzipAsync(signedBytes) as Buffer;
    const timestamp = compiledAt.replace(/[:.]/g, "-");

    // Create DB record first (status: generating)
    const pkg = await db.evidencePackage.create({
      data: { invoiceId, tenantId, storagePath: "", sha256Hash, generatedBy: requestedBy, status: "generating" },
    });

    try {
      const { storagePath } = await uploadEvidencePackage(tenantId, invoiceId, compressed, timestamp);
      await db.evidencePackage.update({ where: { id: pkg.id }, data: { storagePath, status: "ready" } });
      return { packageId: pkg.id, storagePath, sha256Hash };
    } catch (err) {
      await db.evidencePackage.update({ where: { id: pkg.id }, data: { status: "failed" } });
      throw err;
    }
  }

  /**
   * Returns a signed 1-hour download URL for the latest ready evidence package.
   * Generates a fresh package if none exists or the last one failed.
   */
  static async getOrCreatePackage(
    invoiceId: string,
    tenantId: string,
    requestedBy: string,
  ): Promise<{ packageId: string; downloadUrl: string; sha256Hash: string; generatedAt: Date }> {
    const existing = await db.evidencePackage.findFirst({
      where: { invoiceId, tenantId, status: "ready" },
      orderBy: { generatedAt: "desc" },
    });

    if (existing) {
      const downloadUrl = await getSignedUrl(existing.storagePath, 3600);
      return { packageId: existing.id, downloadUrl, sha256Hash: existing.sha256Hash, generatedAt: existing.generatedAt };
    }

    const { packageId, storagePath, sha256Hash } = await EvidenceService.compileEvidencePackage(
      invoiceId,
      tenantId,
      requestedBy,
    );
    const downloadUrl = await getSignedUrl(storagePath, 3600);
    const pkg = await db.evidencePackage.findUnique({ where: { id: packageId } });

    return { packageId, downloadUrl, sha256Hash, generatedAt: pkg?.generatedAt ?? new Date() };
  }
}
