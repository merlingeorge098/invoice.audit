import { apiRequest } from "@/lib/api";

export type IdentityProviderType = "entra-id" | "okta" | "google-workspace";
export type EnterpriseRole =
  | "AP Reviewer"
  | "Finance Manager"
  | "Controller"
  | "Auditor"
  | "Admin";

export interface OrganizationDiscovery {
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
  tenantSlug: string;
  primaryDomain: string;
  matchedDomain: string;
}

export interface IdentityProviderSummary {
  providerId: IdentityProviderType;
  providerLabel: string;
  protocol: "OIDC" | "SAML";
  loginLabel: string;
  mfa: "idp-enforced";
}

export interface DiscoveryResponse {
  email: string;
  organization: OrganizationDiscovery;
  provider: IdentityProviderSummary;
}

export interface AuthStartResponse extends DiscoveryResponse {
  authRequestId: string;
  callbackUrl: string;
  expiresAt: string;
}

export interface EnterpriseSession {
  sessionToken: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  workspaceId: string;
  workspaceName: string;
  tenantSlug: string;
  email: string;
  displayName: string;
  role: EnterpriseRole;
  permissions: string[];
  provider: IdentityProviderSummary;
  assurance: {
    mfa: "idp-enforced";
    sessionType: "mock-enterprise";
  };
  createdAt: string;
  expiresAt: string;
  targetPath: string;
}

const STORAGE_KEY = "invoice-audit.enterprise-session";

function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readStoredEnterpriseSession() {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  const rawValue = storage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as EnterpriseSession;

    if (isExpired(parsed.expiresAt)) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function persistEnterpriseSession(session: EnterpriseSession | null) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  if (!session) {
    storage.removeItem(STORAGE_KEY);
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function discoverOrganization(email: string) {
  return apiRequest<DiscoveryResponse>("/auth/discover", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function startEnterpriseAuth(email: string) {
  return apiRequest<AuthStartResponse>("/auth/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function completeEnterpriseAuth(authRequestId: string) {
  return apiRequest<EnterpriseSession>("/auth/callback", {
    method: "POST",
    body: JSON.stringify({ authRequestId }),
  });
}

export function getEnterpriseSession(sessionToken: string) {
  return apiRequest<EnterpriseSession>("/auth/session", {
    headers: {
      "X-Session-Token": sessionToken,
    },
  });
}

export function signOutEnterpriseSession(sessionToken: string) {
  return apiRequest<{ success: boolean }>("/auth/logout", {
    method: "POST",
    headers: {
      "X-Session-Token": sessionToken,
    },
    body: JSON.stringify({}),
  });
}
