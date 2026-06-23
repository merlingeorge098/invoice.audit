import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db.ts";
import { applyEnterpriseComparison } from "../../server/enterprise.ts";

describe("Phase 6: Human-in-the-Loop Corrections and Workbench Alignment", () => {
  const testTenantSlug = "correction-test-tenant";
  let tenantId = "";
  let testInvoiceId = "";

  beforeAll(async () => {
    // Cleanup any existing tests
    await db.auditEvent.deleteMany({
      where: { invoice: { tenant: { tenantSlug: testTenantSlug } } },
    });
    await db.fieldComparison.deleteMany({
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
        organizationName: "Correction Test Org",
        workspaceId: "workspace-correction-test",
        workspaceName: "Correction Test Workspace",
        tenantSlug: testTenantSlug,
        authMethod: "sso",
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testInvoiceId) {
      await db.auditEvent.deleteMany({ where: { invoiceId: testInvoiceId } });
      await db.fieldComparison.deleteMany({ where: { invoiceId: testInvoiceId } });
      await db.invoice.deleteMany({ where: { id: testInvoiceId } });
    }
    await db.tenant.deleteMany({
      where: { id: tenantId },
    });
  });

  it("updates both FieldComparison and the core Invoice column when applying a field correction", async () => {
    // Create an invoice with comparison fields
    const invoice = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-OLD-111",
        vendorName: "Old Vendor",
        vendorCode: "V-OLD",
        entity: "APAC Division",
        amount: 5000.0,
        invoiceDate: "15 May 2026",
        dueDate: "30 May 2026",
        poNumber: "PO-OLD-01",
        grnNumber: "GRN-OLD-01",
        status: "pending-review",
        riskLevel: "medium",
        riskScore: 50,
        confidence: 90,
        duplicateLikelihood: 10,
        sourceChannel: "API Intake",
        assignedReviewer: "Megha Bhat",
        agingHours: 5,
        summary: "Test Correction Invoice",
        workflowRecommendation: "",
        fieldComparisons: {
          create: [
            {
              field: "Invoice number",
              submitted: "INV-OLD-111",
              extracted: "INV-OLD-111",
              suggestion: "INV-NEW-999",
              reason: "Misread digit '1' instead of '9' in scan."
            },
            {
              field: "Amount",
              submitted: "INR 5,000.00",
              extracted: "5000",
              suggestion: "INR 12,500.50",
              reason: "OCR missed the additional line item charge."
            },
            {
              field: "Vendor name",
              submitted: "Old Vendor",
              extracted: "Old Vendor",
              suggestion: "New Vendor Ltd",
              reason: "DB validation shows mismatch."
            },
            {
              field: "PO number",
              submitted: "PO-OLD-01",
              extracted: "PO-OLD-01",
              suggestion: "PO-NEW-77",
              reason: "Wrong purchase order matched."
            }
          ]
        }
      },
    });
    testInvoiceId = invoice.id;

    // Apply correction for "Invoice number"
    const res1 = await applyEnterpriseComparison(tenantId, testInvoiceId, "Invoice number", "Test Reviewer");
    expect(res1?.success).toBe(true);

    // Verify invoice fields and fieldComparison update
    const updatedInvoice1 = await db.invoice.findUnique({
      where: { id: testInvoiceId },
      include: { fieldComparisons: true, auditTrail: true }
    });

    expect(updatedInvoice1?.invoiceNumber).toBe("INV-NEW-999");
    const numComparison = updatedInvoice1?.fieldComparisons.find(c => c.field === "Invoice number");
    expect(numComparison?.extracted).toBe("INV-NEW-999");

    // Verify audit log
    const invoiceNumberAudit = updatedInvoice1?.auditTrail.find(a => a.detail.includes("Invoice number"));
    expect(invoiceNumberAudit).toBeDefined();
    expect(invoiceNumberAudit?.actor).toBe("Test Reviewer");
    expect(invoiceNumberAudit?.action).toBe("Applied comparison correction");

    // Apply correction for "Amount" (testing float parsing)
    const res2 = await applyEnterpriseComparison(tenantId, testInvoiceId, "Amount", "Test Reviewer");
    expect(res2?.success).toBe(true);

    const updatedInvoice2 = await db.invoice.findUnique({
      where: { id: testInvoiceId },
      include: { fieldComparisons: true, auditTrail: true }
    });

    expect(updatedInvoice2?.amount).toBe(12500.5);
    const amountComparison = updatedInvoice2?.fieldComparisons.find(c => c.field === "Amount");
    expect(amountComparison?.extracted).toBe("INR 12,500.50");

    // Apply correction for "Vendor name"
    const res3 = await applyEnterpriseComparison(tenantId, testInvoiceId, "Vendor name", "Test Reviewer");
    expect(res3?.success).toBe(true);

    const updatedInvoice3 = await db.invoice.findUnique({
      where: { id: testInvoiceId },
      include: { fieldComparisons: true }
    });

    expect(updatedInvoice3?.vendorName).toBe("New Vendor Ltd");

    // Apply correction for "PO number"
    const res4 = await applyEnterpriseComparison(tenantId, testInvoiceId, "PO number", "Test Reviewer");
    expect(res4?.success).toBe(true);

    const updatedInvoice4 = await db.invoice.findUnique({
      where: { id: testInvoiceId },
      include: { fieldComparisons: true }
    });

    expect(updatedInvoice4?.poNumber).toBe("PO-NEW-77");
  });
});
