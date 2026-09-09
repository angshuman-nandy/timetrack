import type { ConsultantHeader } from "../api/types";

// Same try/catch-wrapped idiom as ../auth/tokenStorage — private browsing and some
// in-app browsers throw on localStorage access rather than just being empty.
const KEY = "timetrack_consultant_header";

/** The last header values the user actually submitted — never the period dates,
 * those come fresh from the selected export range every time. Read once to seed
 * the overlay's prefill, ahead of the server defaults (a correction the user made
 * once, e.g. their full legal name, should stick). */
export function getLastConsultantHeader(): Partial<ConsultantHeader> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<ConsultantHeader>) : null;
  } catch {
    return null;
  }
}

export function setLastConsultantHeader(header: ConsultantHeader): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(header));
  } catch {
    // Best-effort — if storage is blocked, the overlay just falls back to server
    // defaults next time.
  }
}
