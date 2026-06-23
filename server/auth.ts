import { Router } from "express";
import crypto from "crypto";
import { db } from "./db.ts";
import { permissionsByRole, type EnterpriseRole } from "./store.ts";
import { sendOtpEmail, checkOtpRateLimit } from "./services/email.ts";

export const authRouter = Router();

function getSafeOrganizationSummary(tenant: any, domain: string) {
  return {
    organizationId: tenant.id,
    organizationName: tenant.organizationName,
    workspaceId: tenant.workspaceId,
    workspaceName: tenant.workspaceName,
    tenantSlug: tenant.tenantSlug,
    primaryDomain: domain,
    matchedDomain: domain,
  };
}

function getProviderSummary(tenant: any) {
  const isOtp = tenant.authMethod === "otp";
  return {
    providerId: isOtp ? "email-otp" : tenant.ssoProvider || "entra-id",
    providerLabel: isOtp ? "Email One-Time Password" : (tenant.ssoProvider || "Enterprise SSO"),
    protocol: isOtp ? "OTP" : "SAML",
    loginLabel: isOtp ? "Send secure login code" : "Continue with Enterprise Login",
    mfa: isOtp ? "app-enforced" : "idp-enforced",
  };
}

authRouter.post("/discover", async (request, response) => {
  const email = request.body?.email;

  if (typeof email !== "string" || !email.trim() || !email.includes("@")) {
    response.status(400).json({
      error: "invalid_request",
      message: "A work email is required for organization discovery.",
    });
    return;
  }

  const domain = email.split("@")[1].toLowerCase();
  const tenantDomain = await db.tenantDomain.findUnique({
    where: { domain },
    include: { tenant: true },
  });

  if (!tenantDomain) {
    response.status(404).json({
      error: "organization_not_found",
      message: "No organization is registered for that email domain. Ask your administrator to set up your workspace, or sign up at /signup.",
    });
    return;
  }

  response.json({
    email,
    organization: getSafeOrganizationSummary(tenantDomain.tenant, domain),
    provider: getProviderSummary(tenantDomain.tenant),
  });
});

authRouter.post("/start", async (request, response) => {
  const email = request.body?.email;

  if (typeof email !== "string" || !email.trim() || !email.includes("@")) {
    response.status(400).json({ error: "invalid_request" });
    return;
  }

  const domain = email.split("@")[1].toLowerCase();

  // Primary lookup: by registered domain
  let tenantDomain = await db.tenantDomain.findUnique({
    where: { domain },
    include: { tenant: true },
  });

  // Fallback: find the user by exact email, then get their first active membership's tenant
  if (!tenantDomain) {
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberships: {
          where: { isActive: true },
          include: { tenant: { include: { domains: true } } },
          take: 1,
        },
      },
    });

    if (user && user.memberships.length > 0) {
      const tenant = user.memberships[0].tenant;
      const firstDomain = tenant.domains[0];
      if (firstDomain) {
        tenantDomain = { ...firstDomain, tenant } as any;
      }
    }
  }

  if (!tenantDomain) {
    response.status(404).json({
      error: "organization_not_found",
      message: "No workspace found for this email. Check your email or create a workspace first.",
    });
    return;
  }

  const authRequestId = crypto.randomUUID();
  const isOtp = tenantDomain.tenant.authMethod === "otp";
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  if (isOtp) {
    if (!checkOtpRateLimit(email)) {
      response.status(429).json({
        error: "too_many_requests",
        message: "Too many OTP requests. Please wait 10 minutes before requesting another code.",
      });
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Always log OTP to server console in dev — before attempting email send
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[AUTH:DEV] ────────────────────────────────`);
      console.log(`[AUTH:DEV] OTP login code for ${email}: ${otp}`);
      console.log(`[AUTH:DEV] ────────────────────────────────\n`);
    }

    await db.verificationToken.create({
      data: {
        id: authRequestId,
        email: email,
        token: otp,
        expiresAt,
      },
    });

    try {
      await sendOtpEmail(email, otp);
    } catch (err) {
      // In dev: email failure is non-fatal — OTP is visible in the server console
      if (process.env.NODE_ENV !== "production") {
        console.log(`[AUTH:DEV] Email send skipped (RESEND_API_KEY not set). Use the code above.`);
      } else {
        await db.verificationToken.delete({ where: { id: authRequestId } });
        response.status(503).json({
          error: "email_unavailable",
          message: "Could not send login code. Please check your email address or try again.",
        });
        return;
      }
    }
  } else {
    // For SSO demo, we just store the request ID as the token to fulfill the callback
    await db.verificationToken.create({
      data: {
        id: authRequestId,
        email: email,
        token: authRequestId, 
        expiresAt,
      },
    });
  }

  response.json({
    authRequestId,
    callbackUrl: isOtp ? null : `/auth/callback?requestId=${authRequestId}`,
    requireOtp: isOtp,
    expiresAt: expiresAt.toISOString(),
    email,
    organization: getSafeOrganizationSummary(tenantDomain.tenant, domain),
    provider: getProviderSummary(tenantDomain.tenant),
  });
});

async function provisionSession(email: string, tenant: any) {
  // Provision user if not exists
  let user = await db.user.findUnique({ where: { email } });
  let role = "AP Reviewer";

  if (!user) {
    const localPart = email.split("@")[0];
    const displayName = localPart.split(".").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
    if (localPart.includes("admin") || localPart.includes("controller")) role = "Controller";
    else if (localPart.includes("manager")) role = "Finance Manager";
    else if (localPart.includes("auditor")) role = "Auditor";

    user = await db.user.create({
      data: {
        email,
        displayName,
        memberships: {
          create: {
            tenantId: tenant.id,
            role,
          }
        }
      }
    });
  } else {
    // Fetch membership
    const membership = await db.workspaceMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } }
    });
    if (membership) {
      role = membership.role;
    } else {
      await db.workspaceMembership.create({
        data: { userId: user.id, tenantId: tenant.id, role }
      });
    }
  }

  // Create DB Session
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

  await db.session.create({
    data: {
      sessionToken,
      userId: user.id,
      tenantId: tenant.id,
      expiresAt,
    }
  });

  return {
    sessionToken,
    userId: user.id,
    organizationId: tenant.id,
    organizationName: tenant.organizationName,
    workspaceId: tenant.workspaceId,
    workspaceName: tenant.workspaceName,
    tenantSlug: tenant.tenantSlug,
    email: user.email,
    displayName: user.displayName,
    role,
    permissions: permissionsByRole[role as EnterpriseRole] || [],
    provider: getProviderSummary(tenant),
    assurance: {
      mfa: tenant.authMethod === "sso" ? "idp-enforced" : "app-enforced",
      sessionType: "real-enterprise",
    },
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    targetPath: `/app/${tenant.tenantSlug}/dashboard`,
  };
}

authRouter.post("/verify-otp", async (request, response) => {
  const { authRequestId, otp } = request.body || {};

  if (!authRequestId || !otp) {
    response.status(400).json({ error: "invalid_request" });
    return;
  }

  const tokenRecord = await db.verificationToken.findFirst({
    where: { id: authRequestId, token: otp },
  });

  if (!tokenRecord || new Date() > tokenRecord.expiresAt) {
    response.status(400).json({ error: "invalid_otp", message: "Invalid or expired OTP." });
    return;
  }

  await db.verificationToken.delete({ where: { id: tokenRecord.id } });

  const domain = tokenRecord.email.split("@")[1];
  let tenant: any = null;

  const tenantDomain = await db.tenantDomain.findUnique({ where: { domain }, include: { tenant: true } });
  if (tenantDomain) {
    tenant = tenantDomain.tenant;
  } else {
    // Fallback: look up user by email → get tenant via membership
    const user = await db.user.findUnique({
      where: { email: tokenRecord.email },
      include: {
        memberships: {
          where: { isActive: true },
          include: { tenant: true },
          take: 1,
        },
      },
    });
    if (user && user.memberships.length > 0) {
      tenant = user.memberships[0].tenant;
    }
  }

  if (!tenant) {
    response.status(400).json({ error: "tenant_not_found", message: "No workspace found for this account." });
    return;
  }

  const sessionData = await provisionSession(tokenRecord.email, tenant);
  response.json(sessionData);
});

authRouter.post("/callback", async (request, response) => {
  const authRequestId = request.body?.authRequestId;

  if (!authRequestId) {
    response.status(400).json({ error: "invalid_request" });
    return;
  }

  const tokenRecord = await db.verificationToken.findFirst({
    where: { id: authRequestId, token: authRequestId },
  });

  if (!tokenRecord || new Date() > tokenRecord.expiresAt) {
    response.status(400).json({ error: "invalid_callback", message: "Expired or invalid request." });
    return;
  }

  await db.verificationToken.delete({ where: { id: tokenRecord.id } });

  const domain = tokenRecord.email.split("@")[1];
  let cbTenant: any = null;
  const cbTenantDomain = await db.tenantDomain.findUnique({ where: { domain }, include: { tenant: true } });
  if (cbTenantDomain) {
    cbTenant = cbTenantDomain.tenant;
  } else {
    const u = await db.user.findUnique({
      where: { email: tokenRecord.email },
      include: { memberships: { where: { isActive: true }, include: { tenant: true }, take: 1 } },
    });
    if (u && u.memberships.length > 0) cbTenant = u.memberships[0].tenant;
  }

  if (!cbTenant) {
    response.status(400).json({ error: "tenant_not_found" });
    return;
  }

  const sessionData = await provisionSession(tokenRecord.email, cbTenant);
  response.json(sessionData);
});

authRouter.get("/session", async (request, response) => {
  const sessionTokenHeader = request.header("X-Session-Token");
  const cookieToken: string = (request as any).cookies?.ia_session ?? "";
  const sessionToken = typeof sessionTokenHeader === "string" ? sessionTokenHeader : ((request.query.sessionToken as string) || cookieToken);

  if (!sessionToken) {
    response.status(400).json({ error: "invalid_request" });
    return;
  }

  let session: any;
  let membership: any;

  try {
    session = await db.session.findUnique({
      where: { sessionToken },
      include: { user: true, tenant: true },
    });

    if (!session || new Date() > session.expiresAt) {
      response.status(404).json({ error: "session_not_found" });
      return;
    }

    membership = await db.workspaceMembership.findUnique({
      where: { userId_tenantId: { userId: session.userId, tenantId: session.tenantId } },
    });
  } catch (err) {
    console.error("[AUTH] session lookup error:", err);
    response.status(500).json({ error: "internal_error", message: "Session lookup failed." });
    return;
  }

  const role = membership?.role ?? "AP Reviewer";

  response.json({
    sessionToken: session.sessionToken,
    userId: session.userId,
    organizationId: session.tenantId,
    organizationName: session.tenant.organizationName,
    workspaceId: session.tenant.workspaceId,
    workspaceName: session.tenant.workspaceName,
    tenantSlug: session.tenant.tenantSlug,
    email: session.user.email,
    displayName: session.user.displayName,
    role,
    permissions: permissionsByRole[role as EnterpriseRole] || [],
    provider: getProviderSummary(session.tenant),
    assurance: {
      mfa: session.tenant.authMethod === "sso" ? "idp-enforced" : "app-enforced",
      sessionType: "real-enterprise",
    },
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    targetPath: `/app/${session.tenant.tenantSlug}/dashboard`,
  });
});

authRouter.post("/logout", async (request, response) => {
  const sessionToken = request.header("X-Session-Token");
  if (sessionToken) {
    await db.session.deleteMany({ where: { sessionToken } });
  }
  response.json({ success: true });
});
