import { clearToken, getToken } from "../auth/tokenStorage";
import type { ConsultantHeader } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Set by AuthProvider on mount so the client can react to a 401 from anywhere
// (a token that expired mid-session, not just the login screen) without a direct
// dependency on the router.
let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection.");
  }

  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new ApiError(401, "Session expired. Please sign in again.");
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new ApiError(response.status, detail?.detail || `Request failed (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Pulls the filename the server chose out of Content-Disposition, falling back if
 * it's ever missing — the server is same-origin here, so the header is readable
 * with no Access-Control-Expose-Headers needed. Reading it instead of reconstructing
 * `${start}-to-${end}.${format}` client-side is what lets the extension differ from
 * the `format` query value (the Consultant format is always .xlsx). */
function filenameFromResponse(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? fallback;
}

/** Fetches a file download, translating the shared 401/error handling the same way
 * `request()` does for JSON calls, then saves it via a synthetic link click — this
 * is a real deployed page (not a sandboxed artifact preview), so a normal blob
 * download works. */
async function fetchAndSave(path: string, fallbackFilename: string): Promise<void> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api${path}`, { headers });
  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, "Couldn't build the file. Try again in a moment.");
  }

  const blob = await response.blob();
  const filename = filenameFromResponse(response, fallbackFilename);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadExport(start: string, end: string, format: "xlsx" | "csv"): Promise<void> {
  const params = new URLSearchParams({ start, end, format });
  await fetchAndSave(`/export?${params}`, `timesheet-${start}-to-${end}.${format}`);
}

/** Downloads the Consultant Timesheet format — a fixed ten-column layout matching
 * the client's own template, with an editable header block instead of a field
 * picker (see ConsultantHeaderSheet). */
export async function downloadConsultantExport(
  start: string,
  end: string,
  header: ConsultantHeader,
): Promise<void> {
  const params = new URLSearchParams({ start, end, format: "consultant", ...header });
  await fetchAndSave(`/export?${params}`, `consultant-timesheet-${start}-to-${end}.xlsx`);
}
