import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db.ts";
import { applyEnterpriseInvoiceAction } from "../../server/enterprise.ts";

describe("Phase 5: Reviewer Actions and Queue State Transitions", () => {
  const testTenantSlug = "action-test-tenant";
  let tenantId = "";
  let testInvoiceId = "";

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
    await db.tenant.deleteMany({
      where: { tenantSlug: testTenantSlug },
    });

    // Create test tenant
    const tenant = await db.tenant.create({
      data: {
        organizationName: "Action Test Org",
        workspaceId: "workspace-action-test",
        workspaceName: "Action Test Workspace",
        tenantSlug: testTenantSlug,
        authMethod: "sso",
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testInvoiceId) {
      await db.invoiceAnomaly.deleteMany({ where: { invoiceId: testInvoiceId } });
      await db.validationCheck.deleteMany({ where: { invoiceId: testInvoiceId } });
      await db.invoiceFlag.deleteMany({ where: { invoiceId: testInvoiceId } });
      await db.invoice.deleteMany({ where: { id: testInvoiceId } });
    }
    await db.tenant.deleteMany({
      where: { id: tenantId },
    });
  });

  it("handles escalate action correctly by routing to controller queue and generating policy flags", async () => {
    // Create an active invoice to run action on
    const invoice = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-ACT-001",
        vendorName: "Action Vendor",
        vendorCode: "V-ACT",
        entity: "APAC Division",
        amount: 200000,
        invoiceDate: "15 May 2026",
        dueDate: "30 May 2026",
        poNumber: "PO-ACT-01",
        grnNumber: "N/A",
        status: "pending-review",
        riskLevel: "medium",
        riskScore: 50,
        confidence: 90,
        duplicateLikelihood: 10,
        sourceChannel: "API Intake",
        assignedReviewer: "Megha Bhat",
        agingHours: 5,
        summary: "Test Action Invoice",
        workflowRecommendation: "",
      },
    });
    testInvoiceId = invoice.id;

    // Apply Escalate
    const res = await applyEnterpriseInvoiceAction(tenantId, testInvoiceId, "escalate", "Megha Bhat", "Escalating for final capex confirmation.");
    expect(res?.success).toBe(true);

    const updated = await db.invoice.findUnique({
      where: { id: testInvoiceId },
      include: { anomalyTypes: true, validationChecks: true, flags: true }
    });

    expect(updated?.status).toBe("escalated");
    expect(updated?.assignedReviewer).toBe("Controller Queue");
    expect(updated?.riskLevel).toBe("high");
    expect(updated?.riskScore).toBeGreaterThanOrEqual(80);

    const hasEscAnomaly = updated?.anomalyTypes.some((a) => a.type === "Controller escalation");
    const hasEscFlag = updated?.flags.some((f) => f.title === "Controller escalation");
    const policyCheck = updated?.validationChecks.find((c) => c.label === "Approval policy");

    expect(hasEscAnomaly).toBe(true);
    expect(hasEscFlag).toBe(true);
    expect(policyCheck?.status).toBe("fail");
  });

  it("handles request-evidence action correctly", async () => {
    // Apply Request Evidence
    const res = await applyEnterpriseInvoiceAction(tenantId, testInvoiceId, "request-evidence", "Priya Raman", "Missing supply log sheet.");
    expect(res?.success).toBe(true);

    const updated = await db.invoice.findUnique({
      where: { id: testInvoiceId },
      include: { anomalyTypes: true, validationChecks: true, flags: true }
    });

    expect(updated?.status).toBe("needs-evidence");
    expect(updated?.assignedReviewer).toBe("Priya Raman");
    expect(updated?.riskLevel).toBe("medium");

    const hasEvidenceAnomaly = updated?.anomalyTypes.some((a) => a.type === "Missing evidence");
    const hasPendingFlag = updated?.flags.some((f) => f.title === "Supporting evidence pending");
    const evidenceCheck = updated?.validationChecks.find((c) => c.label === "Evidence pack");

    expect(hasEvidenceAnomaly).toBe(true);
    expect(hasPendingFlag).toBe(true);
    expect(evidenceCheck?.status).toBe("warning");
  });

  it("handles approve action correctly by clearing warnings and flags, and setting checks to pass", async () => {
    // Apply Approve
    const res = await applyEnterpriseInvoiceAction(tenantId, testInvoiceId, "approve", "Priya Raman", "Manual override complete.");
    expect(res?.success).toBe(true);

    const updated = await db.invoice.findUnique({
      where: { id: testInvoiceId },
      include: { anomalyTypes: true, validationChecks: true, flags: true }
    });

    expect(updated?.status).toBe("auto-approved");
    expect(updated?.assignedReviewer).toBe("Priya Raman");
    expect(updated?.riskLevel).toBe("low");
    expect(updated?.riskScore).toBe(10);
    expect(updated?.flags.length).toBe(0); // Cleared
    expect(updated?.anomalyTypes.length).toBe(1);
    expect(updated?.anomalyTypes[0].type).toBe("Reviewer approved");
    expect(updated?.validationChecks.every((c) => c.status === "pass")).toBe(true);
  });
});
