export const onboardingSteps = [
  "welcome",
  "company",
  "country",
  "segment",
  "size",
  "mission",
  "vision",
  "review"
] as const;

export type OnboardingStep = (typeof onboardingSteps)[number];

export type OnboardingStatus = "ACTIVE" | "COMPLETED";

export type OrganizationSizeValue =
  | "SIZE_1_10"
  | "SIZE_11_50"
  | "SIZE_51_200"
  | "SIZE_201_1000"
  | "SIZE_1001_PLUS";

export interface CountryOption {
  code: string;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
}

export interface SegmentOption {
  value: string;
  label: string;
}

export interface OrganizationSizeOption {
  value: OrganizationSizeValue;
  label: string;
  description: string;
}

export interface OnboardingAnswers {
  companyName?: string;
  country?: CountryOption;
  segment?: SegmentOption;
  size?: OrganizationSizeOption;
  mission?: string;
  vision?: string;
  summary?: string;
}

export interface OnboardingState {
  answers: OnboardingAnswers;
  completedSteps: OnboardingStep[];
  lastCompletedAt?: string;
}

export interface OnboardingSession {
  id: string;
  step: OnboardingStep;
  status: OnboardingStatus;
  state: OnboardingState;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateSessionRequest {
  step?: OnboardingStep;
  state?: OnboardingState;
}

export interface CompleteSessionRequest {
  organization?: {
    name?: string;
    tz?: string;
    currency?: string;
    locale?: string;
  };
}

export interface SaveStepRequest<TPayload = Record<string, unknown>> {
  step: OnboardingStep;
  payload?: TPayload;
}
