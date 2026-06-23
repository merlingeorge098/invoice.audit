import { db } from "./db";
import { invoiceRecords } from "../src/data/platformData";

async function main() {
  console.log("Seeding invoices to all tenants...");

  const tenants = await db.tenant.findMany();

  if (tenants.length === 0) {
    console.log("No tenants found! Please run 'npm run db:seed' first to create tenants.");
    process.exit(1);
  }

  for (const tenant of tenants) {
    console.log(`Seeding invoices for tenant: ${tenant.tenantSlug} (${tenant.id})`);

    // Clean up existing invoices for this tenant to ensure idempotency
    await db.invoice.deleteMany({
      where: { tenantId: tenant.id },
    });

    for (const record of invoiceRecords) {
      await db.invoice.create({
        data: {
          tenantId: tenant.id,
          invoiceNumber: record.invoiceNumber,
          vendorName: record.vendorName,
          vendorCode: record.vendorCode,
          entity: record.entity,
          amount: record.amount,
          invoiceDate: record.invoiceDate,
          dueDate: record.dueDate,
          poNumber: record.poNumber,
          grnNumber: record.grnNumber,
          status: record.status,
          riskLevel: record.riskLevel,
          riskScore: record.riskScore,
          confidence: record.confidence,
          duplicateLikelihood: record.duplicateLikelihood,
          sourceChannel: record.sourceChannel,
          assignedReviewer: record.assignedReviewer,
          agingHours: record.agingHours,
          summary: record.summary,
          workflowRecommendation: record.workflowRecommendation,

          anomalyTypes: {
            create: record.anomalyTypes.map((type) => ({ type })),
          },
          validationChecks: {
            create: record.validationChecks.map((check) => ({
              label: check.label,
              status: check.status,
              detail: check.detail,
            })),
          },
          flags: {
            create: record.flags.map((flag) => ({
              title: flag.title,
              severity: flag.severity,
              detail: flag.detail,
            })),
          },
          structuredFields: {
            create: record.structuredFields.map((field) => ({
              label: field.label,
              value: field.value,
              confidence: field.confidence,
              source: field.source,
            })),
          },
          lineItems: {
            create: record.lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              status: item.status,
            })),
          },
          fieldComparisons: {
            create: record.fieldComparisons.map((comp) => ({
              field: comp.field,
              submitted: comp.submitted,
              extracted: comp.extracted,
              suggestion: comp.suggestion,
              reason: comp.reason,
            })),
          },
          auditTrail: {
            create: record.auditTrail.map((audit) => ({
              timestamp: audit.timestamp,
              actor: audit.actor,
              action: audit.action,
              detail: audit.detail,
            })),
          },
        },
      });
    }
  }

  console.log("Successfully seeded invoices into the database!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
