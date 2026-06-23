import { db } from "../db.ts";
import { AuditTrailService } from "./auditTrailService.ts";
import { notifyEscalated } from "./notifications.ts";

// Notify relevant workspace members about a validation outcome.
// Skips notification if the invoice came from the sample seeder (sourceChannel === "Sample Data").
async function notifyValidationOutcome(
  tenantId: string,
  invoiceId: string,
  invoiceNumber: string,
  status: string,
  sourceChannel: string,
): Promise<void> {
  if (sourceChannel === "Sample Data") return;

  try {
    if (status === "escalated") {
      // Find a Controller or Admin to escalate to
      const member = await db.workspaceMembership.findFirst({
        where: { tenantId, isActive: true, role: { in: ["Controller", "Admin"] } },
        include: { user: true },
      });
      if (member) {
        await notifyEscalated(invoiceId, member.userId, tenantId, invoiceNumber);
      }
      return;
    }

    if (status === "blocked" || status === "pending-review" || status === "needs-evidence") {
      const member = await db.workspaceMembership.findFirst({
        where: { tenantId, isActive: true, role: { in: ["Finance Manager", "Controller", "Admin"] } },
        include: { user: true },
      });
      if (!member) return;

      await db.notificationEvent.create({
        data: {
          userId: member.userId,
          tenantId,
          type: status === "blocked" ? "escalated" : "assigned",
          title: status === "blocked"
            ? `Invoice blocked: ${invoiceNumber}`
            : status === "needs-evidence"
            ? `Evidence required: ${invoiceNumber}`
            : `Invoice flagged for review: ${invoiceNumber}`,
          body: status === "blocked"
            ? `Invoice ${invoiceNumber} was blocked by automated controls and requires your attention.`
            : status === "needs-evidence"
            ? `Invoice ${invoiceNumber} needs supporting documentation before it can proceed.`
            : `Invoice ${invoiceNumber} has one or more validation warnings and has been placed in your review queue.`,
          invoiceId,
        },
      });
    }
  } catch (err) {
    console.error(`[ValidationEngine] Failed to send notification for ${invoiceNumber}:`, err);
  }
}

export async function runInvoiceValidation(tenantId: string, invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true, anomalyTypes: true, validationChecks: true, flags: true },
  });

  if (!invoice) throw new Error("Invoice not found for validation");

  // Reset checks for idempotent re-validation
  await db.invoiceAnomaly.deleteMany({ where: { invoiceId } });
  await db.validationCheck.deleteMany({ where: { invoiceId } });
  await db.invoiceFlag.deleteMany({ where: { invoiceId } });

  const rules = await db.ruleSetting.findMany({ where: { tenantId } });
  const isEnabled = (name: string) => {
    const rule = rules.find((r) => r.name === name);
    return rule ? rule.enabled : true;
  };
  const ruleConfig = (name: string): any => {
    const rule = rules.find((r) => r.name === name);
    return (rule?.config as any) ?? {};
  };

  let status = "auto-approved";
  let riskLevel = "low";
  let riskScore = 10;
  let summary = "Passed all automated validation rules.";
  let recommendation = "Release in next payment batch.";

  const checks: { label: string; status: string; detail: string }[] = [];
  const flags: { title: string; severity: string; detail: string }[] = [];
  const anomalies: { type: string }[] = [];

  // ── 1. Vendor Master Check ──────────────────────────────────────────────────
  if (isEnabled("Vendor master check")) {
    const vendor = await db.vendorMaster.findFirst({
      where: { tenantId, vendorName: { contains: invoice.vendorName, mode: "insensitive" }, isActive: true },
    });

    if (!vendor) {
      status = "blocked";
      riskLevel = "high";
      riskScore = Math.max(riskScore, 85);
      summary = `Vendor "${invoice.vendorName}" is not in the approved vendor registry.`;
      recommendation = "Block payment and escalate to procurement to register the vendor.";
      checks.push({ label: "Vendor master", status: "fail", detail: `"${invoice.vendorName}" is not registered as an approved vendor.` });
      flags.push({ title: "Unregistered vendor", severity: "high", detail: "Payment blocked until vendor is onboarded in the master registry." });
      anomalies.push({ type: "Unregistered vendor" });
    } else {
      checks.push({ label: "Vendor master", status: "pass", detail: `Vendor "${vendor.vendorName}" is approved and active in the registry.` });
    }
  }

  // ── 2. Duplicate Detection ─────────────────────────────────────────────────
  if (isEnabled("Duplicate detection")) {
    // Exact match
    const exactDuplicate = await db.invoice.findFirst({
      where: { tenantId, invoiceNumber: invoice.invoiceNumber, vendorName: invoice.vendorName, id: { not: invoiceId } },
    });

    if (exactDuplicate) {
      status = "blocked";
      riskLevel = "high";
      riskScore = Math.max(riskScore, 95);
      summary = `Exact duplicate: invoice ${invoice.invoiceNumber} from ${invoice.vendorName} already exists.`;
      recommendation = "Block and escalate to controls lead for duplicate validation.";
      checks.push({ label: "Duplicate detection", status: "fail", detail: `Exact match found: Invoice ID ${exactDuplicate.id}.` });
      flags.push({ title: "Probable duplicate", severity: "high", detail: "Exact invoice number and vendor match found in the database." });
      anomalies.push({ type: "Duplicate alert" });
    } else {
      // Fuzzy: same vendor + same amount ± 2% within 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const near = await db.invoice.findFirst({
        where: {
          tenantId,
          id: { not: invoiceId },
          vendorName: { contains: invoice.vendorName.substring(0, 6), mode: "insensitive" },
          amount: { gte: invoice.amount * 0.98, lte: invoice.amount * 1.02 },
          createdAt: { gte: thirtyDaysAgo },
        },
      });

      if (near) {
        if (status === "auto-approved") { status = "pending-review"; riskLevel = "medium"; riskScore = Math.max(riskScore, 55); }
        checks.push({ label: "Duplicate detection", status: "warning", detail: `Similar invoice found (ID: ${near.id}) — same vendor, similar amount, within 30 days.` });
        flags.push({ title: "Possible duplicate", severity: "medium", detail: "A near-identical invoice exists. Verify before releasing payment." });
        anomalies.push({ type: "Possible duplicate" });
      } else {
        checks.push({ label: "Duplicate detection", status: "pass", detail: "No duplicate records found in the last 30 days." });
      }
    }
  }

  // ── 3. PO Match ────────────────────────────────────────────────────────────
  if (isEnabled("PO match required")) {
    const threshold = ruleConfig("PO match required").minAmount ?? 50000;

    if (invoice.amount >= threshold) {
      if (!invoice.poNumber || invoice.poNumber === "N/A" || invoice.poNumber === "") {
        if (status === "auto-approved") { status = "pending-review"; riskLevel = "medium"; riskScore = Math.max(riskScore, 50); }
        checks.push({ label: "PO match", status: "warning", detail: `Invoice amount ₹${invoice.amount.toLocaleString("en-IN")} exceeds ₹${threshold.toLocaleString("en-IN")} threshold but no PO number provided.` });
        flags.push({ title: "No PO reference", severity: "medium", detail: "A valid Purchase Order is required for invoices above the configured threshold." });
        anomalies.push({ type: "Missing PO" });
      } else {
        const po = await db.purchaseOrder.findFirst({
          where: { tenantId, poNumber: invoice.poNumber },
        });
        if (!po) {
          if (status === "auto-approved") { status = "pending-review"; riskLevel = "medium"; riskScore = Math.max(riskScore, 60); }
          checks.push({ label: "PO match", status: "warning", detail: `PO ${invoice.poNumber} referenced but not found in the system.` });
          flags.push({ title: "PO not found", severity: "medium", detail: `Purchase Order ${invoice.poNumber} is not registered in the system.` });
          anomalies.push({ type: "PO not found" });
        } else {
          const tolerance = 0.05;
          const diff = Math.abs(po.totalAmount - invoice.amount) / po.totalAmount;
          if (diff > tolerance) {
            if (status === "auto-approved") { status = "pending-review"; riskLevel = "medium"; riskScore = Math.max(riskScore, 55); }
            checks.push({ label: "PO match", status: "warning", detail: `Invoice amount ₹${invoice.amount.toLocaleString("en-IN")} differs from PO amount ₹${po.totalAmount.toLocaleString("en-IN")} by ${(diff * 100).toFixed(1)}%.` });
            flags.push({ title: "PO amount mismatch", severity: "medium", detail: `Invoice amount is ${(diff * 100).toFixed(1)}% off from the PO value.` });
            anomalies.push({ type: "PO amount mismatch" });
          } else {
            checks.push({ label: "PO match", status: "pass", detail: `Matched to PO ${invoice.poNumber} within tolerance.` });
          }
        }
      }
    } else {
      checks.push({ label: "PO match", status: "pass", detail: `Amount below PO-required threshold (₹${threshold.toLocaleString("en-IN")}).` });
    }
  }

  // ── 4. Tax / Line Item Math ────────────────────────────────────────────────
  if (isEnabled("Tax compliance check") && invoice.lineItems.length > 0) {
    const lineTotal = invoice.lineItems.reduce((s, i) => s + i.total, 0);
    const diff = Math.abs(invoice.amount - lineTotal);
    if (diff > invoice.amount * 0.05) {
      if (status === "auto-approved") { status = "pending-review"; riskLevel = "medium"; riskScore = Math.max(riskScore, 60); }
      checks.push({ label: "Tax compliance", status: "warning", detail: `Header total ₹${invoice.amount.toLocaleString("en-IN")} vs. line items total ₹${lineTotal.toLocaleString("en-IN")} — difference of ₹${diff.toLocaleString("en-IN")}.` });
      flags.push({ title: "Tax/math variance", severity: "medium", detail: "Calculated line totals do not match the invoice header amount." });
      anomalies.push({ type: "Tax mismatch" });
    } else {
      checks.push({ label: "Tax compliance", status: "pass", detail: "Tax values and line item math are consistent with header total." });
    }
  }

  // ── 5. Approval Policy (amount threshold) ─────────────────────────────────
  if (isEnabled("Approval policy")) {
    const threshold = ruleConfig("Approval policy").escalateAbove ?? 1250000;
    if (invoice.amount > threshold) {
      if (status !== "blocked") { status = "escalated"; riskLevel = "high"; riskScore = Math.max(riskScore, 80); }
      summary = `High-value invoice (₹${invoice.amount.toLocaleString("en-IN")}) requires controller-level approval.`;
      recommendation = "Escalate to Controller for approval under the corporate authority matrix.";
      checks.push({ label: "Approval policy", status: "fail", detail: `Invoice amount exceeds auto-approval threshold of ₹${threshold.toLocaleString("en-IN")}.` });
      flags.push({ title: "Threshold escalation", severity: "high", detail: "Controller approval required for invoices above the configured threshold." });
      anomalies.push({ type: "Threshold approval" });
    } else {
      checks.push({ label: "Approval policy", status: "pass", detail: "Amount is within auto-approval threshold." });
    }
  }

  // ── 6. Evidence Required ──────────────────────────────────────────────────
  if (isEnabled("Evidence required")) {
    const threshold = ruleConfig("Evidence required").minAmount ?? 100000;
    const hasEvidence = await db.evidenceAttachment.count({ where: { invoiceId } });
    if (invoice.amount > threshold && hasEvidence === 0) {
      if (status === "auto-approved") { status = "pending-review"; riskLevel = "medium"; riskScore = Math.max(riskScore, 45); }
      checks.push({ label: "Evidence pack", status: "warning", detail: `No supporting documents attached. Required for invoices above ₹${threshold.toLocaleString("en-IN")}.` });
      flags.push({ title: "Evidence required", severity: "medium", detail: "Supporting documentation must be uploaded before payment can proceed." });
      anomalies.push({ type: "Missing evidence" });
    }
  }

  // Set final summary/recommendation for non-blocked statuses
  if (status === "auto-approved") {
    summary = "Passed all automated validation rules. Cleared for payment.";
    recommendation = "Release in next scheduled payment batch.";
  } else if (status === "pending-review") {
    summary = "One or more validation checks require manual review before payment.";
    recommendation = "Assign to a Finance Manager or Controller to resolve the flagged exceptions.";
  }

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      status,
      riskLevel,
      riskScore,
      summary,
      workflowRecommendation: recommendation,
      validationChecks: { create: checks },
      flags: { create: flags },
      anomalyTypes: { create: anomalies },
    },
  });

  await AuditTrailService.logEvent(db, invoiceId, "System", "Validation Complete", `Status resolved to ${status}. Risk score: ${riskScore}.`);

  // Fire notification (non-blocking — failure must not break the validation pipeline)
  setImmediate(() =>
    notifyValidationOutcome(tenantId, invoiceId, invoice.invoiceNumber, status, invoice.sourceChannel).catch(
      (err) => console.error("[ValidationEngine] Notification error:", err),
    ),
  );

  return { status, riskScore };
}
