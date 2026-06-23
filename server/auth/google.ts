import { Router } from "express";
import crypto from "crypto";
import { db } from "../db.ts";
import { permissionsByRole, type EnterpriseRole } from "../store.ts";

export const googleAuthRouter = Router();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function buildRedirectUri() {
  return `${process.env.APP_URL}/api/auth/google/callback`;
}

// Step 1 — redirect browser to Google consent screen
googleAuthRouter.get("/", (_req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "google_sso_not_configured", message: "Google SSO is not configured." });
    return;
  }

  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: buildRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  // Store state in a short-lived verification token so we can validate callback
  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

// Step 2 — Google redirects back with code + state
googleAuthRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`/auth/start?error=google_denied`);
    return;
  }

  const cookieState = (req.cookies as Record<string, string>)?.oauth_state;
  if (!state || !cookieState || state !== cookieState) {
    res.redirect(`/auth/start?error=state_mismatch`);
    return;
  }

  res.clearCookie("oauth_state");

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: buildRedirectUri(),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const tokens = await tokenRes.json() as { access_token: string; id_token: string };

    // Fetch user info
    const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoRes.ok) {
      throw new Error(`User info fetch failed: ${userInfoRes.status}`);
    }

    const userInfo = await userInfoRes.json() as {
      sub: string;
      email: string;
      name: string;
      picture: string;
      email_verified: boolean;
    };

    if (!userInfo.email_verified) {
      res.redirect(`/auth/start?error=email_not_verified`);
      return;
    }

    const domain = userInfo.email.split("@")[1].toLowerCase();
    const tenantDomain = await db.tenantDomain.findUnique({
      where: { domain },
      include: { tenant: true },
    });

    if (!tenantDomain) {
      // No org registered — prompt signup
      res.redirect(`/signup?email=${encodeURIComponent(userInfo.email)}&source=google`);
      return;
    }

    const tenant = tenantDomain.tenant;

    // Upsert user
    let user = await db.user.findFirst({
      where: { OR: [{ googleId: userInfo.sub }, { email: userInfo.email }] },
    });

    if (!user) {
      user = await db.user.create({
        data: {
          email: userInfo.email,
          displayName: userInfo.name,
          avatarUrl: userInfo.picture,
          googleId: userInfo.sub,
        },
      });
    } else {
      await db.user.update({
        where: { id: user.id },
        data: {
          displayName: userInfo.name,
          avatarUrl: userInfo.picture,
          googleId: user.googleId ?? userInfo.sub,
        },
      });
    }

    // Ensure workspace membership
    let membership = await db.workspaceMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    });

    if (!membership) {
      // Check if there is an accepted invite
      const invite = await db.inviteToken.findFirst({
        where: { tenantId: tenant.id, email: userInfo.email, acceptedAt: null },
        orderBy: { createdAt: "desc" },
      });

      if (!invite && tenant.inviteOnly) {
        res.redirect(`/auth/start?error=invite_required&domain=${domain}`);
        return;
      }

      const role = invite?.role ?? "AP Reviewer";
      membership = await db.workspaceMembership.create({
        data: { userId: user.id, tenantId: tenant.id, role },
      });

      if (invite) {
        await db.inviteToken.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });
      }
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await db.session.create({
      data: {
        sessionToken,
        userId: user.id,
        tenantId: tenant.id,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        expiresAt,
      },
    });

    // Set secure session cookie
    res.cookie("ia_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.redirect(`/app/${tenant.tenantSlug}/dashboard?session=${sessionToken}`);
  } catch (err) {
    console.error("[Google OAuth] callback error:", err);
    res.redirect(`/auth/start?error=google_failed`);
  }
});
