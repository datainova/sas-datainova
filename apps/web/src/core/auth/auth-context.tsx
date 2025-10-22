import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import type { AuthUser } from './auth.types';
import {
  httpClient,
  setTenantContextHeaders,
  setUnauthorizedHandler
} from '../api/http-client';
import {
  exchangeAccessToken,
  fetchActiveSession,
  logoutSession,
  refreshAccessToken
} from './auth-api';
import { buildAuthUserFromSession } from './auth-mappers';

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  setUser: (updater: AuthUser | null | ((current: AuthUser | null) => AuthUser | null)) => void;
  refreshSession: (preferredOrgId?: string | null) => Promise<AuthUser | null>;
  setActiveOrganization: (orgId: string) => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
  initialUser?: AuthUser | null;
};

export const AuthProvider = ({ children, initialUser = null }: AuthProviderProps) => {
  const [user, setUserState] = useState<AuthUser | null>(initialUser);
  const [isBootstrapping, setIsBootstrapping] = useState(() => initialUser === null);

  const applyUser = useCallback((nextUser: AuthUser | null) => {
    setUserState(nextUser);
    setIsBootstrapping(false);
  }, []);

  const clearAuthState = useCallback(() => {
    applyUser(null);
  }, [applyUser]);

  const hydrateFromSession = useCallback(
    async (accessToken: string, preferredOrgId?: string | null) => {
      const session = await fetchActiveSession();
      const authUser = buildAuthUserFromSession({
        session,
        accessToken,
        preferredOrgId
      });
      if (!authUser) {
        clearAuthState();
        return null;
      }
      applyUser(authUser);
      return authUser;
    },
    [applyUser, clearAuthState]
  );

  const login = useCallback((nextUser: AuthUser) => {
    applyUser(nextUser);
  }, [applyUser]);

  const logout = useCallback(() => {
    void logoutSession();
    clearAuthState();
  }, [clearAuthState]);

  const setUser = useCallback<AuthContextValue['setUser']>((updater) => {
    setUserState((current) => (typeof updater === 'function' ? updater(current) : updater));
    setIsBootstrapping(false);
  }, []);

  const refreshSession = useCallback(
    async (preferredOrgId?: string | null) => {
      const accessToken = await refreshAccessToken();
      if (!accessToken) {
        clearAuthState();
        return null;
      }
      try {
        return await hydrateFromSession(accessToken, preferredOrgId);
      } catch (error) {
        clearAuthState();
        throw error;
      }
    },
    [clearAuthState, hydrateFromSession]
  );

  const setActiveOrganization = useCallback(
    async (orgId: string) => {
      const { accessToken } = await exchangeAccessToken({ orgId });
      return hydrateFromSession(accessToken, orgId);
    },
    [hydrateFromSession]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isBootstrapping,
      login,
      logout,
      setUser,
      refreshSession,
      setActiveOrganization
    }),
    [user, isBootstrapping, login, logout, setUser, refreshSession, setActiveOrganization]
  );

  useEffect(() => {
    if (user) {
      const roles = user.roles?.length ? user.roles : [user.role];
      setTenantContextHeaders({
        token: user.token,
        orgId: user.orgId,
        tenantId: user.tenantId,
        userId: user.id,
        roles,
        plan: user.plan
      });
    } else {
      setTenantContextHeaders(null);
    }
  }, [user]);

  useEffect(() => {
    if (initialUser) {
      setIsBootstrapping(false);
      return;
    }

    let cancelled = false;
    const bootstrap = async () => {
      try {
        const accessToken = await refreshAccessToken();
        if (!accessToken || cancelled) {
          return;
        }
        await hydrateFromSession(accessToken);
      } catch (error) {
        if (!cancelled) {
          clearAuthState();
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [initialUser, hydrateFromSession, clearAuthState]);

  useEffect(() => {
    const handler = async (error: AxiosError) => {
      const originalConfig = (error.config ?? {}) as (AxiosRequestConfig & { __isRetry?: boolean });

      if (!originalConfig || originalConfig.__isRetry) {
        clearAuthState();
        return Promise.reject(error);
      }

      if (typeof originalConfig.url === 'string' && originalConfig.url.startsWith('/auth/')) {
        return Promise.reject(error);
      }

      originalConfig.__isRetry = true;

      try {
        const refreshedUser = await refreshSession();
        if (!refreshedUser) {
          return Promise.reject(error);
        }
        return httpClient.request(originalConfig);
      } catch (refreshError) {
        clearAuthState();
        return Promise.reject(refreshError);
      }
    };

    setUnauthorizedHandler(handler);
    return () => setUnauthorizedHandler(undefined);
  }, [clearAuthState, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
