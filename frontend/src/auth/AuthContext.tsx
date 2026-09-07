import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { registerUnauthorizedHandler } from "../api/client";
import { clearToken, getToken, setToken } from "./tokenStorage";

interface AuthState {
  isAuthenticated: boolean;
  /** The logged-in username, once fetched — null while that's still in flight (or
   * logged out). Used for the Today screen's greeting. */
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => getToken() !== null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setIsAuthenticated(false);
      setUsername(null);
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api
      .get<{ username: string }>("/auth/me")
      .then((me) => {
        if (!cancelled) setUsername(me.username);
      })
      .catch(() => {
        // Best-effort — the greeting just stays off; nothing else depends on this.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated,
      username,
      login: async (username: string, password: string) => {
        const { token } = await api.post<{ token: string }>("/auth/login", { username, password });
        setToken(token);
        setIsAuthenticated(true);
      },
      logout: () => {
        clearToken();
        setIsAuthenticated(false);
        setUsername(null);
      },
    }),
    [isAuthenticated, username],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
