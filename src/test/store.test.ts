import { describe, expect, it } from "vitest";
import { platformStore } from "../../server/store.ts";

describe("platformStore invoice actions", () => {
  it("removes an approved invoice from active exception and reviewer queues", () => {
    const invoiceId = "INV-90880";
    const beforeExceptions = platformStore.getExceptions("All exceptions").invoices.some((invoice) => invoice.id === invoiceId);
    const beforeDashboard = platformStore.getDashboard().reviewerQueue.some((invoice) => invoice.id === invoiceId);

    expect(beforeExceptions).toBe(true);
    expect(beforeDashboard).toBe(true);

    const result = platformStore.applyInvoiceAction(invoiceId, "approve", "Finance Manager");

    expect(result).not.toBeNull();
    expect(result?.invoice.status).toBe("auto-approved");
    expect(result?.invoice.flags).toHaveLength(0);
    expect(result?.invoice.workflowRecommendation).toContain("payment batch");
    expect(result?.invoice.validationChecks.every((check) => check.status === "pass")).toBe(true);

    const afterExceptions = platformStore.getExceptions("All exceptions").invoices.some((invoice) => invoice.id === invoiceId);
    const afterDashboard = platformStore.getDashboard().reviewerQueue.some((invoice) => invoice.id === invoiceId);

    expect(afterExceptions).toBe(false);
    expect(afterDashboard).toBe(false);
  });

  it("discovers an enterprise organization from a supported work email", () => {
    const result = platformStore.discoverOrganization("finance.manager@northwind.com");

    expect(result).not.toBeNull();
    expect(result?.organization.organizationName).toBe("Northwind Trading");
    expect(result?.organization.tenantSlug).toBe("northwind");
    expect(result?.provider.providerId).toBe("okta");
  });

  it("creates and resolves a mock enterprise session from an auth request", () => {
    const authStart = platformStore.startEnterpriseAuth("controller@acme.com");

    expect(authStart).not.toBeNull();
    expect(authStart?.provider.providerId).toBe("entra-id");

    const session = platformStore.completeEnterpriseAuth(authStart!.authRequestId);

    expect(session).not.toBeNull();
    expect(session?.tenantSlug).toBe("acme");
    expect(session?.role).toBe("Controller");
    expect(session?.permissions).toContain("invoice:override-policy");
    expect(session?.targetPath).toBe("/app/acme/dashboard");

    const resolvedSession = platformStore.getEnterpriseSession(session!.sessionToken);

    expect(resolvedSession?.sessionToken).toBe(session?.sessionToken);
  });
});
