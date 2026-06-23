import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Seed plan limits
  const plans = [
    {
      planSlug: "free",
      displayName: "Free",
      maxInvoicesPerMonth: 50,
      maxSeats: 3,
      hasGoogleSso: false,
      hasGstReconciliation: false,
      hasAuditExport: false,
      hasApiAccess: false,
      hasErpConnectors: false,
      hasPrioritySupport: false,
    },
    {
      planSlug: "pro",
      displayName: "Pro",
      maxInvoicesPerMonth: 500,
      maxSeats: 10,
      hasGoogleSso: true,
      hasGstReconciliation: true,
      hasAuditExport: true,
      hasApiAccess: false,
      hasErpConnectors: false,
      hasPrioritySupport: false,
    },
    {
      planSlug: "enterprise",
      displayName: "Enterprise",
      maxInvoicesPerMonth: -1,
      maxSeats: -1,
      hasGoogleSso: true,
      hasGstReconciliation: true,
      hasAuditExport: true,
      hasApiAccess: true,
      hasErpConnectors: true,
      hasPrioritySupport: true,
    },
  ];

  for (const plan of plans) {
    await db.planLimit.upsert({
      where: { planSlug: plan.planSlug },
      update: plan,
      create: plan,
    });
  }

  console.log("Seeded plan limits:", plans.map((p) => p.planSlug).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
