import { clearToken, getToken } from "../auth/tokenStorage";

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

/** Downloads the export file and saves it via a synthetic link click — this is a real
 * deployed page (not a sandboxed artifact preview), so a normal blob download works. */
export async function downloadExport(start: string, end: string, format: "xlsx" | "csv"): Promise<void> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`/api/export?start=${start}&end=${end}&format=${format}`, { headers });
  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!response.ok) {
    throw new ApiError(response.status, "Couldn't build the file. Try again in a moment.");
  }

  const blob = await response.blob();
  const filename = `timesheet-${start}-to-${end}.${format}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
