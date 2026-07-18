"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  redirectToLogin,
  shouldRedirectForUnauthorizedApi,
} from "@/lib/auth-navigation";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
  kakaoLinked: boolean;
  googleLinked: boolean;
  mustChangePassword: boolean;
  canManageAccountWithoutPassword: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshSequence = useRef(0);

  useEffect(() => {
    const originalFetch = window.fetch;
    const interceptedFetch: typeof window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (
        shouldRedirectForUnauthorizedApi(
          response.status,
          requestUrl,
          window.location.href,
        )
      ) {
        redirectToLogin("session_expired");
      }
      return response;
    };

    window.fetch = interceptedFetch;
    return () => {
      if (window.fetch === interceptedFetch) window.fetch = originalFetch;
    };
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (sequence !== refreshSequence.current) return;
      if (!res.ok) {
        setUser(null);
        if (res.status === 401) redirectToLogin("session_expired");
        return;
      }
      const data = await res.json();
      if (data && data.id) {
        setUser(data);
      } else {
        setUser(null);
        redirectToLogin("session_expired");
      }
    } catch {
      if (sequence === refreshSequence.current) setUser(null);
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.replace("/login");
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
