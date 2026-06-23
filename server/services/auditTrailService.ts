import crypto from "crypto";

export class AuditTrailService {
  /**
   * Log an audit event with cryptographic signature chaining.
   * @param tx - Prisma transaction client or standard client instance
   * @param invoiceId - Target invoice identifier
   * @param actor - Person or system executing the action
   * @param action - Action name (e.g. Ingestion, Approval, Escalation)
   * @param detail - Description details of the event
   */
  static async logEvent(
    tx: any,
    invoiceId: string,
    actor: string,
    action: string,
    detail: string
  ) {
    const timestamp = new Date().toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      hour12: false,
      timeZone: "Asia/Kolkata",
    });

    // 1. Fetch the previous AuditEvent for this invoice to get its signature
    const previousEvent = await tx.auditEvent.findFirst({
      where: { invoiceId },
      orderBy: { createdAt: "desc" },
    });

    const previousSignature = previousEvent?.signature || "0".repeat(64);

    // 2. Gather inputs and calculate the SHA-256 hash representation of this audit event state
    const stateString = JSON.stringify({
      invoiceId,
      actor,
      action,
      detail,
      timestamp,
      previousSignature,
    });

    const signature = crypto.createHash("sha256").update(stateString).digest("hex");

    // 3. Create the event record in the database
    return await tx.auditEvent.create({
      data: {
        invoiceId,
        timestamp,
        actor,
        action,
        detail,
        signature,
      },
    });
  }
}
