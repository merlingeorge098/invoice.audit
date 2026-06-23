import { PrismaClient } from "@prisma/client";
import { rulesCatalog, notificationSettings } from "../src/data/platformData.ts";

const db = new PrismaClient();

async function main() {
  const tenants = await db.tenant.findMany();

  for (const tenant of tenants) {
    console.log(`Seeding settings for tenant ${tenant.tenantSlug}...`);
    
    // Seed Rules
    for (const rule of rulesCatalog) {
      await db.ruleSetting.upsert({
        where: {
          tenantId_name: {
            tenantId: tenant.id,
            name: rule.name,
          }
        },
        update: {},
        create: {
          tenantId: tenant.id,
          name: rule.name,
          description: rule.description,
          enabled: rule.enabled,
          owner: rule.owner,
        }
      });
    }

    // Seed Notifications
    for (const notif of notificationSettings) {
      await db.notificationSetting.upsert({
        where: {
          tenantId_name: {
            tenantId: tenant.id,
            name: notif.name,
          }
        },
        update: {},
        create: {
          tenantId: tenant.id,
          name: notif.name,
          enabled: notif.enabled,
        }
      });
    }
  }

  console.log("Settings seeding completed!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
