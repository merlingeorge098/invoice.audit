import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db.ts";
import { AuditTrailService } from "../../server/services/auditTrailService.ts";
import { EvidenceService } from "../../server/services/evidenceService.ts";
import { applyEnterpriseInvoiceAction } from "../../server/enterprise.ts";
import crypto from "crypto";
import fs from "fs";
import path from "path";

describe("Phase 7: Tamper-Evident Audit Evidence and Compilation", () => {
  const testTenantSlug = "evidence-test-tenant";
  let tenantId = "";
  let testInvoiceId = "";
  let generatedEvidenceFilePath = "";

  beforeAll(async () => {
    // Cleanup any existing tests
    await db.auditEvent.deleteMany({
      where: { invoice: { tenant: { tenantSlug: testTenantSlug } } },
    });
    await db.invoice.deleteMany({
      where: { tenant: { tenantSlug: testTenantSlug } },
    });
    await db.tenant.deleteMany({
      where: { tenantSlug: testTenantSlug },
    });

    // Create test tenant
    const tenant = await db.tenant.create({
      data: {
        organizationName: "Evidence Test Org",
        workspaceId: "workspace-evidence-test",
        workspaceName: "Evidence Test Workspace",
        tenantSlug: testTenantSlug,
        authMethod: "sso",
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    // Cleanup database
    if (testInvoiceId) {
      await db.auditEvent.deleteMany({ where: { invoiceId: testInvoiceId } });
      await db.invoice.deleteMany({ where: { id: testInvoiceId } });
    }
    await db.tenant.deleteMany({
      where: { id: tenantId },
    });

    // Cleanup generated evidence file
    if (generatedEvidenceFilePath && fs.existsSync(generatedEvidenceFilePath)) {
      try {
        fs.unlinkSync(generatedEvidenceFilePath);
      } catch (e) {
        console.error("Cleanup of evidence file failed:", e);
      }
    }
  });

  it("enforces append-only security block on the AuditEvent model when running in production mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      // Attempt update
      await expect(
        db.auditEvent.update({
          where: { id: "test-non-existent-id" },
          data: { detail: "hacked" },
        })
      ).rejects.toThrow("Updates to AuditEvent are blocked by append-only policy.");

      // Attempt delete
      await expect(
        db.auditEvent.delete({
          where: { id: "test-non-existent-id" },
        })
      ).rejects.toThrow("Deletions of AuditEvent are blocked by append-only policy.");
      
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("builds a valid cryptographic SHA-256 hash chain for sequential audit events", async () => {
    const invoice = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-EVID-99",
        vendorName: "Evidence Vendor",
        vendorCode: "V-EVID",
        entity: "APAC Division",
        amount: 25000.0,
        invoiceDate: "15 May 2026",
        dueDate: "30 May 2026",
        poNumber: "PO-EVID-01",
        grnNumber: "GRN-EVID-01",
        status: "pending-review",
        riskLevel: "medium",
        riskScore: 50,
        confidence: 90,
        duplicateLikelihood: 10,
        sourceChannel: "API Intake",
        assignedReviewer: "Megha Bhat",
        agingHours: 5,
        summary: "Test Evidence Invoice",
        workflowRecommendation: "",
        fileHash: "sha256-hash-placeholder-12345"
      },
    });
    testInvoiceId = invoice.id;

    // Log first event
    const event1 = await AuditTrailService.logEvent(db, testInvoiceId, "System", "First Action", "First detail entry.");
    expect(event1.signature).toBeDefined();

    // Log second event
    const event2 = await AuditTrailService.logEvent(db, testInvoiceId, "System", "Second Action", "Second detail entry.");
    expect(event2.signature).toBeDefined();

    // Mathematically verify signature chaining of event2
    const reconstructedState = JSON.stringify({
      invoiceId: testInvoiceId,
      actor: "System",
      action: "Second Action",
      detail: "Second detail entry.",
      timestamp: event2.timestamp,
      previousSignature: event1.signature
    });

    const expectedSignature = crypto.createHash("sha256").update(reconstructedState).digest("hex");
    expect(event2.signature).toBe(expectedSignature);
  });

  it("compiles and saves a JSON evidence compliance package when invoice is approved", async () => {
    // Approve invoice, triggering status move to auto-approved
    const res = await applyEnterpriseInvoiceAction(tenantId, testInvoiceId, "approve", "Priya Raman", "Approve for compliance package check");
    expect(res?.success).toBe(true);

    const updated = await db.invoice.findUnique({
      where: { id: testInvoiceId }
    });
    expect(updated?.status).toBe("auto-approved");

    // Check if package compiled under storage/evidence-packages/{invoiceId}.json
    const expectedPath = path.join(process.cwd(), "storage", "evidence-packages", `${testInvoiceId}.json`);
    generatedEvidenceFilePath = expectedPath;

    expect(fs.existsSync(expectedPath)).toBe(true);

    const fileContent = fs.readFileSync(expectedPath, "utf8");
    const parsedBundle = JSON.parse(fileContent);

    expect(parsedBundle.invoiceId).toBe(testInvoiceId);
    expect(parsedBundle.invoiceNumber).toBe("INV-EVID-99");
    expect(parsedBundle.fileHash).toBe("sha256-hash-placeholder-12345");
    expect(parsedBundle.lineItems).toBeDefined();
    expect(parsedBundle.validationChecks).toBeDefined();
    expect(parsedBundle.auditTrail.length).toBeGreaterThanOrEqual(3); // Ingestion, Ingestion OCR, First Action, Second Action, Approve
    
    // Verify that signatures are present in the compiled audit trail
    const compiledEvents = parsedBundle.auditTrail;
    compiledEvents.forEach((ev: any) => {
      expect(ev.signature).toBeDefined();
    });
  });
});
