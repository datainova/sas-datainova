export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: "OWNER" | "ADMIN" | "MANAGER" | "EDITOR" | "VIEWER";
}

export interface OrganizationSummary {
  id: string;
  name: string;
  nickname: string | null;
  tz: string;
  currency: string;
  locale: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  organization: OrganizationSummary;
}

export interface SignupVerification {
  token: string;
  expiresAt: string;
}

export interface SignupInitiatePayload {
  email: string;
}

export interface SignupInitiateResponse {
  ok: true;
  verification?: SignupVerification;
}

export interface SignupCompletePayload {
  token: string;
  name: string;
  password: string;
  organization: {
    name: string;
    nickname?: string | null;
    tz: string;
    currency: string;
    locale: string;
  };
}

export interface PasswordResetRequest {
  token: string;
  password: string;
}

export interface PasswordForgotResponse {
  ok: boolean;
  resetToken?: string;
  expiresAt?: string;
}

export interface OidcInitResponse {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
}
