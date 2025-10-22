import { httpClient } from '../api/http-client';
import type { UserPlan, UserStatus } from './auth.types';
import { getCsrfToken, requireCsrfToken } from './csrf';

export type ApiRole = 'ORG_OWNER' | 'MANAGER' | 'CONTRIBUTOR' | 'VIEWER' | 'DATA_ADMIN';

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginOrganization = {
  id: string;
  name: string;
  role: ApiRole;
  tenantId: string | null;
  plan: UserPlan | null;
};

export type LoginResponse = {
  accessToken: string | null;
  user: {
    id: string;
    email: string;
    status: UserStatus;
  };
  orgs: LoginOrganization[];
  activeOrgId?: string;
  requiresOrgSetup?: boolean;
};

export type TokenExchangeRequest = {
  orgId?: string;
  refreshToken?: string;
};

export type TokenExchangeResponse = {
  accessToken: string;
};

export type SessionResponse = {
  user: {
    id: string;
    email: string;
    status: UserStatus;
  };
  orgs: LoginOrganization[];
  activeOrgId: string | null;
  requiresOrgSetup?: boolean;
};

export const loginWithEmailPassword = async (payload: LoginRequest): Promise<LoginResponse> => {
  const response = await httpClient.post<LoginResponse>('/auth/login', payload);
  return response.data;
};

export const exchangeAccessToken = async (
  payload: TokenExchangeRequest = {}
): Promise<TokenExchangeResponse> => {
  const csrfToken = requireCsrfToken();
  const response = await httpClient.post<TokenExchangeResponse>(
    '/auth/token',
    payload,
    {
      headers: {
        'x-csrf-token': csrfToken,
        'x-skip-refresh': 'true'
      }
    }
  );
  return response.data;
};

export const refreshAccessToken = async (): Promise<string | null> => {
  const csrfToken = getCsrfToken();
  if (!csrfToken) return null;
  try {
    const response = await httpClient.post<TokenExchangeResponse>(
      '/auth/token',
      {},
      {
        headers: {
          'x-csrf-token': csrfToken,
          'x-skip-refresh': 'true'
        }
      }
    );
    return response.data.accessToken;
  } catch (error) {
    return null;
  }
};

export const logoutSession = async () => {
  try {
    const csrfToken = requireCsrfToken();
    await httpClient.post(
      '/auth/logout',
      {},
      {
        headers: {
          'x-csrf-token': csrfToken,
          'x-skip-refresh': 'true'
        }
      }
    );
  } catch (error) {
    // Logout failures should not block UI; log for observability.
    console.warn('Falha ao encerrar sessão', error);
  }
};

export const fetchActiveSession = async (): Promise<SessionResponse> => {
  const response = await httpClient.get<SessionResponse>('/auth/session');
  return response.data;
};

export const requestSignupLink = async (email: string) => {
  const response = await httpClient.post<{ message: string }>('/auth/signup', { email });
  return response.data.message;
};

export const confirmSignupToken = async (token: string) => {
  const response = await httpClient.get<{ email: string }>('/auth/signup/confirm', {
    params: { token }
  });
  return response.data;
};

export type SignupCompletionResponse = {
  accessToken: string | null;
  user: {
    id: string;
    email: string;
    status: UserStatus;
  };
  requiresOrgSetup?: boolean;
};

export const completeSignup = async (payload: { token: string; password: string }) => {
  const response = await httpClient.post<SignupCompletionResponse>('/auth/signup/complete', payload);
  return response.data;
};

export const requestPasswordResetLink = async (email: string) => {
  const response = await httpClient.post<{ message: string }>('/auth/password/forgot', { email });
  return response.data.message;
};

export const validatePasswordResetToken = async (token: string) => {
  const response = await httpClient.get<{ email: string }>('/auth/password/validate', {
    params: { token }
  });
  return response.data;
};

export const resetPassword = async (payload: { token: string; newPassword: string }) => {
  const response = await httpClient.post<{ accessToken: string | null; requiresOrgSetup?: boolean }>(
    '/auth/password/reset',
    payload
  );
  return response.data;
};
