import { createContext, useContext } from "react";
import type { EnterpriseSession } from "@/lib/auth";

export interface AuthSessionContextValue {
  session: EnterpriseSession | null;
  setSession: (session: EnterpriseSession | null) => void;
  clearSession: () => void;
}

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function useAuthSession() {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error("useAuthSession must be used inside AuthSessionProvider.");
  }

  return context;
}
