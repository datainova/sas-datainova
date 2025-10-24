import type { AuthSession } from "../types/auth";

const STORAGE_KEY = "datainova-connect.auth";

export function saveSession(session: AuthSession) {
  try {
    const payload = JSON.stringify({
      ...session,
      storedAt: new Date().toISOString()
    });
    window.localStorage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    console.warn("Failed to persist auth session", error);
  }
}

export function loadSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to read auth session", error);
    return null;
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear auth session", error);
  }
}
