import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db.ts";
import { runInvoiceValidation } from "../../server/services/validationEngine.ts";

describe("Phase 4: Validation Engine and Control Checks", () => {
  const testTenantSlug = "val-test-tenant";
  let tenantId = "";
  let lowRiskInvoiceId = "";
  let highValueInvoiceId = "";
  let mathDiscrepancyInvoiceId = "";
  let duplicateInvoiceId1 = "";
  let duplicateInvoiceId2 = "";

  beforeAll(async () => {
    // Cleanup any existing tests
    await db.invoiceAnomaly.deleteMany({
      where: { invoice: { tenant: { tenantSlug: testTenantSlug } } },
    });
    await db.validationCheck.deleteMany({
      where: { invoice: { tenant: { tenantSlug: testTenantSlug } } },
    });
    await db.invoiceFlag.deleteMany({
      where: { invoice: { tenant: { tenantSlug: testTenantSlug } } },
    });
    await db.invoice.deleteMany({
      where: { tenant: { tenantSlug: testTenantSlug } },
    });
    await db.ruleSetting.deleteMany({
      where: { tenant: { tenantSlug: testTenantSlug } },
    });
    await db.tenant.deleteMany({
      where: { tenantSlug: testTenantSlug },
    });

    // Create test tenant
    const tenant = await db.tenant.create({
      data: {
        organizationName: "Validation Test Org",
        workspaceId: "workspace-val-test",
        workspaceName: "Validation Test Workspace",
        tenantSlug: testTenantSlug,
        authMethod: "sso",
      },
    });
    tenantId = tenant.id;

    // Create rule settings (Duplicate detection enabled, Tax compliance enabled)
    await db.ruleSetting.create({
      data: {
        tenantId,
        name: "Duplicate detection",
        description: "Exact duplicate match checks.",
        enabled: true,
        owner: "Controls",
      },
    });

    await db.ruleSetting.create({
      data: {
        tenantId,
        name: "Tax compliance",
        description: "Verify line item totals.",
        enabled: true,
        owner: "Tax",
      },
    });

    // Setup: Create 1 standard low-risk invoice
    const inv1 = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-VAL-001",
        vendorName: "Standard Clean Vendor",
        vendorCode: "V-CLEAN",
        entity: "Main Unit",
        amount: 50000,
        invoiceDate: "12 May 2026",
        dueDate: "26 May 2026",
        poNumber: "PO-CLEAN-01",
        grnNumber: "N/A",
        status: "processing",
        riskLevel: "low",
        riskScore: 0,
        confidence: 99,
        duplicateLikelihood: 0,
        sourceChannel: "API Intake",
        assignedReviewer: "Unassigned",
        agingHours: 0,
        summary: "",
        workflowRecommendation: "",
        lineItems: {
          create: [
            { description: "Office desks", quantity: 5, unitPrice: 10000, total: 50000, status: "pending" }
          ]
        }
      },
    });
    lowRiskInvoiceId = inv1.id;

    // Setup: Create 1 high-value invoice (>1.25M)
    const inv2 = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-VAL-002",
        vendorName: "Large Vendor Corp",
        vendorCode: "V-CORP",
        entity: "Main Unit",
        amount: 2000000, // 2M
        invoiceDate: "12 May 2026",
        dueDate: "26 May 2026",
        poNumber: "PO-CORP-01",
        grnNumber: "N/A",
        status: "processing",
        riskLevel: "low",
        riskScore: 0,
        confidence: 99,
        duplicateLikelihood: 0,
        sourceChannel: "API Intake",
        assignedReviewer: "Unassigned",
        agingHours: 0,
        summary: "",
        workflowRecommendation: "",
        lineItems: {
          create: [
            { description: "Server racks", quantity: 2, unitPrice: 1000000, total: 2000000, status: "pending" }
          ]
        }
      },
    });
    highValueInvoiceId = inv2.id;

    // Setup: Create 1 invoice with math discrepancy (Total total vs line totals mismatch)
    const inv3 = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-VAL-003",
        vendorName: "Math Vendor",
        vendorCode: "V-MATH",
        entity: "Main Unit",
        amount: 100000,
        invoiceDate: "12 May 2026",
        dueDate: "26 May 2026",
        poNumber: "PO-MATH-01",
        grnNumber: "N/A",
        status: "processing",
        riskLevel: "low",
        riskScore: 0,
        confidence: 99,
        duplicateLikelihood: 0,
        sourceChannel: "API Intake",
        assignedReviewer: "Unassigned",
        agingHours: 0,
        summary: "",
        workflowRecommendation: "",
        lineItems: {
          create: [
            // Lines sum to 80000 instead of 100000 (20% variance)
            { description: "Supplies A", quantity: 1, unitPrice: 80000, total: 80000, status: "pending" }
          ]
        }
      },
    });
    mathDiscrepancyInvoiceId = inv3.id;

    // Setup: Create duplicates
    const dup1 = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-DUP-100",
        vendorName: "Double Vendor",
        vendorCode: "V-DBL",
        entity: "Main Unit",
        amount: 10000,
        invoiceDate: "12 May 2026",
        dueDate: "26 May 2026",
        poNumber: "N/A",
        grnNumber: "N/A",
        status: "auto-approved",
        riskLevel: "low",
        riskScore: 10,
        confidence: 99,
        duplicateLikelihood: 0,
        sourceChannel: "API Intake",
        assignedReviewer: "Unassigned",
        agingHours: 0,
        summary: "",
        workflowRecommendation: "",
      },
    });
    duplicateInvoiceId1 = dup1.id;

    const dup2 = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-DUP-100", // Matches duplicate 1
        vendorName: "Double Vendor",  // Matches duplicate 1
        vendorCode: "V-DBL",
        entity: "Main Unit",
        amount: 10000,
        invoiceDate: "12 May 2026",
        dueDate: "26 May 2026",
        poNumber: "N/A",
        grnNumber: "N/A",
        status: "processing",
        riskLevel: "low",
        riskScore: 0,
        confidence: 99,
        duplicateLikelihood: 0,
        sourceChannel: "API Intake",
        assignedReviewer: "Unassigned",
        agingHours: 0,
        summary: "",
        workflowRecommendation: "",
      },
    });
    duplicateInvoiceId2 = dup2.id;
  });

  afterAll(async () => {
    // Cleanup
    await db.invoiceAnomaly.deleteMany({
      where: { invoiceId: { in: [lowRiskInvoiceId, highValueInvoiceId, mathDiscrepancyInvoiceId, duplicateInvoiceId1, duplicateInvoiceId2] } },
    });
    await db.validationCheck.deleteMany({
      where: { invoiceId: { in: [lowRiskInvoiceId, highValueInvoiceId, mathDiscrepancyInvoiceId, duplicateInvoiceId1, duplicateInvoiceId2] } },
    });
    await db.invoiceFlag.deleteMany({
      where: { invoiceId: { in: [lowRiskInvoiceId, highValueInvoiceId, mathDiscrepancyInvoiceId, duplicateInvoiceId1, duplicateInvoiceId2] } },
    });
    await db.invoice.deleteMany({
      where: { tenantId },
    });
    await db.ruleSetting.deleteMany({
      where: { tenantId },
    });
    await db.tenant.deleteMany({
      where: { id: tenantId },
    });
  });

  it("auto-approves a valid low-risk invoice", async () => {
    const outcome = await runInvoiceValidation(tenantId, lowRiskInvoiceId);
    expect(outcome.status).toBe("auto-approved");

    const updated = await db.invoice.findUnique({
      where: { id: lowRiskInvoiceId },
      include: { validationChecks: true, flags: true }
    });

    expect(updated?.status).toBe("auto-approved");
    expect(updated?.riskLevel).toBe("low");
    expect(updated?.riskScore).toBe(10);
    expect(updated?.flags.length).toBe(0);
    expect(updated?.validationChecks.every((c) => c.status === "pass")).toBe(true);
  });

  it("escalates a high-value invoice exceeding INR 1.25M approval cap", async () => {
    const outcome = await runInvoiceValidation(tenantId, highValueInvoiceId);
    expect(outcome.status).toBe("escalated");

    const updated = await db.invoice.findUnique({
      where: { id: highValueInvoiceId },
      include: { flags: true, anomalyTypes: true, validationChecks: true }
    });

    expect(updated?.status).toBe("escalated");
    expect(updated?.riskLevel).toBe("high");
    expect(updated?.riskScore).toBeGreaterThanOrEqual(80);

    const hasThresholdAnomaly = updated?.anomalyTypes.some((a) => a.type === "Threshold approval");
    const hasEscalationFlag = updated?.flags.some((f) => f.title === "Threshold escalation");
    const failedCheck = updated?.validationChecks.find((c) => c.label === "Approval policy");

    expect(hasThresholdAnomaly).toBe(true);
    expect(hasEscalationFlag).toBe(true);
    expect(failedCheck?.status).toBe("fail");
  });

  it("flags an invoice for pending review on tax compliance arithmetic mismatch", async () => {
    const outcome = await runInvoiceValidation(tenantId, mathDiscrepancyInvoiceId);
    expect(outcome.status).toBe("pending-review");

    const updated = await db.invoice.findUnique({
      where: { id: mathDiscrepancyInvoiceId },
      include: { flags: true, anomalyTypes: true, validationChecks: true }
    });

    expect(updated?.status).toBe("pending-review");
    expect(updated?.riskLevel).toBe("medium");

    const hasTaxAnomaly = updated?.anomalyTypes.some((a) => a.type === "Tax mismatch");
    const taxCheck = updated?.validationChecks.find((c) => c.label === "Tax compliance");

    expect(hasTaxAnomaly).toBe(true);
    expect(taxCheck?.status).toBe("warning");
  });

  it("blocks duplicate invoices when duplicate detection rule is enabled", async () => {
    const outcome = await runInvoiceValidation(tenantId, duplicateInvoiceId2);
    expect(outcome.status).toBe("blocked");

    const updated = await db.invoice.findUnique({
      where: { id: duplicateInvoiceId2 },
      include: { flags: true, anomalyTypes: true, validationChecks: true }
    });

    expect(updated?.status).toBe("blocked");
    expect(updated?.riskLevel).toBe("high");
    
    const hasDupAnomaly = updated?.anomalyTypes.some((a) => a.type === "Duplicate alert");
    const duplicateCheck = updated?.validationChecks.find((c) => c.label === "Duplicate detection");

    expect(hasDupAnomaly).toBe(true);
    expect(duplicateCheck?.status).toBe("fail");
  });

  it("bypasses duplicate check when duplicate detection rule is explicitly disabled", async () => {
    // Disable rule
    await db.ruleSetting.update({
      where: { tenantId_name: { tenantId, name: "Duplicate detection" } },
      data: { enabled: false }
    });

    // Re-run validation (should not trigger duplicate block now!)
    const outcome = await runInvoiceValidation(tenantId, duplicateInvoiceId2);
    expect(outcome.status).toBe("auto-approved");

    const updated = await db.invoice.findUnique({
      where: { id: duplicateInvoiceId2 },
      include: { validationChecks: true }
    });

    expect(updated?.status).toBe("auto-approved");
    
    // Duplicate check should not even be registered since it was disabled
    const duplicateCheck = updated?.validationChecks.find((c) => c.label === "Duplicate detection");
    expect(duplicateCheck).toBeUndefined();
  });
});
