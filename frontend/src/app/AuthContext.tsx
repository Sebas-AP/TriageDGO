import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { AdminUser } from "../types";
import { services } from "../services";

interface AuthContextValue {
  user: AdminUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    services.auth
      .currentUser()
      .then((current) => active && setUser(current))
      .finally(() => active && setLoading(false));
    const unsubscribe = services.auth.onChange((next) => {
      setUser(next);
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        setUser(await services.auth.login(email, password));
      },
      async logout() {
        await services.auth.logout();
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return context;
}
