import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { db } from "../../server/db.ts";
import { EncryptionService } from "../../server/services/encryptionService.ts";
import {
  updateEnterpriseRule,
  updateEnterpriseNotification,
  updateTenantErpSettings
} from "../../server/enterprise.ts";
import { erpRouter } from "../../server/routes/erp.ts";

describe("Phase 9: Settings Configuration and Credentials Encryption", () => {
  const testTenantSlug = "settings-test-tenant";
  let tenantId = "";
  let testInvoiceId = "";

  beforeAll(async () => {
    // Cleanup existing records
    await db.auditEvent.deleteMany({
      where: { invoice: { tenant: { tenantSlug: testTenantSlug } } }
    });
    await db.invoice.deleteMany({
      where: { tenant: { tenantSlug: testTenantSlug } }
    });
    await db.ruleSetting.deleteMany({
      where: { tenant: { tenantSlug: testTenantSlug } }
    });
    await db.notificationSetting.deleteMany({
      where: { tenant: { tenantSlug: testTenantSlug } }
    });
    await db.tenant.deleteMany({
      where: { tenantSlug: testTenantSlug }
    });

    // Create test tenant
    const tenant = await db.tenant.create({
      data: {
        organizationName: "Settings Test Org",
        workspaceId: "workspace-settings-test",
        workspaceName: "Settings Test Workspace",
        tenantSlug: testTenantSlug,
        authMethod: "sso",
      },
    });
    tenantId = tenant.id;

    // Create dummy rules and notifications
    await db.ruleSetting.create({
      data: {
        tenantId,
        name: "Duplicate detection",
        description: "Verify duplicates.",
        enabled: true,
        owner: "Controls"
      }
    });

    await db.notificationSetting.create({
      data: {
        tenantId,
        name: "Slack alerts",
        enabled: true
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testInvoiceId) {
      await db.auditEvent.deleteMany({ where: { invoiceId: testInvoiceId } });
      await db.invoice.deleteMany({ where: { id: testInvoiceId } });
    }
    await db.ruleSetting.deleteMany({ where: { tenantId } });
    await db.notificationSetting.deleteMany({ where: { tenantId } });
    await db.tenant.deleteMany({ where: { id: tenantId } });
  });

  it("proves that EncryptionService encrypts and decrypts correctly using GCM", () => {
    const rawSecret = "super-secret-key-12345";
    const encrypted = EncryptionService.encrypt(rawSecret);
    
    expect(encrypted).toContain(":");
    expect(encrypted.split(":").length).toBe(3); // iv:authTag:ciphertext
    expect(encrypted).not.toContain(rawSecret);

    const decrypted = EncryptionService.decrypt(encrypted);
    expect(decrypted).toBe(rawSecret);
  });

  it("encrypts the ERP API Key in the database and logs a signed audit event", async () => {
    const rawKey = "ERP-API-TOKEN-XYZ";
    const res = await updateTenantErpSettings(tenantId, "https://api.erp.com/webhook", rawKey);
    
    expect(res.erpWebhookUrl).toBe("https://api.erp.com/webhook");
    expect(res.erpApiKey).toBe("***"); // Key should be masked in response

    // Verify database value is encrypted
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId }
    });

    expect(tenant?.erpApiKey).not.toBeNull();
    expect(tenant?.erpApiKey).not.toBe(rawKey);
    expect(EncryptionService.decrypt(tenant?.erpApiKey || "")).toBe(rawKey);

    // Verify settings audit log was created on the placeholder invoice
    const systemInvoice = await db.invoice.findFirst({
      where: { tenantId, invoiceNumber: "SYSTEM-SETTINGS" }
    });
    expect(systemInvoice).not.toBeNull();
    testInvoiceId = systemInvoice!.id;

    const auditTrail = await db.auditEvent.findMany({
      where: { invoiceId: testInvoiceId },
      orderBy: { createdAt: "desc" } as any
    });

    const erpAudit = auditTrail.find(a => a.action === "Update ERP Settings");
    expect(erpAudit).toBeDefined();
    expect((erpAudit as any)?.signature).not.toBeNull();
  });

  it("logs signed audit events when rules or notification configurations change", async () => {
    // Toggle rule
    await updateEnterpriseRule(tenantId, "Duplicate detection", false);

    // Toggle notification
    await updateEnterpriseNotification(tenantId, "Slack alerts", false);

    const auditTrail = await db.auditEvent.findMany({
      where: { invoiceId: testInvoiceId },
      orderBy: { createdAt: "desc" } as any
    });

    const ruleAudit = auditTrail.find(a => a.action === "Update Rule" && a.detail.includes("Duplicate detection"));
    const notificationAudit = auditTrail.find(a => a.action === "Update Notification" && a.detail.includes("Slack alerts"));

    expect(ruleAudit).toBeDefined();
    expect((ruleAudit as any)?.signature).not.toBeNull();
    expect(notificationAudit).toBeDefined();
    expect((notificationAudit as any)?.signature).not.toBeNull();
  });

  it("decrypts the ERP API Key correctly when triggering a webhook sync request", async () => {
    // Create an approved invoice to sync
    const syncInvoice = await db.invoice.create({
      data: {
        tenantId,
        invoiceNumber: "INV-SYNC-777",
        vendorName: "Sync Vendor",
        vendorCode: "V-SYNC",
        entity: "APAC Division",
        amount: 3000,
        invoiceDate: "15 May 2026",
        dueDate: "30 May 2026",
        poNumber: "N/A",
        grnNumber: "N/A",
        status: "approved", // Must be approved to sync
        riskLevel: "low",
        riskScore: 10,
        confidence: 95,
        duplicateLikelihood: 10,
        sourceChannel: "API Intake",
        assignedReviewer: "Unassigned",
        agingHours: 0,
        summary: "Sync check",
        workflowRecommendation: ""
      }
    });

    // Mock global fetch API
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    });
    vi.stubGlobal("fetch", mockFetch);

    // Locate the handler for the POST /sync/:invoiceId route
    const syncRoute = erpRouter.stack.find(
      (layer) => layer.route?.path === "/sync/:invoiceId"
    );
    expect(syncRoute).toBeDefined();
    const handler = syncRoute.route.stack[0].handle;

    const mockReq = {
      params: { invoiceId: syncInvoice.id },
      header: (name: string) => {
        if (name === "X-Tenant-Slug") return testTenantSlug;
        return undefined;
      }
    };

    let responseJson: any = null;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: (data: any) => {
        responseJson = data;
      }
    };

    // Execute Handler
    await handler(mockReq as any, mockRes as any, (() => {}) as any);

    expect(responseJson?.success).toBe(true);

    // Verify fetch call got the decrypted API key
    expect(mockFetch).toHaveBeenCalled();
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];

    expect(calledUrl).toBe("https://api.erp.com/webhook");
    expect(calledInit.headers.Authorization).toBe("Bearer ERP-API-TOKEN-XYZ");

    // Clean up sync invoice
    await db.auditEvent.deleteMany({ where: { invoiceId: syncInvoice.id } });
    await db.invoice.delete({ where: { id: syncInvoice.id } });
    vi.unstubAllGlobals();
  });
});
