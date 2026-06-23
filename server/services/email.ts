import { Resend } from "resend";

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error("Email service not configured. Set RESEND_API_KEY.");
  return new Resend(process.env.RESEND_API_KEY);
}

// Per-email OTP rate limiting: max 3 requests per 10 minutes
const otpRateMap = new Map<string, { count: number; resetAt: number }>();

export function checkOtpRateLimit(email: string): boolean {
  const now = Date.now();
  const entry = otpRateMap.get(email);

  if (!entry || now > entry.resetAt) {
    otpRateMap.set(email, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }

  if (entry.count >= 3) {
    return false;
  }

  entry.count++;
  return true;
}

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "InvoiceAudit Pro <noreply@invoiceaudit.pro>";

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `${otp} is your InvoiceAudit login code`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="background:#f8fafc;margin:0;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#0f172a;padding:24px 32px;">
      <p style="color:#e2e8f0;font-size:13px;margin:0;letter-spacing:1px;text-transform:uppercase;">InvoiceAudit Pro</p>
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 8px;">Your login code</h1>
      <p style="color:#64748b;margin:0 0 28px;font-size:14px;">Use this code to sign in. It expires in <strong>10 minutes</strong>.</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:20px 24px;text-align:center;letter-spacing:10px;font-size:36px;font-weight:700;color:#0f172a;font-family:monospace;">${otp}</div>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">If you didn't request this code, you can safely ignore this email. Someone may have typed your address by mistake.</p>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendInviteEmail(
  email: string,
  inviterName: string,
  orgName: string,
  role: string,
  inviteUrl: string,
): Promise<void> {
  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `${inviterName} invited you to join ${orgName} on InvoiceAudit Pro`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="background:#f8fafc;margin:0;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#0f172a;padding:24px 32px;">
      <p style="color:#e2e8f0;font-size:13px;margin:0;letter-spacing:1px;text-transform:uppercase;">InvoiceAudit Pro</p>
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 8px;">You're invited to ${orgName}</h1>
      <p style="color:#64748b;margin:0 0 24px;font-size:14px;">${inviterName} has invited you to join <strong>${orgName}</strong> as a <strong>${role}</strong>.</p>
      <a href="${inviteUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Accept Invitation</a>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">This invitation expires in 72 hours. If you didn't expect this, you can safely ignore it.</p>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendEvidenceRequestEmail(
  vendorEmail: string,
  invoiceNumber: string,
  details: string,
  uploadUrl?: string,
): Promise<void> {
  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: vendorEmail,
    subject: `Action Required: Supporting documents needed for invoice ${invoiceNumber}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="background:#f8fafc;margin:0;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#0f172a;padding:24px 32px;">
      <p style="color:#e2e8f0;font-size:13px;margin:0;letter-spacing:1px;text-transform:uppercase;">InvoiceAudit Pro</p>
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 8px;">Supporting documents required</h1>
      <p style="color:#64748b;margin:0 0 16px;font-size:14px;">Our audit system has flagged a query on invoice <strong>${invoiceNumber}</strong>.</p>
      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="color:#713f12;font-size:14px;margin:0;"><strong>Details:</strong> ${details}</p>
      </div>
      ${uploadUrl ? `<a href="${uploadUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Upload Documents</a>` : "<p style=\"color:#64748b;font-size:14px;\">Please reply to this email with the required documents.</p>"}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">This is an automated notification. Please do not share this link with others.</p>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendNotificationEmail(
  email: string,
  displayName: string,
  title: string,
  body: string,
  actionUrl?: string,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: title,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="background:#f8fafc;margin:0;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="background:#0f172a;padding:24px 32px;">
      <p style="color:#e2e8f0;font-size:13px;margin:0;letter-spacing:1px;text-transform:uppercase;">InvoiceAudit Pro</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#64748b;font-size:14px;margin:0 0 8px;">Hi ${displayName},</p>
      <h1 style="font-size:18px;color:#0f172a;margin:0 0 12px;">${title}</h1>
      <p style="color:#475569;font-size:14px;margin:0 0 24px;">${body}</p>
      ${actionUrl ? `<a href="${actionUrl}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">View in InvoiceAudit</a>` : ""}
    </div>
  </div>
</body>
</html>`,
  });
}
