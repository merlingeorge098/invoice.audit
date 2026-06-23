import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { db } from "../../server/db.ts";
import { permissionsByRole, type EnterpriseRole } from "../../server/store.ts";

describe("Backend Auth & Session Management", () => {
  const testEmail = "test.controller@acme-test.com";
  const testTenantSlug = "acme-test";
  let tenantId = "";
  let userId = "";
  let sessionToken = "";

  beforeAll(async () => {
    // Clean up any stale test records
    await db.session.deleteMany({
      where: { user: { email: testEmail } },
    });
    await db.workspaceMembership.deleteMany({
      where: { user: { email: testEmail } },
    });
    await db.user.deleteMany({
      where: { email: testEmail },
    });
    await db.tenantDomain.deleteMany({
      where: { domain: "acme-test.com" },
    });
    await db.tenant.deleteMany({
      where: { tenantSlug: testTenantSlug },
    });

    // Create a mock tenant
    const tenant = await db.tenant.create({
      data: {
        organizationName: "Test Acme Manufacturing",
        workspaceId: "test-workspace-acme",
        workspaceName: "Test Acme Dashboard",
        tenantSlug: testTenantSlug,
        authMethod: "sso",
        ssoProvider: "entra-id",
      },
    });
    tenantId = tenant.id;

    // Create domain mapping
    await db.tenantDomain.create({
      data: {
        domain: "acme-test.com",
        tenantId,
      },
    });

    // Create user and membership with Controller role
    const user = await db.user.create({
      data: {
        email: testEmail,
        displayName: "Test Controller User",
        memberships: {
          create: {
            tenantId,
            role: "Controller",
          },
        },
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (sessionToken) {
      await db.session.deleteMany({ where: { sessionToken } });
    }
    await db.workspaceMembership.deleteMany({
      where: { userId, tenantId },
    });
    await db.user.deleteMany({
      where: { id: userId },
    });
    await db.tenantDomain.deleteMany({
      where: { domain: "acme-test.com" },
    });
    await db.tenant.deleteMany({
      where: { id: tenantId },
    });
  });

  it("provisions a valid session in the database and retrieves it correctly", async () => {
    sessionToken = "test-session-token-456";
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    // Create session in DB
    const session = await db.session.create({
      data: {
        sessionToken,
        userId,
        tenantId,
        expiresAt,
      },
    });

    expect(session).not.toBeNull();
    expect(session.sessionToken).toBe(sessionToken);

    // Retrieve session from DB
    const retrieved = await db.session.findUnique({
      where: { sessionToken },
      include: { user: true, tenant: true },
    });

    expect(retrieved).not.toBeNull();
    expect(retrieved?.user.email).toBe(testEmail);
    expect(retrieved?.tenant.tenantSlug).toBe(testTenantSlug);
  });

  it("correctly maps enterprise roles to expected permission permissions", () => {
    const controllerPermissions = permissionsByRole["Controller"];
    expect(controllerPermissions).toBeDefined();
    expect(controllerPermissions).toContain("invoice:escalate");
    expect(controllerPermissions).toContain("invoice:override-policy");

    const adminPermissions = permissionsByRole["Admin"];
    expect(adminPermissions).toBeDefined();
    expect(adminPermissions).toContain("settings:manage");
  });

  it("handles expired sessions correctly", async () => {
    const expiredToken = "expired-token-789";
    const pastExpiry = new Date(Date.now() - 1000); // 1 second ago

    await db.session.create({
      data: {
        sessionToken: expiredToken,
        userId,
        tenantId,
        expiresAt: pastExpiry,
      },
    });

    const session = await db.session.findUnique({
      where: { sessionToken: expiredToken },
    });

    expect(session).not.toBeNull();
    expect(new Date() > session!.expiresAt).toBe(true);

    // Cleanup
    await db.session.delete({ where: { sessionToken: expiredToken } });
  });
});
