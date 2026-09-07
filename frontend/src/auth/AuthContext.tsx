import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { registerUnauthorizedHandler } from "../api/client";
import { clearToken, getToken, setToken } from "./tokenStorage";

interface AuthState {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => getToken() !== null);

  useEffect(() => {
    registerUnauthorizedHandler(() => setIsAuthenticated(false));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated,
      login: async (username: string, password: string) => {
        const { token } = await api.post<{ token: string }>("/auth/login", { username, password });
        setToken(token);
        setIsAuthenticated(true);
      },
      logout: () => {
        clearToken();
        setIsAuthenticated(false);
      },
    }),
    [isAuthenticated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
