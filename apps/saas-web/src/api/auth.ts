import { http } from "../lib/http";
import type {
  AuthSession,
  OidcInitResponse,
  PasswordForgotResponse,
  PasswordResetRequest,
  SignupCompletePayload,
  SignupInitiatePayload,
  SignupInitiateResponse
} from "../types/auth";

export interface LoginRequest {
  email: string;
  password: string;
  organizationId?: string;
  organizationNickname?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export async function login(payload: LoginRequest): Promise<AuthSession> {
  return http<AuthSession>("/auth/login", {
    method: "POST",
    body: payload
  });
}

export async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  return http<TokenResponse>("/auth/token", {
    method: "POST",
    body: { refreshToken }
  });
}

export async function logout(
  accessToken: string,
  refreshToken?: string
): Promise<{ ok: boolean }> {
  return http<{ ok: boolean }>("/auth/logout", {
    method: "POST",
    token: accessToken,
    body: refreshToken ? { refreshToken } : undefined
  });
}

export async function signupInitiate(
  payload: SignupInitiatePayload
): Promise<SignupInitiateResponse> {
  return http<SignupInitiateResponse>("/auth/signup", {
    method: "POST",
    body: payload
  });
}

export async function signupConfirm(token: string) {
  return http<{ email: string; expiresAt: string }>(
    `/auth/signup/confirm?token=${encodeURIComponent(token)}`
  );
}

export async function signupComplete(
  payload: SignupCompletePayload
): Promise<AuthSession> {
  return http<AuthSession>("/auth/signup/complete", {
    method: "POST",
    body: payload
  });
}

export async function requestPasswordReset(
  email: string
): Promise<PasswordForgotResponse> {
  return http<PasswordForgotResponse>("/auth/password/forgot", {
    method: "POST",
    body: { email }
  });
}

export async function validatePasswordToken(token: string) {
  return http<{ email: string; expiresAt: string }>(
    `/auth/password/validate?token=${encodeURIComponent(token)}`
  );
}

export async function resetPassword(payload: PasswordResetRequest) {
  return http<{ ok: boolean }>("/auth/password/reset", {
    method: "POST",
    body: payload
  });
}

export async function initGoogleOidc(): Promise<OidcInitResponse> {
  return http<OidcInitResponse>("/auth/oidc/google/init");
}

export interface GoogleCallbackRequest {
  state: string;
  code: string;
  email: string;
  organizationId?: string;
  organizationNickname?: string;
}

export async function finalizeGoogleLogin(
  payload: GoogleCallbackRequest
): Promise<AuthSession> {
  const params = new URLSearchParams({
    state: payload.state,
    code: payload.code,
    email: payload.email
  });

  if (payload.organizationNickname) {
    params.set("organizationNickname", payload.organizationNickname);
  }

  if (payload.organizationId) {
    params.set("organizationId", payload.organizationId);
  }

  return http<AuthSession>(`/auth/oidc/google/callback?${params.toString()}`);
}
