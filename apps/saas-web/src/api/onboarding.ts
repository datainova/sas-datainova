import { ApiError, http } from "../lib/http";
import type {
  CompleteSessionRequest,
  CreateSessionRequest,
  OnboardingSession,
  SaveStepRequest
} from "../types/onboarding";

export async function fetchActiveOnboardingSession(
  token: string
): Promise<OnboardingSession | null> {
  try {
    return await http<OnboardingSession>("/onboarding/sessions/active", {
      token
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function createOnboardingSession(
  token: string,
  body?: CreateSessionRequest
): Promise<OnboardingSession> {
  return http<OnboardingSession>("/onboarding/sessions", {
    method: "POST",
    token,
    body
  });
}

export async function getOnboardingSession(
  token: string,
  id: string
): Promise<OnboardingSession> {
  return http<OnboardingSession>(`/onboarding/sessions/${id}`, {
    token
  });
}

export async function saveOnboardingStep(
  token: string,
  id: string,
  body: SaveStepRequest
): Promise<OnboardingSession> {
  return http<OnboardingSession>(`/onboarding/sessions/${id}/step`, {
    method: "PATCH",
    token,
    body
  });
}

export async function completeOnboardingSession(
  token: string,
  id: string,
  body?: CompleteSessionRequest
) {
  return http<{ ok: true }>(`/onboarding/sessions/${id}/complete`, {
    method: "POST",
    token,
    body
  });
}
