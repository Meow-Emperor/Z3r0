import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isSystemUserRole } from "../api/contract";
import type { SystemUserRole } from "../api/types";
import { clearStoredAccessToken, getStoredAccessToken, storeAccessToken } from "./session";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (token: string) => void;
  signOut: () => void;
};

type AuthUser = {
  id: number;
  role: SystemUserRole;
  email: string;
  username: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredAccessToken());
  const user = useMemo(() => decodeUser(token), [token]);

  const signIn = useCallback((nextToken: string) => {
    storeAccessToken(nextToken);
    setToken(nextToken);
  }, []);

  const signOut = useCallback(() => {
    clearStoredAccessToken();
    setToken(null);
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => signOut();
    window.addEventListener("z3r0:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("z3r0:auth-expired", handleAuthExpired);
  }, [signOut]);

  useEffect(() => {
    if (token && !user) signOut();
  }, [signOut, token, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: user !== null,
      signIn,
      signOut,
    }),
    [signIn, signOut, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}

function decodeUser(token: string | null): AuthUser | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    if (
      typeof parsed.id === "number"
      && isSystemUserRole(parsed.role)
      && typeof parsed.email === "string"
      && typeof parsed.username === "string"
      && typeof parsed.exp === "number"
      && parsed.exp * 1000 > Date.now()
    ) {
      return {
        id: parsed.id,
        role: parsed.role,
        email: parsed.email,
        username: parsed.username,
      };
    }
  } catch {
    return null;
  }
  return null;
}
