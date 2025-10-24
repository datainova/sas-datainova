import { useCallback, useEffect, useState } from "react";
import { clearSession, loadSession, saveSession } from "../lib/storage";
import type { AuthSession } from "../types/auth";

export function useAuthSession() {
  const [session, setSessionState] = useState<AuthSession | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return loadSession();
  });

  const setSession = useCallback((value: AuthSession | null) => {
    if (value) {
      saveSession(value);
    } else {
      clearSession();
    }
    setSessionState(value);
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === "datainova-connect.auth") {
        setSessionState(loadSession());
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return {
    session,
    isAuthenticated: Boolean(session),
    setSession,
    clearSession: () => setSession(null)
  };
}
