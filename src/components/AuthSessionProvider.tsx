import { useEffect, useState, type ReactNode } from "react";
import {
  persistEnterpriseSession,
  readStoredEnterpriseSession,
  type EnterpriseSession,
} from "@/lib/auth";
import { AuthSessionContext } from "@/lib/auth-session-context";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<EnterpriseSession | null>(() =>
    readStoredEnterpriseSession(),
  );

  useEffect(() => {
    persistEnterpriseSession(session);
  }, [session]);

  return (
    <AuthSessionContext.Provider
      value={{
        session,
        setSession: setSessionState,
        clearSession: () => setSessionState(null),
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}
