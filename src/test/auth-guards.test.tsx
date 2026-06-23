import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireSession } from "../components/RequireSession";
import { AuthSessionContext } from "../lib/auth-session-context";
import React from "react";

const mockSession = {
  sessionToken: "session-123",
  userId: "user-123",
  organizationId: "org-acme",
  organizationName: "Acme Manufacturing",
  workspaceId: "workspace-acme-primary",
  workspaceName: "Acme Finance Controls",
  tenantSlug: "acme",
  email: "ap@acme.com",
  displayName: "AP Executive",
  role: "AP Reviewer" as const,
  permissions: ["invoice:read"],
  provider: {
    providerId: "entra-id" as const,
    providerLabel: "Entra ID",
    protocol: "SAML" as const,
    loginLabel: "Login",
    mfa: "idp-enforced" as const,
  },
  assurance: {
    mfa: "idp-enforced" as const,
    sessionType: "mock-enterprise" as const,
  },
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  targetPath: "/app/acme/dashboard",
};

describe("RequireSession Guard", () => {
  it("redirects unauthenticated user to auth start page", () => {
    render(
      <AuthSessionContext.Provider value={{ session: null, setSession: vi.fn(), clearSession: vi.fn() }}>
        <MemoryRouter initialEntries={["/app/acme/dashboard"]}>
          <Routes>
            <Route path="/app/:tenantSlug/dashboard" element={<RequireSession><div>Protected Content</div></RequireSession>} />
            <Route path="/auth/start" element={<div>Auth Start Page</div>} />
          </Routes>
        </MemoryRouter>
      </AuthSessionContext.Provider>
    );

    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(screen.getByText("Auth Start Page")).toBeDefined();
  });

  it("allows access for matching tenant slug", () => {
    render(
      <AuthSessionContext.Provider value={{ session: mockSession, setSession: vi.fn(), clearSession: vi.fn() }}>
        <MemoryRouter initialEntries={["/app/acme/dashboard"]}>
          <Routes>
            <Route path="/app/:tenantSlug/dashboard" element={<RequireSession><div>Protected Content</div></RequireSession>} />
          </Routes>
        </MemoryRouter>
      </AuthSessionContext.Provider>
    );

    expect(screen.getByText("Protected Content")).toBeDefined();
  });

  it("redirects to unauthorized page on mismatching tenant slug", () => {
    render(
      <AuthSessionContext.Provider value={{ session: mockSession, setSession: vi.fn(), clearSession: vi.fn() }}>
        <MemoryRouter initialEntries={["/app/northwind/dashboard"]}>
          <Routes>
            <Route path="/app/:tenantSlug/dashboard" element={<RequireSession><div>Protected Content</div></RequireSession>} />
            <Route path="/unauthorized" element={<div>Access Denied Page</div>} />
          </Routes>
        </MemoryRouter>
      </AuthSessionContext.Provider>
    );

    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(screen.getByText("Access Denied Page")).toBeDefined();
  });
});
