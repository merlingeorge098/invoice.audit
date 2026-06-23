import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db.ts";
import {
  getEnterpriseReports,
  getEnterpriseIngestion,
  getEnterpriseProcessing,
} from "../../server/enterprise.ts";
import { generateInvoicesReportExcel } from "../../server/services/excel.ts";

describe("Phase 2: Tenant Scoping and Reports Aggregation", () => {
  const testTenantSlug = "reports-test-tenant";
  let tenantId = "";
  let invoiceId1 = "";
  let invoiceId2 = "";

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
        organizationName: "Reports Test Org",
        workspaceId: "workspace-reports-test",
        workspaceName: "Reports Test Workspace",
        tenantSlug: testTenantSlug,
        authMethod: "sso",
      },
    });
    tenantId = tenant.id;

    // Create 2 test invoices with varying risk levels, anomalies, and entities
    const inv1 = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-R001",
        vendorName: "Alpha Vendor",
        vendorCode: "V-ALPHA",
        entity: "APAC Division",
        amount: 500000,
        invoiceDate: "10 May 2026",
        dueDate: "20 May 2026",
        poNumber: "PO-ALPHA-01",
        grnNumber: "GRN-ALPHA-01",
        status: "pending-review",
        riskLevel: "medium",
        riskScore: 45,
        confidence: 90,
        duplicateLikelihood: 10,
        sourceChannel: "Manual Upload",
        assignedReviewer: "Unassigned",
        agingHours: 2,
        summary: "Test Invoice 1",
        workflowRecommendation: "Review",
        anomalyTypes: {
          create: [{ type: "Tax mismatch" }],
        },
      },
    });
    invoiceId1 = inv1.id;

    const inv2 = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-R002",
        vendorName: "Beta Vendor",
        vendorCode: "V-BETA",
        entity: "EMEA Division",
        amount: 1500000,
        invoiceDate: "11 May 2026",
        dueDate: "25 May 2026",
        poNumber: "PO-BETA-02",
        grnNumber: "GRN-BETA-02",
        status: "processing", // Active processing job
        riskLevel: "high",
        riskScore: 85,
        confidence: 95,
        duplicateLikelihood: 80,
        sourceChannel: "ERP Sync",
        assignedReviewer: "Unassigned",
        agingHours: 5,
        summary: "Test Invoice 2",
        workflowRecommendation: "Escalate",
        anomalyTypes: {
          create: [{ type: "Duplicate alert" }, { type: "Bank change" }],
        },
      },
    });
    invoiceId2 = inv2.id;
  });

  afterAll(async () => {
    // Clean up
    await db.invoiceAnomaly.deleteMany({
      where: { invoiceId: { in: [invoiceId1, invoiceId2] } },
    });
    await db.invoice.deleteMany({
      where: { id: { in: [invoiceId1, invoiceId2] } },
    });
    await db.tenant.deleteMany({
      where: { id: tenantId },
    });
  });

  it("calculates reports exceptions mix from database flags/anomalies", async () => {
    const reports = await getEnterpriseReports(tenantId);

    expect(reports).toBeDefined();
    expect(reports.exceptionMix).toBeDefined();

    // Check that we extracted anomaly type tallies correctly
    const taxCount = reports.exceptionMix.find((mix) => mix.name === "Tax")?.value;
    const duplicateCount = reports.exceptionMix.find((mix) => mix.name === "Duplicate")?.value;

    expect(taxCount).toBeGreaterThanOrEqual(1);
    expect(duplicateCount).toBeGreaterThanOrEqual(1);
  });

  it("compiles vendor risk index and leaderboard correctly", async () => {
    const reports = await getEnterpriseReports(tenantId);

    expect(reports.vendorRiskLeaderboard).toBeDefined();
    expect(reports.vendorRiskLeaderboard.length).toBeGreaterThan(0);

    const firstVendor = reports.vendorRiskLeaderboard[0];
    expect(firstVendor.vendor).toBe("Beta Vendor");
    expect(firstVendor.riskIndex).toBe(85);
  });

  it("resolves compliance details grouped by invoice corporate entity", async () => {
    const reports = await getEnterpriseReports(tenantId);

    expect(reports.complianceSummary).toBeDefined();
    const apacSummary = reports.complianceSummary.find((s) => s.entity === "APAC Division");
    const emeaSummary = reports.complianceSummary.find((s) => s.entity === "EMEA Division");

    expect(apacSummary).toBeDefined();
    expect(emeaSummary).toBeDefined();
  });

  it("returns active ingestion configurations", async () => {
    const ingestion = await getEnterpriseIngestion(tenantId);
    expect(ingestion).toBeDefined();
    expect(ingestion.channels).toBeInstanceOf(Array);
    expect(ingestion.channels.length).toBeGreaterThan(0);
  });

  it("fetches active processing pipeline count correctly", async () => {
    const processing = await getEnterpriseProcessing(tenantId);
    expect(processing).toBeDefined();
    expect(processing.batchId).toContain("BATCH-");
    expect(processing.eta).toBe("Under 1 minute");
  });

  it("generates a formatted Excel spreadsheet for reports export", async () => {
    const invoices = await db.invoice.findMany({
      where: { tenantId },
      include: { anomalyTypes: true }
    });

    const buffer = await generateInvoicesReportExcel(invoices);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
