import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { db } from "../../server/db.ts";

vi.mock("../../server/services/ocr.ts", () => ({
  extractInvoiceDataWithGPT4o: vi.fn()
}));

describe("Phase 10: Production Hardening, Security, and Observability", () => {
  beforeAll(async () => {
    // Set a custom port for the test server instance to avoid EADDRINUSE conflicts
    process.env.PORT = "8789";
    // Import the Express app listener
    await import("../../server/index.ts");
    // Wait briefly for Express startup
    await new Promise((resolve) => setTimeout(resolve, 600));
  });

  afterAll(() => {
    // Restore port env if needed
    delete process.env.PORT;
  });

  it("sets secure HTTP headers using Helmet", async () => {
    const response = await fetch("http://localhost:8789/api/health");
    
    // Helmet headers verification
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-xss-protection")).toBe("0");
  });

  it("enforces rate limits on authentication requests", async () => {
    let lastStatus = 200;
    
    // Auth rate limit is 5 attempts per minute. The 6th request must trigger a 429 Too Many Requests.
    for (let i = 0; i < 7; i++) {
      const response = await fetch("http://localhost:8789/api/auth/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@domain.com" })
      });
      lastStatus = response.status;
      if (response.status === 429) {
        const data = await response.json();
        expect(data.error).toBe("too_many_requests");
        break;
      }
    }
    
    expect(lastStatus).toBe(429);
  });

  it("gracefully catches internal exceptions and logs them with structured requestId", async () => {
    // Spy on session/membership to authenticate bypass, and force invoice fetch to throw a database crash
    const sessionSpy = vi.spyOn(db.session, "findUnique").mockResolvedValue({
      id: "session-id-test",
      sessionToken: "auth-test-token",
      userId: "user-id-test",
      tenantId: "tenant-id-test",
      expiresAt: new Date(Date.now() + 60000),
      user: { id: "user-id-test", displayName: "Production Test Reviewer" },
      tenant: { id: "tenant-id-test", tenantSlug: "prod-test-slug" }
    } as any);

    const membershipSpy = vi.spyOn(db.workspaceMembership, "findUnique").mockResolvedValue({
      role: "Finance Manager"
    } as any);

    const invoiceSpy = vi.spyOn(db.invoice, "findMany").mockRejectedValue(new Error("Simulated DB Crash Exception"));

    try {
      const response = await fetch("http://localhost:8789/api/invoices", {
        headers: {
          "X-Workspace-Mode": "enterprise",
          "X-Session-Token": "auth-test-token",
          "X-Tenant-Slug": "prod-test-slug"
        }
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("internal_server_error");
      expect(data.requestId).toBeDefined();
      
    } finally {
      sessionSpy.mockRestore();
      membershipSpy.mockRestore();
      invoiceSpy.mockRestore();
    }
  });
});
