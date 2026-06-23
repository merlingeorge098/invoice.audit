import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { ingestionRouter } from "../../server/routes/ingestion.ts";
import { db } from "../../server/db.ts";
import crypto from "crypto";

// Mock GPT-4o OCR extraction
vi.mock("../../server/services/ocr.ts", () => ({
  extractInvoiceDataWithGPT4o: vi.fn().mockResolvedValue({
    vendorName: "Test Ingestion Vendor",
    invoiceNumber: "INV-INGEST-123",
    amount: 2500,
    invoiceDate: "2026-05-12",
    dueDate: "2026-05-28",
    poNumber: "PO-INGEST-123",
    lineItems: [
      { description: "Rigging kit", quantity: 2, unitPrice: 1250, total: 2500 }
    ]
  })
}));

// Mock validation engine
vi.mock("../../server/services/validationEngine.ts", () => ({
  runInvoiceValidation: vi.fn().mockResolvedValue(true)
}));

describe("Phase 3: Ingestion Pipeline Upload and Deduplication", () => {
  const testTenantSlug = "ingest-test-tenant";
  let tenantId = "";
  const mockFileBuffer = Buffer.from("fake-pdf-content");
  const fileHash = crypto.createHash("sha256").update(mockFileBuffer).digest("hex");

  beforeAll(async () => {
    // Cleanup
    await db.invoiceAnomaly.deleteMany({
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
        organizationName: "Ingestion Test Org",
        workspaceId: "workspace-ingest-test",
        workspaceName: "Ingestion Test Workspace",
        tenantSlug: testTenantSlug,
        authMethod: "sso",
      },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await db.invoice.deleteMany({
      where: { tenantId },
    });
    await db.tenant.deleteMany({
      where: { id: tenantId },
    });
  });

  it("blocks duplicate uploads by verifying the fileHash database unique constraint", async () => {
    // Find the router upload callback handler
    const uploadRoute = ingestionRouter.stack.find(
      (layer) => layer.route?.path === "/upload"
    );
    expect(uploadRoute).toBeDefined();
    
    // The main upload callback is the second handler in the stack
    const mainHandler = uploadRoute.route.stack[1].handle;

    // First request - successful upload
    const mockReq1 = {
      file: {
        buffer: mockFileBuffer,
        mimetype: "application/pdf",
        originalname: "invoice.pdf",
        size: mockFileBuffer.length,
      },
      header: (name: string) => {
        if (name === "X-Tenant-Slug") return testTenantSlug;
        if (name === "X-Session-Token") return "session-token-abc";
        return undefined;
      },
    };

    let statusVal = 200;
    let responseJson: any = null;

    const mockRes1 = {
      status: (code: number) => {
        statusVal = code;
        return mockRes1;
      },
      json: (data: any) => {
        responseJson = data;
        return mockRes1;
      },
    };

    // Execute first upload handler
    await mainHandler(mockReq1 as any, mockRes1 as any, (() => {}) as any);

    expect(statusVal).toBe(200);
    expect(responseJson.success).toBe(true);
    expect(responseJson.invoiceId).toBeDefined();

    // Verify hash was stored in the database
    const createdInvoice = await db.invoice.findUnique({
      where: { id: responseJson.invoiceId },
    });
    expect(createdInvoice).not.toBeNull();
    expect((createdInvoice as any).fileHash).toBe(fileHash);

    // Second request - duplicate upload check
    let duplicateStatus = 200;
    let duplicateJson: any = null;

    const mockRes2 = {
      status: (code: number) => {
        duplicateStatus = code;
        return mockRes2;
      },
      json: (data: any) => {
        duplicateJson = data;
        return mockRes2;
      },
    };

    // Execute duplicate handler call
    await mainHandler(mockReq1 as any, mockRes2 as any, (() => {}) as any);

    expect(duplicateStatus).toBe(400);
    expect(duplicateJson.error).toBe("duplicate_upload");
    expect(duplicateJson.message).toContain("already been uploaded");
  });
});
