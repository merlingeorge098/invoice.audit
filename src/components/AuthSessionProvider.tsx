import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  persistEnterpriseSession,
  readStoredEnterpriseSession,
  getEnterpriseSession,
  type EnterpriseSession,
} from "@/lib/auth";
import { getSessionFromServer } from "@/lib/api";
import { AuthSessionContext } from "@/lib/auth-session-context";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<EnterpriseSession | null>(() =>
    readStoredEnterpriseSession(),
  );
  const [bootstrapped, setBootstrapped] = useState(false);

  // If no localStorage session, try to bootstrap from the ia_session cookie (Google OAuth)
  useEffect(() => {
    if (session) {
      setBootstrapped(true);
      return;
    }
    getSessionFromServer()
      .then((s) => {
        if (s?.sessionToken) {
          setSessionState(s);
        }
      })
      .catch(() => {
        // No cookie session — user needs to log in
      })
      .finally(() => {
        setBootstrapped(true);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodically refresh the stored session from the server
  useQuery({
    queryKey: ["auth", "session", session?.sessionToken],
    queryFn: async () => {
      if (!session) return null;
      try {
        const validSession = await getEnterpriseSession(session.sessionToken);
        setSessionState(validSession);
        return validSession;
      } catch {
        setSessionState(null);
        return null;
      }
    },
    enabled: Boolean(session?.sessionToken) && bootstrapped,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  useEffect(() => {
    persistEnterpriseSession(session);
  }, [session]);

  // Auto-expire: clear session exactly when expiresAt is reached so RequireSession redirects immediately
  useEffect(() => {
    if (!session?.expiresAt) return;
    const msUntilExpiry = new Date(session.expiresAt).getTime() - Date.now();
    if (msUntilExpiry <= 0) {
      setSessionState(null);
      return;
    }
    const timer = setTimeout(() => setSessionState(null), msUntilExpiry);
    return () => clearTimeout(timer);
  }, [session?.expiresAt]);

  // Show nothing until we know if there is a session (avoids flash-redirect to /auth/start)
  if (!bootstrapped) return null;

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
