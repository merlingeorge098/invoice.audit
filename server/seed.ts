import { db } from "./db.ts";

async function main() {
  console.log("Seeding database with Mock Enterprise Tenants...");

  const tenants = [
    {
      id: "org-acme",
      organizationName: "Acme Manufacturing",
      workspaceId: "workspace-acme-primary",
      workspaceName: "Acme Finance Controls",
      tenantSlug: "acme",
      domain: "acme.com",
      authMethod: "sso",
      ssoProvider: "entra-id",
    },
    {
      id: "org-northwind",
      organizationName: "Northwind Trading",
      workspaceId: "workspace-northwind-primary",
      workspaceName: "Northwind AP Assurance",
      tenantSlug: "northwind",
      domain: "northwind.com",
      authMethod: "sso",
      ssoProvider: "okta",
    },
    {
      id: "org-globex",
      organizationName: "Globex Corporation",
      workspaceId: "workspace-globex-primary",
      workspaceName: "Globex Audit Operations",
      tenantSlug: "globex",
      domain: "globex.com",
      authMethod: "sso",
      ssoProvider: "google-workspace",
    },
    {
      id: "org-startup",
      organizationName: "Startup Inc",
      workspaceId: "workspace-startup-primary",
      workspaceName: "Startup Finance",
      tenantSlug: "startup",
      domain: "startup.com",
      authMethod: "otp",
      ssoProvider: null,
    },
  ];

  for (const t of tenants) {
    const tenant = await db.tenant.upsert({
      where: { id: t.id },
      update: {},
      create: {
        id: t.id,
        organizationName: t.organizationName,
        workspaceId: t.workspaceId,
        workspaceName: t.workspaceName,
        tenantSlug: t.tenantSlug,
        authMethod: t.authMethod,
        ssoProvider: t.ssoProvider,
      },
    });

    await db.tenantDomain.upsert({
      where: { domain: t.domain },
      update: {},
      create: {
        domain: t.domain,
        tenantId: tenant.id,
      },
    });
  }

  console.log("Database successfully seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
