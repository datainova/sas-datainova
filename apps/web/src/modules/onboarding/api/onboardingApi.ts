import { httpClient } from '../../../core/api/http-client';

export type OnboardingSession = {
  id: string;
};

export type OnboardingCompletion = {
  status: 'completed';
  organizationId: string;
  tenantId: string;
  accessToken: string | null;
};

export const createOnboardingSession = async (input: { orgName: string; email?: string; userId?: string }) => {
  const { data } = await httpClient.post<{ sessionId: string }>('/onboarding/sessions', {
    orgName: input.orgName,
    email: input.email,
    userId: input.userId
  });
  return data.sessionId;
};

export const saveOnboardingStep = async (input: { sessionId: string; step: string; payload: unknown }) => {
  await httpClient.patch(`/onboarding/sessions/${input.sessionId}/step`, {
    step: input.step,
    payload: input.payload
  });
};

export const completeOnboardingSession = async (sessionId: string) => {
  const { data } = await httpClient.post<OnboardingCompletion>(`/onboarding/sessions/${sessionId}/complete`);
  return data;
};
