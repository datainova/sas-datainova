import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Flag,
  Globe2,
  Loader2,
  MessageSquare,
  PenSquare,
  Target,
  Trophy,
  Users
} from "lucide-react";

import { useAuthSession } from "../hooks/useAuthSession";
import {
  completeOnboardingSession,
  createOnboardingSession,
  fetchActiveOnboardingSession,
  saveOnboardingStep
} from "../api/onboarding";
import type {
  OnboardingSession,
  OnboardingStep,
  OrganizationSizeOption,
  CountryOption,
  SegmentOption,
  SaveStepRequest
} from "../types/onboarding";
import { onboardingSteps } from "../types/onboarding";
import { countries, findCountry } from "../data/countries";
import { defaultSegments, slugifySegment } from "../data/segments";
import { organizationSizes } from "../data/organizationSizes";
import { ApiError } from "../lib/http";

interface Notification {
  type: "info" | "success" | "error";
  title: string;
  description?: string;
}

interface StepMeta {
  key: OnboardingStep;
  label: string;
  title: string;
  description: string;
  optional?: boolean;
  icon: ReactNode;
}

type OnboardingFormValues = {
  companyName: string;
  country: CountryOption | null;
  segment: SegmentOption | null;
  size: OrganizationSizeOption | null;
  mission: string;
  vision: string;
  summary: string;
};

const companyNameSchema = z
  .string()
  .trim()
  .min(2, "Informe um nome com 2 a 120 caracteres.")
  .max(120, "Informe um nome com 2 a 120 caracteres.");

const missionSchema = z
  .string()
  .trim()
  .min(140, "Descreva a missão com pelo menos 140 caracteres.")
  .max(360, "Reduza a missão para até 360 caracteres.");

const visionSchema = z
  .string()
  .trim()
  .min(140, "Traga uma visão de 3–5 anos com pelo menos 140 caracteres.")
  .max(360, "Resuma a visão em até 360 caracteres.");

const summarySchema = z
  .string()
  .trim()
  .min(20, "Resuma em pelo menos 20 caracteres.")
  .max(400, "Mantenha o resumo com até 400 caracteres.")
  .optional();

const cleanString = (value: string) => value.trim().replace(/\s{2,}/g, " ");

const stepsMeta: StepMeta[] = [
  {
    key: "welcome",
    label: "Início",
    title: "Configuração inicial",
    description: "Vamos configurar os dados essenciais da sua empresa.",
    icon: <Flag className="h-4 w-4" />
  },
  {
    key: "company",
    label: "Nome",
    title: "Nome da empresa",
    description: "Esse nome será usado em dashboards, convites e relatórios.",
    icon: <Building2 className="h-4 w-4" />
  },
  {
    key: "country",
    label: "País",
    title: "País de operação",
    description: "Carregaremos fuso horário, moeda e formatações automaticamente.",
    icon: <Globe2 className="h-4 w-4" />
  },
  {
    key: "segment",
    label: "Segmento",
    title: "Segmento de atuação",
    description: "Selecione na lista ou informe um rótulo representativo.",
    icon: <Target className="h-4 w-4" />
  },
  {
    key: "size",
    label: "Porte",
    title: "Porte da empresa",
    description: "Usado para sugestões de metas e benchmarks.",
    icon: <Users className="h-4 w-4" />
  },
  {
    key: "mission",
    label: "Missão",
    title: "Missão da empresa",
    description: "Descreva a razão de existir em tom executivo.",
    icon: <MessageSquare className="h-4 w-4" />
  },
  {
    key: "vision",
    label: "Visão",
    title: "Visão (3–5 anos)",
    description: "Projete o futuro desejado com objetividade.",
    icon: <Trophy className="h-4 w-4" />
  },
  {
    key: "review",
    label: "Resumo",
    title: "Revisão",
    description: "Confirme os dados para concluir o onboarding.",
    icon: <CheckCircle2 className="h-4 w-4" />,
    optional: true
  }
];

const defaultValues: OnboardingFormValues = {
  companyName: "",
  country: null,
  segment: null,
  size: null,
  mission: "",
  vision: "",
  summary: ""
};

const stepOrder: OnboardingStep[] = onboardingSteps.filter(
  (step): step is OnboardingStep =>
    step !== "welcome" || stepsMeta.some((meta) => meta.key === step)
);

function extractErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return (
      error.problem?.detail ??
      error.problem?.title ??
      `Erro ${error.status} ao chamar a API.`
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Erro inesperado.";
}

function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(media.matches);

    const listener = (event: MediaQueryListEvent) => setPrefers(event.matches);

    if (media.addEventListener) {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }

    // Safari compat
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);

  return prefers;
}

function selectStepMeta(step: OnboardingStep): StepMeta {
  const fallback = stepsMeta[0]!;
  return stepsMeta.find((meta) => meta.key === step) ?? fallback;
}

export function OnboardingPage() {
  const { session, clearSession } = useAuthSession();
  const prefersReducedMotion = usePrefersReducedMotion();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [notification, setNotification] = useState<Notification | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [completionRedirectScheduled, setCompletionRedirectScheduled] =
    useState(false);

  const autosaveCache = useRef<Record<OnboardingStep, string>>({});
  const initialized = useRef(false);

  const form = useForm<OnboardingFormValues>({
    mode: "onChange",
    defaultValues
  });

  const watchedValues = useWatch({ control: form.control });

  useEffect(() => {
    if (!session?.accessToken) {
      window.location.replace("/");
    }
  }, [session?.accessToken]);

  const queryKey = useMemo(
    () => ["onboarding-session", session?.user.id] as const,
    [session?.user.id]
  );

  const sessionQuery = useQuery({
    queryKey,
    enabled: Boolean(session?.accessToken),
    queryFn: async (): Promise<OnboardingSession> => {
      if (!session?.accessToken) {
        throw new Error("Sessão inválida.");
      }
      const existing = await fetchActiveOnboardingSession(
        session.accessToken
      );
      if (existing) {
        return existing;
      }
      return createOnboardingSession(session.accessToken, {
        step: "welcome"
      });
    },
    staleTime: 0,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) {
        return false;
      }
      return failureCount < 2;
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Falha ao carregar onboarding",
        description: extractErrorMessage(error)
      });
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
      }
    },
    refetchOnWindowFocus: false
  });

  const currentSession = sessionQuery.data;

  useEffect(() => {
    if (!currentSession) {
      return;
    }

    if (!initialized.current) {
      const answers = currentSession.state?.answers ?? {};
      const defaultsWithData: OnboardingFormValues = {
        companyName: answers.companyName ?? "",
        country: answers.country ? findCountry(answers.country.code) ?? answers.country : null,
        segment: answers.segment ?? null,
        size: answers.size
          ? organizationSizes.find((option) => option.value === answers.size?.value) ??
            (answers.size as OrganizationSizeOption)
          : null,
        mission: answers.mission ?? "",
        vision: answers.vision ?? "",
        summary: answers.summary ?? ""
      };
      form.reset(defaultsWithData);
      initialized.current = true;
    }

    setCurrentStep(currentSession.step ?? "welcome");
  }, [currentSession, form]);

  const autosaveMutation = useMutation({
    mutationFn: async (body: SaveStepRequest) => {
      if (!session?.accessToken || !currentSession?.id) {
        throw new Error("Sessão indisponível.");
      }
      setNotification(null);
      return saveOnboardingStep(session.accessToken, currentSession.id, body);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      setLastSavedAt(new Date().toISOString());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 650);
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Não foi possível salvar automaticamente",
        description: extractErrorMessage(error)
      });
    }
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!session?.accessToken || !currentSession?.id) {
        throw new Error("Sessão indisponível.");
      }
      const values = form.getValues();
      const organization = values.country
        ? {
            name: cleanString(values.companyName ?? ""),
            tz: values.country.timezone,
            currency: values.country.currency,
            locale: values.country.locale
          }
        : {
            name: cleanString(values.companyName ?? "")
          };
      return completeOnboardingSession(session.accessToken, currentSession.id, {
        organization
      });
    },
    onSuccess: () => {
      setCelebrating(true);
      queryClient.setQueryData(queryKey, (previous: OnboardingSession | undefined) => {
        if (!previous) {
          return previous;
        }
        const now = new Date().toISOString();
        return {
          ...previous,
          status: "COMPLETED",
          completedAt: now,
          updatedAt: now
        };
      });
      setNotification({
        type: "success",
        title: "Onboarding concluído!",
        description:
          "Sua organização está pronta para explorar indicadores e objetivos."
      });
    },
    onError: (error) => {
      setNotification({
        type: "error",
        title: "Não foi possível concluir o onboarding",
        description: extractErrorMessage(error)
      });
    }
  });

  useEffect(() => {
    if (!celebrating || prefersReducedMotion || completionRedirectScheduled) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setCompletionRedirectScheduled(true);
      window.location.replace("/");
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [celebrating, prefersReducedMotion, completionRedirectScheduled]);

  useEffect(() => {
    if (!currentSession?.id || !session?.accessToken) {
      return;
    }
    const payload = buildPayloadForStep(currentStep, watchedValues);
    if (!payload) {
      return;
    }
    const signature = JSON.stringify(payload.payload ?? null);
    if (autosaveCache.current[currentStep] === signature) {
      return;
    }
    const timeout = window.setTimeout(() => {
      autosaveCache.current[currentStep] = signature;
      autosaveMutation.mutate(payload);
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [
    watchedValues,
    currentStep,
    autosaveMutation,
    currentSession?.id,
    session?.accessToken
  ]);

  const completedSteps = currentSession?.state?.completedSteps ?? ["welcome"];
  const completedSet = useMemo(
    () => new Set(completedSteps),
    [completedSteps]
  );

  const currentMeta = selectStepMeta(currentStep);
  const currentIndex = stepOrder.indexOf(currentStep);
  const maxCompletedIndex = Math.max(
    ...completedSteps
      .map((step) => stepOrder.indexOf(step))
      .filter((index) => index >= 0)
  );
  const maxNavigableIndex = Math.min(
    stepOrder.length - 1,
    Math.max(currentIndex, maxCompletedIndex + 1)
  );

  const isLoading = sessionQuery.isLoading || sessionQuery.isPending;

  const handleStepSelect = useCallback(
    (target: OnboardingStep) => {
      const targetIndex = stepOrder.indexOf(target);
      if (targetIndex === -1) {
        return;
      }
      if (targetIndex > maxNavigableIndex) {
        return;
      }
      setCurrentStep(target);
    },
    [maxNavigableIndex]
  );

  const goToPrevious = useCallback(() => {
    const prevIndex = Math.max(0, currentIndex - 1);
    setCurrentStep(stepOrder[prevIndex] ?? "welcome");
  }, [currentIndex]);

  const goToNext = useCallback(async () => {
    if (!currentSession) {
      return;
    }
    const values = form.getValues();
    form.clearErrors();
    const validation = validateStep(currentStep, values, form.setError);
    if (!validation.valid) {
      return;
    }
    const payload = buildPayloadForStep(currentStep, validation.values);
    if (payload) {
      // Se um autosave já estiver em andamento, não bloqueie a navegação.
      // Evita dupla chamada e mantém a experiência fluida.
      if (!autosaveMutation.isPending) {
        autosaveCache.current[currentStep] = JSON.stringify(
          payload.payload ?? null
        );
        await autosaveMutation.mutateAsync(payload);
      }
    }

    if (currentStep === "review") {
      completeMutation.mutate();
      return;
    }

    const nextIndex = Math.min(stepOrder.length - 1, currentIndex + 1);
    setCurrentStep(stepOrder[nextIndex] ?? currentStep);
  }, [
    currentSession,
    form,
    currentStep,
    currentIndex,
    autosaveMutation,
    completeMutation
  ]);

  const handleStart = useCallback(() => {
    setCurrentStep("company");
  }, []);

  const isFirstStep = currentIndex <= 0;
  const isLastStep = currentStep === "review";

  if (!session?.accessToken) {
    return null;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0e0e0e] text-white">
      <AnimatedBackdrop prefersReducedMotion={prefersReducedMotion} />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-8 pt-6 sm:px-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-white/70">DataInova Connect</p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl">Onboarding</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-white/70 sm:text-sm">
              Configure os dados essenciais da sua organização para liberar
              painéis, alertas e recursos personalizados. As alterações são
              salvas automaticamente.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/60">
            {lastSavedAt ? (
              <p>
                Último salvamento automático em{" "}
                <span className="font-semibold text-white">
                  {new Date(lastSavedAt).toLocaleTimeString()}
                </span>
              </p>
            ) : (
              <p>Os dados são salvos continuamente.</p>
            )}
          </div>
        </header>

        <div className="mt-6 flex flex-1 flex-col gap-4 lg:flex-row">
          <aside className="w-full rounded-md border border-white/10 bg-white/5 p-4 lg:w-60">
            <Stepper
              steps={stepsMeta}
              currentStep={currentStep}
              completedSteps={completedSet}
              onSelect={handleStepSelect}
              prefersReducedMotion={prefersReducedMotion}
            />
          </aside>

          <main className="flex-1">
            <div className="relative overflow-hidden rounded-md border border-white/10 bg-white/5 shadow">
              <div className="relative px-5 py-6 sm:px-8 sm:py-8">
                {notification ? (
                  <div
                    className={clsx(
                      "mb-4 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-white/80",
                      notification.type === "error" && "border-red-500/40 bg-red-500/10 text-red-100"
                    )}
                  >
                    <p className="font-medium">{notification.title}</p>
                    {notification.description ? (
                      <p className="mt-1 text-[12px] opacity-80">
                        {notification.description}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -12 }}
                    transition={{
                      duration: prefersReducedMotion ? 0.16 : 0.28,
                      ease: [0.16, 1, 0.3, 1]
                    }}
                  >
                    {isLoading ? (
                      <LoadingState />
                    ) : (
                      <StepContent
                        form={form}
                        step={currentStep}
                        meta={currentMeta}
                        values={watchedValues}
                        onStart={handleStart}
                        onEditStep={handleStepSelect}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {!celebrating ? (
                <footer className="relative flex flex-col gap-3 border-t border-white/10 bg-black/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                  <div className="flex items-center gap-3">
                    <AutosaveIndicator
                      isSaving={autosaveMutation.isPending}
                      justSaved={justSaved}
                    />
                    <span className="hidden text-[12px] text-white/60 sm:inline">
                      Passo {currentIndex + 1} de {stepOrder.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={goToPrevious}
                      disabled={isFirstStep || completeMutation.isPending}
                      className="flex items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-[13px] font-medium text-white/80 transition hover:border-white/30 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={goToNext}
                      disabled={completeMutation.isPending}
                      className="flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-[#1f1d1b] shadow-sm transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/60 disabled:cursor-not-allowed disabled:bg-white/60"
                    >
                      {completeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isLastStep ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      {isLastStep ? "Concluir" : "Avançar"}
                    </button>
                  </div>
                </footer>
              ) : (
                <CelebrationFooter prefersReducedMotion={prefersReducedMotion} />
              )}
            </div>
          </main>
        </div>
      </div>
      <ConfettiBurst
        active={celebrating}
        prefersReducedMotion={prefersReducedMotion}
      />
    </div>
  );
}

function validateStep(
  step: OnboardingStep,
  values: OnboardingFormValues,
  setError: UseFormReturn<OnboardingFormValues>["setError"]
): { valid: boolean; values: OnboardingFormValues } {
  switch (step) {
    case "company": {
      const result = companyNameSchema.safeParse(values.companyName ?? "");
      if (!result.success) {
        setError("companyName", { type: "manual", message: result.error.issues[0]?.message });
        return { valid: false, values };
      }
      return {
        valid: true,
        values: {
          ...values,
          companyName: cleanString(result.data)
        }
      };
    }
    case "country": {
      if (!values.country) {
        setError("country", {
          type: "manual",
          message: "Selecione um país."
        });
        return { valid: false, values };
      }
      return { valid: true, values };
    }
    case "segment": {
      if (!values.segment || !values.segment.value.trim()) {
        setError("segment", {
          type: "manual",
          message: "Escolha ou informe um segmento."
        });
        return { valid: false, values };
      }
      return {
        valid: true,
        values: {
          ...values,
          segment: {
            value: slugifySegment(values.segment.value),
            label: cleanString(values.segment.label ?? values.segment.value)
          }
        }
      };
    }
    case "size": {
      if (!values.size) {
        setError("size", {
          type: "manual",
          message: "Selecione o porte da empresa."
        });
        return { valid: false, values };
      }
      return { valid: true, values };
    }
    case "mission": {
      const result = missionSchema.safeParse(values.mission ?? "");
      if (!result.success) {
        setError("mission", {
          type: "manual",
          message: result.error.issues[0]?.message
        });
        return { valid: false, values };
      }
      return { valid: true, values: { ...values, mission: cleanString(result.data) } };
    }
    case "vision": {
      const result = visionSchema.safeParse(values.vision ?? "");
      if (!result.success) {
        setError("vision", {
          type: "manual",
          message: result.error.issues[0]?.message
        });
        return { valid: false, values };
      }
      return { valid: true, values: { ...values, vision: cleanString(result.data) } };
    }
    case "review": {
      if (!values.summary) {
        return { valid: true, values };
      }
      const result = summarySchema.safeParse(values.summary);
      if (!result.success) {
        setError("summary", {
          type: "manual",
          message: result.error.issues[0]?.message
        });
        return { valid: false, values };
      }
      return { valid: true, values: { ...values, summary: cleanString(result.data ?? "") } };
    }
    default:
      return { valid: true, values };
  }
}

function buildPayloadForStep(
  step: OnboardingStep,
  values: OnboardingFormValues
): SaveStepRequest | null {
  switch (step) {
    case "company": {
      const normalized = cleanString(values.companyName ?? "");
      if (normalized.length < 2) {
        return null;
      }
      return {
        step: "company",
        payload: { companyName: normalized }
      };
    }
    case "country": {
      if (!values.country) {
        return null;
      }
      return {
        step: "country",
        payload: { country: values.country }
      };
    }
    case "segment": {
      if (!values.segment) {
        return null;
      }
      const value = slugifySegment(values.segment.value);
      const label = cleanString(values.segment.label ?? values.segment.value);
      if (!value) {
        return null;
      }
      return {
        step: "segment",
        payload: { segment: { value, label: label || values.segment.value } }
      };
    }
    case "size": {
      if (!values.size) {
        return null;
      }
      return {
        step: "size",
        payload: {
          size: {
            value: values.size.value,
            label: values.size.label
          }
        }
      };
    }
    case "mission": {
      const normalized = cleanString(values.mission ?? "");
      if (normalized.length < 140) {
        return null;
      }
      return {
        step: "mission",
        payload: { mission: normalized }
      };
    }
    case "vision": {
      const normalized = cleanString(values.vision ?? "");
      if (normalized.length < 140) {
        return null;
      }
      return {
        step: "vision",
        payload: { vision: normalized }
      };
    }
    case "review": {
      const normalized = cleanString(values.summary ?? "");
      if (!normalized) {
        return {
          step: "review"
        };
      }
      if (normalized.length < 20) {
        return null;
      }
      return {
        step: "review",
        payload: { summary: normalized }
      };
    }
    default:
      return null;
  }
}

interface StepContentProps {
  step: OnboardingStep;
  meta: StepMeta;
  form: UseFormReturn<OnboardingFormValues>;
  values: OnboardingFormValues;
  onStart: () => void;
  onEditStep: (step: OnboardingStep) => void;
}

function StepContent({
  step,
  meta,
  form,
  values,
  onStart,
  onEditStep
}: StepContentProps) {
  switch (step) {
    case "welcome":
      return <WelcomeStep onStart={onStart} />;
    case "company":
      return <CompanyStep meta={meta} form={form} />;
    case "country":
      return <CountryStep meta={meta} form={form} />;
    case "segment":
      return <SegmentStep meta={meta} form={form} />;
    case "size":
      return <SizeStep meta={meta} form={form} />;
    case "mission":
      return <MissionStep meta={meta} form={form} />;
    case "vision":
      return <VisionStep meta={meta} form={form} />;
    case "review":
      return (
        <ReviewStep
          meta={meta}
          values={values}
          onEditStep={onEditStep}
          form={form}
        />
      );
    default:
      return null;
  }
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl text-white">Configuração inicial</h2>
      <p className="max-w-xl text-sm text-white/70">
        Vamos coletar algumas informações essenciais da sua empresa. O
        salvamento é automático e você pode concluir depois.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex w-fit items-center gap-2 rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-[#1f1d1b] shadow-sm transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/60"
      >
        Começar
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function CompanyStep({
  meta,
  form
}: {
  meta: StepMeta;
  form: UseFormReturn<OnboardingFormValues>;
}) {
  const {
    register,
    formState: { errors }
  } = form;
  return (
    <div className="flex flex-col gap-6">
      <StepHeader meta={meta} />
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">
          Nome da empresa
        </label>
        <input
          type="text"
          placeholder="Ex.: DataInova Connect"
          autoComplete="organization"
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
          {...register("companyName")}
        />
        {errors.companyName?.message ? (
          <p className="text-xs text-red-300">{errors.companyName.message}</p>
        ) : (
          <p className="text-xs text-white/60">
            Dica: evite sufixos como LTDA ou S/A se não forem essenciais.
          </p>
        )}
      </div>
    </div>
  );
}

function CountryStep({
  meta,
  form
}: {
  meta: StepMeta;
  form: UseFormReturn<OnboardingFormValues>;
}) {
  const [query, setQuery] = useState("");
  const selected = form.watch("country");
  const matches = useMemo(() => {
    if (!query) {
      return countries.slice(0, 10);
    }
    const normalized = query.trim().toLowerCase();
    return countries
      .filter((country) => {
        return (
          country.name.toLowerCase().includes(normalized) ||
          country.code.toLowerCase().includes(normalized)
        );
      })
      .slice(0, 12);
  }, [query]);

  const handleSelect = (option: CountryOption) => {
    form.setValue("country", option, { shouldDirty: true });
    setQuery("");
  };

  const error = form.formState.errors.country?.message;

  return (
    <div className="flex flex-col gap-6">
      <StepHeader meta={meta} />
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">
          País
        </label>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busque por país (ex.: Brasil)"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <Globe2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        </div>
        {selected ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/80">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-white/70">
                {selected.code}
              </span>
              <p className="font-semibold text-white">{selected.name}</p>
            </div>
            <dl className="mt-3 grid gap-2 text-xs text-white/60 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white/70">Timezone</span>
                <span>{selected.timezone}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white/70">Moeda</span>
                <span>{selected.currency}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white/70">Locale</span>
                <span>{selected.locale}</span>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-xs text-white/50">
            Use a busca para encontrar rapidamente. Sugerimos o país pelo seu
            locale, mas você pode editar a qualquer momento.
          </p>
        )}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
      {query ? (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/40">
          <ul className="divide-y divide-white/5">
            {matches.map((option) => (
              <li key={option.code}>
                <button
                  type="button"
                  onClick={() => handleSelect(option)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-white/80 transition hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                >
                  <div>
                    <p className="font-semibold text-white">{option.name}</p>
                    <p className="text-xs text-white/50">
                      {option.timezone} · {option.currency}
                    </p>
                  </div>
                  <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold tracking-widest text-white/60">
                    {option.code}
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? (
              <li className="px-4 py-3 text-sm text-white/60">
                Nenhum país encontrado. Tente outro termo.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SegmentStep({
  meta,
  form
}: {
  meta: StepMeta;
  form: UseFormReturn<OnboardingFormValues>;
}) {
  const [query, setQuery] = useState("");
  const selected = form.watch("segment");

  const matches = useMemo(() => {
    if (!query) {
      return defaultSegments.slice(0, 8);
    }
    const normalized = query.trim().toLowerCase();
    return defaultSegments.filter((segment) =>
      segment.label.toLowerCase().includes(normalized)
    );
  }, [query]);

  const error = form.formState.errors.segment?.message;

  const handleSelect = (option: SegmentOption) => {
    form.setValue("segment", option, { shouldDirty: true });
    setQuery("");
  };

  const handleCreate = () => {
    if (!query.trim()) {
      return;
    }
    const newSegment: SegmentOption = {
      value: slugifySegment(query),
      label: cleanString(query)
    };
    form.setValue("segment", newSegment, { shouldDirty: true });
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-6">
      <StepHeader meta={meta} />
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">
          Segmento
        </label>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busque ou crie um segmento (ex.: Tecnologia)"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <Target className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        </div>
        <p className="text-xs text-white/50">
          Sugerimos segmentos populares, mas você pode criar um que represente
          melhor o seu nicho.
        </p>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {matches.map((option) => {
          const active = selected?.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option)}
              className={clsx(
                "rounded-full px-4 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/50",
                active
                  ? "bg-white text-[#2d2926] shadow-lg"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              )}
            >
              {option.label}
            </button>
          );
        })}
        {query.trim() ? (
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition hover:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/60"
          >
            Criar “{query.trim()}”
          </button>
        ) : null}
      </div>
      {selected ? (
      <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/70">
          Segmento selecionado:{" "}
          <span className="font-semibold text-white">{selected.label}</span>
        </div>
      ) : null}
    </div>
  );
}

function SizeStep({
  meta,
  form
}: {
  meta: StepMeta;
  form: UseFormReturn<OnboardingFormValues>;
}) {
  const selected = form.watch("size");
  const error = form.formState.errors.size?.message;
  return (
    <div className="flex flex-col gap-6">
      <StepHeader meta={meta} />
      <div className="grid gap-3 md:grid-cols-2">
        {organizationSizes.map((option) => {
          const active = selected?.value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => form.setValue("size", option, { shouldDirty: true })}
              className={clsx(
                "rounded-md border px-3 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-white/30",
                active
                  ? "border-white bg-white text-[#1f1d1b] shadow-sm"
                  : "border-white/10 bg-black/30 text-white/70 hover:border-white/20"
              )}
            >
              <p className={clsx("text-sm font-medium", active && "text-[#1f1d1b]")}>
                {option.label}
              </p>
              <p className={clsx("mt-2 text-xs", active ? "text-[#1f1d1b]/70" : "text-white/60")}>
                {option.description}
              </p>
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function MissionStep({
  meta,
  form
}: {
  meta: StepMeta;
  form: UseFormReturn<OnboardingFormValues>;
}) {
  const mission = form.watch("mission");
  const remaining = mission.length;
  const error = form.formState.errors.mission?.message;
  return (
    <div className="flex flex-col gap-6">
      <StepHeader meta={meta} />
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">
          Missão (140–360 caracteres)
        </label>
        <textarea
          rows={6}
          placeholder="Descreva o propósito essencial da organização..."
          className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
          {...form.register("mission")}
        />
        <div className="flex justify-between text-xs text-white/50">
          <span>{remaining} caracteres</span>
          <span>Recomendado: mínimo 140</span>
        </div>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}

function VisionStep({
  meta,
  form
}: {
  meta: StepMeta;
  form: UseFormReturn<OnboardingFormValues>;
}) {
  const vision = form.watch("vision");
  const remaining = vision.length;
  const error = form.formState.errors.vision?.message;
  return (
    <div className="flex flex-col gap-6">
      <StepHeader meta={meta} />
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">
          Visão (140–360 caracteres)
        </label>
        <textarea
          rows={6}
          placeholder="Descreva o futuro desejado em 3–5 anos..."
          className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
          {...form.register("vision")}
        />
        <div className="flex justify-between text-xs text-white/50">
          <span>{remaining} caracteres</span>
          <span>Recomendado: mínimo 140</span>
        </div>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}

function ReviewStep({
  meta,
  values,
  onEditStep,
  form
}: {
  meta: StepMeta;
  values: OnboardingFormValues;
  onEditStep: (step: OnboardingStep) => void;
  form: UseFormReturn<OnboardingFormValues>;
}) {
  const summary = values.summary ?? "";
  const summaryError = form.formState.errors.summary?.message;
  const errors: string[] = [];

  if (!values.companyName) errors.push("Nome da empresa pendente");
  if (!values.country) errors.push("País não definido");
  if (!values.segment) errors.push("Segmento não informado");
  if (!values.size) errors.push("Porte da empresa não selecionado");
  if (!values.mission || values.mission.length < 140)
    errors.push("Missão abaixo do comprimento mínimo");
  if (!values.vision || values.vision.length < 140)
    errors.push("Visão abaixo do comprimento mínimo");

  return (
    <div className="flex flex-col gap-6">
      <StepHeader meta={meta} />
      <div className="rounded-xl border border-white/10 bg-black/30 p-5 shadow-inner">
        <dl className="grid gap-4 text-sm text-white/80 sm:grid-cols-2">
          <ReviewItem
            label="Empresa"
            value={values.companyName || "—"}
            onClick={() => onEditStep("company")}
          />
          <ReviewItem
            label="País"
            value={
              values.country
                ? `${values.country.name} · ${values.country.currency}`
                : "—"
            }
            onClick={() => onEditStep("country")}
          />
          <ReviewItem
            label="Segmento"
            value={values.segment?.label ?? "—"}
            onClick={() => onEditStep("segment")}
          />
          <ReviewItem
            label="Porte"
            value={values.size?.label ?? "—"}
            onClick={() => onEditStep("size")}
          />
        </dl>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ReviewCard
            title="Missão"
            content={values.mission || "Defina a missão para continuar."}
            onEdit={() => onEditStep("mission")}
          />
          <ReviewCard
            title="Visão"
            content={values.vision || "Defina a visão para continuar."}
            onEdit={() => onEditStep("vision")}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">
          Resumo executivo (opcional)
        </label>
        <textarea
          rows={4}
          placeholder="Destaque o seguinte passo após o onboarding..."
          className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/50"
          {...form.register("summary")}
        />
        <div className="flex justify-between text-xs text-white/50">
          <span>{summary.length} caracteres</span>
          <span>Opcional · mínimo 20 para salvar</span>
        </div>
        {summaryError ? (
          <p className="text-xs text-red-300">{summaryError}</p>
        ) : null}
      </div>

      {errors.length ? (
        <div className="rounded-lg border border-yellow-400/40 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          <p className="font-semibold">Quase lá — revise antes de concluir:</p>
          <ul className="mt-2 space-y-1 text-xs">
            {errors.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-yellow-200" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-md border border-white/15 bg-white/5 p-4 text-sm text-white/80">
          <p className="font-medium">Tudo consistente. Você pode concluir.</p>
        </div>
      )}
    </div>
  );
}

function StepHeader({ meta }: { meta: StepMeta }) {
  return (
    <div className="space-y-2">
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/70">
        {meta.icon}
        {meta.label}
      </span>
      <h2 className="font-display text-2xl md:text-3xl text-white">{meta.title}</h2>
      <p className="max-w-2xl text-sm text-white/70">{meta.description}</p>
    </div>
  );
}

function ReviewCard({
  title,
  content,
  onEdit
}: {
  title: string;
  content: string;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/70">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-white">{title}</p>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-medium text-white/60 underline-offset-4 transition hover:text-white"
        >
          Editar
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/70">
        {content}
      </p>
    </div>
  );
}

function ReviewItem({
  label,
  value,
  onClick
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <div>
      <p className="text-xs text-white/60">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-white/90">{value}</p>
        <button
          type="button"
          onClick={onClick}
          className="text-xs font-medium text-white/60 underline-offset-4 transition hover:text-white"
        >
          Editar
        </button>
      </div>
    </div>
  );
}

function AutosaveIndicator({
  isSaving,
  justSaved
}: {
  isSaving: boolean;
  justSaved: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-full px-3 py-1 text-xs",
        isSaving ? "bg-white/10 text-white" : "bg-white/5 text-white/70"
      )}
    >
      {isSaving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      {isSaving ? "Salvando..." : justSaved ? "Salvo" : "Salvamento automático"}
    </div>
  );
}

function Stepper({
  steps,
  currentStep,
  completedSteps,
  onSelect,
  prefersReducedMotion
}: {
  steps: StepMeta[];
  currentStep: OnboardingStep;
  completedSteps: Set<OnboardingStep>;
  onSelect: (step: OnboardingStep) => void;
  prefersReducedMotion: boolean;
}) {
  return (
    <nav className="flex flex-col gap-2.5">
      {steps.map((step) => {
        const active = currentStep === step.key;
        const completed = completedSteps.has(step.key);
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onSelect(step.key)}
            className={clsx(
              "flex items-center gap-3 rounded-md border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-white/30",
              active
                ? "border-white bg-white text-[#1f1d1b] shadow-sm"
                : completed
                  ? "border-white/20 bg-white/5 text-white/80 hover:border-white/30"
                  : "border-white/10 bg-black/30 text-white/60 hover:border-white/25"
            )}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/30">
              <AnimatePresence>
                {completed ? (
                  <motion.div
                    initial={{ scale: prefersReducedMotion ? 1 : 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    key="check"
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  >
                    <Check className="h-4 w-4 text-current" />
                  </motion.div>
                ) : (
                  <span className="text-[11px] font-medium text-current">
                    {stepOrder.indexOf(step.key) + 1}
                  </span>
                )}
              </AnimatePresence>
            </div>
            <div className="flex-1">
              <p
                className={clsx(
                  "text-sm font-medium",
                  active
                    ? "text-[#1f1b19]"
                    : completed
                      ? "text-white/80"
                      : "text-white/70"
                )}
              >
                {step.label}
              </p>
              <p
                className={clsx(
                  "text-[12px]",
                  active
                    ? "text-[#1f1b19]/70"
                    : completed
                      ? "text-white/60"
                      : "text-white/40"
                )}
              >
                {step.title}
              </p>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-5 w-40 rounded-full bg-white/10" />
      <div className="h-10 w-3/4 rounded-xl bg-white/10" />
      <div className="h-10 w-2/3 rounded-xl bg-white/10" />
      <div className="h-40 rounded-xl bg-white/10" />
    </div>
  );
}

function AnimatedBackdrop({
  prefersReducedMotion
}: {
  prefersReducedMotion: boolean;
}) {
  // Fundo minimalista (base já definida no container). Sem camadas extras.
  return null;
}

function CelebrationFooter({
  prefersReducedMotion
}: {
  prefersReducedMotion: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border-t border-white/10 bg-black/40 px-6 py-8 text-center sm:px-10">
      <div className="flex items-center gap-3 text-white/80">
        <Check className="h-5 w-5" />
        <p className="text-sm font-medium">Onboarding concluído</p>
      </div>
      <h3 className="font-display text-2xl md:text-3xl text-white">
        Configuração finalizada
      </h3>
      <p className="max-w-xl text-sm text-white/70">
        Preparando os dashboards e os recursos da conta. Você será
        redirecionado em instantes.
      </p>
      {prefersReducedMotion ? null : (
        <p className="text-xs text-white/50">redirecionando…</p>
      )}
    </div>
  );
}

function ConfettiBurst({
  active,
  prefersReducedMotion
}: {
  active: boolean;
  prefersReducedMotion: boolean;
}) {
  // Experiência mais sóbria: sem confete na conclusão.
  return null;
}

// animation keyframes via global CSS injection
// Estilos de confete removidos, mantendo a conclusão mais discreta.
