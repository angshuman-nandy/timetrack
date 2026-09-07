// Wrapped in try/catch: private browsing modes and some in-app browsers throw on
// localStorage access rather than just being empty.
const KEY = "timetrack_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Best-effort — if storage is blocked, the session just won't survive a reload.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
