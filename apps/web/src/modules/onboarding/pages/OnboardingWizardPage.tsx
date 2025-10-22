import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm, FormProvider, type FieldPath, type FormState, type UseFormSetValue } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Stepper } from '../../../design-system/components/Stepper';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Textarea } from '../../../design-system/components/Textarea';
import { Card } from '../../../design-system/components/Card';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { useAutosave } from '../../../core/hooks/useAutosave';
import { useToast } from '../../../design-system/feedback/useToast';
import { FormSavePulse } from '../../../design-system/motion/FormSavePulse';
import { createOnboardingSession, saveOnboardingStep, completeOnboardingSession } from '../api/onboardingApi';
import { useAuth } from '../../../core/auth/use-auth';
import { fetchActiveSession } from '../../../core/auth/auth-api';
import { buildAuthUserFromSession } from '../../../core/auth/auth-mappers';
import { countryOptions, detectBrowserCountry, findCountryOption, type CountryInfo } from '../../../core/i18n/country-utils';

const STORAGE_KEY = 'datainova:onboarding-draft';
const STEP_KEY = 'datainova:onboarding-step';
const SESSION_ID_KEY = 'datainova:onboarding-session';
const ONBOARDING_USER_KEY = 'datainova:onboarding-user';

type OnboardingUserInfo = {
  id?: string;
  email?: string;
};

const extractOnboardingUserFromState = (state: unknown): OnboardingUserInfo | null => {
  if (!state || typeof state !== 'object') return null;
  const candidate = state as { email?: unknown; userId?: unknown };
  const info: OnboardingUserInfo = {};
  if (typeof candidate.userId === 'string' && candidate.userId) {
    info.id = candidate.userId;
  }
  if (typeof candidate.email === 'string' && candidate.email) {
    info.email = candidate.email;
  }
  return info.id || info.email ? info : null;
};

const loadOnboardingUserInfo = (): OnboardingUserInfo | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const info: OnboardingUserInfo = {};
    if (typeof (parsed as Record<string, unknown>).id === 'string') {
      info.id = (parsed as Record<string, string>).id;
    }
    if (typeof (parsed as Record<string, unknown>).email === 'string') {
      info.email = (parsed as Record<string, string>).email;
    }
    return info.id || info.email ? info : null;
  } catch (error) {
    console.warn('Não foi possível carregar dados do usuário para o onboarding', error);
    return null;
  }
};

const persistOnboardingUserInfo = (info: OnboardingUserInfo) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ONBOARDING_USER_KEY, JSON.stringify(info));
  } catch (error) {
    console.warn('Não foi possível armazenar dados do usuário para o onboarding', error);
  }
};

const clearOnboardingUserInfo = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ONBOARDING_USER_KEY);
  } catch (error) {
    console.warn('Não foi possível limpar dados do usuário para o onboarding', error);
  }
};

const onboardingSchema = z.object({
  name: z.string().min(2, 'Informe um nome com pelo menos 2 caracteres').max(120, 'Limite de 120 caracteres.'),
  country: z.string().min(2, 'Selecione o país de operação'),
  segment: z.string().min(2, 'Informe o segmento principal'),
  size: z
    .string({ required_error: 'Selecione o porte da organização' })
    .refine((value) => Boolean(value), 'Selecione o porte da organização'),
  mission: z
    .string()
    .min(140, 'Descreva a missão com pelo menos 140 caracteres')
    .max(360, 'Limite de 360 caracteres'),
  vision: z
    .string()
    .min(140, 'Descreva a visão com pelo menos 140 caracteres')
    .max(360, 'Limite de 360 caracteres')
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

type OnboardingFieldPath = FieldPath<OnboardingFormValues>;

type WizardStep =
  | { id: 'name'; label: string; description: string }
  | { id: 'country'; label: string; description: string }
  | { id: 'segment'; label: string; description: string }
  | { id: 'size'; label: string; description: string }
  | { id: 'mission'; label: string; description: string }
  | { id: 'vision'; label: string; description: string }
  | { id: 'summary'; label: string; description: string };

const steps: WizardStep[] = [
  { id: 'name', label: 'Organização', description: 'Nome da empresa ou equipe principal.' },
  { id: 'country', label: 'País', description: 'Onde está a operação predominante.' },
  { id: 'segment', label: 'Segmento', description: 'Qual o setor de atuação?' },
  { id: 'size', label: 'Porte', description: 'Quantidade aproximada de colaboradores.' },
  { id: 'mission', label: 'Missão', description: 'Por que a organização existe?' },
  { id: 'vision', label: 'Visão', description: 'Onde desejam chegar em 3 a 5 anos?' },
  { id: 'summary', label: 'Resumo', description: 'Revise e confirme as informações.' }
];

const stepValidationFields: Record<WizardStep['id'], OnboardingFieldPath[]> = {
  name: ['name'],
  country: ['country'],
  segment: ['segment'],
  size: ['size'],
  mission: ['mission'],
  vision: ['vision'],
  summary: []
};

const sizeOptions = [
  { value: '1-10', label: '1 – 10', description: 'Equipe enxuta, foco em fundadores.' },
  { value: '11-50', label: '11 – 50', description: 'Estrutura em formação, crescimento acelerado.' },
  { value: '51-200', label: '51 – 200', description: 'Times estabelecidos, disciplina em escala.' },
  { value: '201-500', label: '201 – 500', description: 'Estratégia multifuncional, governança forte.' },
  { value: '500+', label: '500+', description: 'Grandes operações, múltiplas unidades.' }
];

const defaultValues: OnboardingFormValues = {
  name: '',
  country: '',
  segment: '',
  size: '',
  mission: '',
  vision: ''
};

const loadDraft = (): OnboardingFormValues | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const partial = onboardingSchema.partial().parse(JSON.parse(stored));
    return {
      ...defaultValues,
      ...partial
    };
  } catch (error) {
    console.warn('Não foi possível carregar o rascunho de onboarding', error);
    return null;
  }
};

const loadLastStep = () => {
  const stored = window.localStorage.getItem(STEP_KEY);
  const index = Number.parseInt(stored ?? '0', 10);
  if (Number.isNaN(index)) return 0;
  return Math.min(Math.max(index, 0), steps.length - 1);
};

const stepMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 }
};

const OnboardingWizardPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const draft = useMemo(() => loadDraft(), []);
  const fallbackCountry = useMemo(() => detectBrowserCountry(), []);
  const defaultFormValues = useMemo(() => {
    if (draft) return draft;
    if (fallbackCountry) {
      return { ...defaultValues, country: fallbackCountry };
    }
    return defaultValues;
  }, [draft, fallbackCountry]);

  const [onboardingUser, setOnboardingUser] = useState<OnboardingUserInfo | null>(() => {
    const fromState = extractOnboardingUserFromState(location.state);
    if (fromState) {
      persistOnboardingUserInfo(fromState);
      return fromState;
    }
    return loadOnboardingUserInfo();
  });

  const [stepIndex, setStepIndex] = useState(loadLastStep);
  const [completed, setCompleted] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'retry'>('idle');
  const { showToast } = useToast();
  const { login, setUser } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(() => window.localStorage.getItem(SESSION_ID_KEY));
  const [creatingSession, setCreatingSession] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [autoAuthenticated, setAutoAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (completed) return;
    const fromState = extractOnboardingUserFromState(location.state);
    if (!fromState) return;
    if (fromState.id !== onboardingUser?.id || fromState.email !== onboardingUser?.email) {
      setOnboardingUser(fromState);
    }
    persistOnboardingUserInfo(fromState);
  }, [location.state, onboardingUser, completed]);
  const shouldReduceMotion = useReducedMotion();

  const methods = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onChange',
    defaultValues: defaultFormValues
  });

  const { handleSubmit, trigger, setValue, watch, formState } = methods;
  const values = watch();
  const currentStep = steps[stepIndex];
  const isLastStep = currentStep.id === 'summary';
  const selectedCountry = useMemo(() => findCountryOption(values.country), [values.country]);
  const suggestedCountry = useMemo(
    () => (fallbackCountry ? findCountryOption(fallbackCountry) : undefined),
    [fallbackCountry]
  );
  const sizeLabelByValue = useMemo(
    () => Object.fromEntries(sizeOptions.map((option) => [option.value, option.label])),
    []
  );
  const summaryStatus = useMemo(
    () => ({
      name: values.name.trim().length >= 2,
      country: Boolean(values.country),
      segment: values.segment.trim().length >= 2,
      size: Boolean(values.size),
      mission: values.mission.trim().length >= 140,
      vision: values.vision.trim().length >= 140
    }),
    [values]
  );
  const hasData = useMemo(
    () =>
      Object.values(values).some((value) =>
        typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
      ),
    [values]
  );
  const stepTransition = useMemo(
    () =>
      shouldReduceMotion
        ? { duration: 0 }
        : { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
    [shouldReduceMotion]
  );

  useEffect(() => {
    if (sessionId) {
      window.localStorage.setItem(SESSION_ID_KEY, sessionId);
    } else {
      window.localStorage.removeItem(SESSION_ID_KEY);
    }
  }, [sessionId]);

  useEffect(() => {
    if (completed || !hasData) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [completed, hasData]);

  const persistDraft = useCallback(
    async (formValues: OnboardingFormValues) => {
      try {
        setSaveState('saving');
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(formValues));
        window.localStorage.setItem(STEP_KEY, String(stepIndex));

        if (sessionId) {
          const stepPayload =
            currentStep.id === 'summary'
              ? formValues
              : formValues[currentStep.id as keyof OnboardingFormValues];

          await saveOnboardingStep({
            sessionId,
            step: currentStep.id,
            payload: stepPayload ?? formValues
          });
        }

        setSaveState('saved');
      } catch (error) {
        console.error('Falha ao salvar rascunho', error);
        setSaveState('retry');
      }
    },
    [currentStep.id, sessionId, stepIndex]
  );

  useAutosave(values, persistDraft, { enabled: !completed, delay: 500 });

  useEffect(() => {
    if (completed) return;
    if (sessionId || creatingSession) return;
    if (!values.name || values.name.trim().length < 2) return;

    let cancelled = false;

    const bootstrapSession = async () => {
      try {
        setCreatingSession(true);
        const id = await createOnboardingSession({
          orgName: values.name,
          email: onboardingUser?.email,
          userId: onboardingUser?.id
        });
        if (!cancelled) {
          setSessionId(id);
        }
      } catch (error) {
        if (!cancelled) {
          showToast({
            title: 'Não conectamos ao CRM ainda',
            description: 'Seguiremos tentando em segundo plano. Seus dados estão salvos localmente.',
            variant: 'info'
          });
        }
      } finally {
        if (!cancelled) {
          setCreatingSession(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId, creatingSession, values.name, showToast, completed, onboardingUser]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = window.setTimeout(() => setSaveState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        void goNext();
      }
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const goNext = async () => {
    if (isCompleting) return;
    const fieldsToValidate = stepValidationFields[currentStep.id];
    if (fieldsToValidate.length && !(await trigger(fieldsToValidate))) {
      return;
    }
    if (isLastStep) {
      handleSubmit(onSubmit)();
    } else {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }
  };

  const goPrevious = () => {
    if (isCompleting) return;
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const onSubmit = async (formValues: OnboardingFormValues) => {
    if (isCompleting) return;

    try {
      setIsCompleting(true);
      setSaveState('saving');
      const ensuredSessionId =
        sessionId ??
        (await createOnboardingSession({
          orgName: formValues.name,
          email: onboardingUser?.email,
          userId: onboardingUser?.id
        }));

      if (!sessionId) {
        setSessionId(ensuredSessionId);
      }

      await saveOnboardingStep({
        sessionId: ensuredSessionId,
        step: 'summary',
        payload: formValues
      });

      const completion = await completeOnboardingSession(ensuredSessionId);

      let authenticated = false;
      if (completion.accessToken) {
        try {
          const session = await fetchActiveSession();
          const authUser = buildAuthUserFromSession({
            session,
            accessToken: completion.accessToken,
            preferredOrgId: completion.organizationId
          });
          if (authUser) {
            login(authUser);
            authenticated = true;
          }
        } catch (authError) {
          console.error('Falha ao atualizar a sessão após o onboarding', authError);
        }
      }

      if (!authenticated) {
        setUser((current) => {
          if (!current) return current;
          const primaryRole = current.roles?.[0] ?? current.role;
          const updatedMembership = {
            id: completion.organizationId,
            name: formValues.name,
            role: primaryRole,
            tenantId: completion.tenantId,
            plan: 'FREE' as const
          };
          const existingOrganizations = current.organizations ?? [];
          const mergedOrganizations = [
            updatedMembership,
            ...existingOrganizations.filter((org) => org.id !== updatedMembership.id)
          ];
          const roles = current.roles?.length ? current.roles : [primaryRole];
          return {
            ...current,
            role: primaryRole,
            roles,
            orgId: updatedMembership.id,
            orgName: updatedMembership.name,
            tenantId: updatedMembership.tenantId,
            plan: 'FREE',
            organizations: mergedOrganizations
          };
        });
      }

      setAutoAuthenticated(authenticated);

      setCompleted(true);
      setSaveState('saved');
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(STEP_KEY);
      window.localStorage.removeItem(SESSION_ID_KEY);
      clearOnboardingUserInfo();
      setSessionId(null);
      setOnboardingUser(null);

      showToast({
        title: 'Onboarding concluído',
        description: authenticated
          ? 'Organização criada com sucesso. Redirecionando para o workspace.'
          : 'Organização criada com sucesso. Faça login para acessar o workspace.',
        variant: 'success'
      });

      if (authenticated) {
        navigate('/dashboard', { replace: true });
      }
    } catch (error) {
      console.error('Falha ao concluir onboarding', error);
      setSaveState('idle');
      showToast({
        title: 'Erro ao concluir onboarding',
        description: 'Tente novamente em instantes.',
        variant: 'error'
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const summaryEntries = useMemo(
    () => [
      { label: 'Organização', value: values.name || '—' },
      {
        label: 'País',
        value: selectedCountry ? `${selectedCountry.label} (${selectedCountry.code})` : values.country || '—'
      },
      { label: 'Segmento', value: values.segment || '—' },
      {
        label: 'Porte',
        value: values.size ? sizeLabelByValue[values.size] ?? values.size : '—'
      },
      { label: 'Missão', value: values.mission || '—' },
      { label: 'Visão', value: values.vision || '—' }
    ],
    [selectedCountry, sizeLabelByValue, values]
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Onboarding"
        title="Configuração inicial da sua empresa"
        description="Leva menos de 2 minutos. Os dados alimentam o storytelling dos wizards e os entitlements sugeridos."
      />
      <div className="relative">
        <Card
          subtitle={currentStep.description}
          actions={
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="rounded-full border border-slate-800 px-3 py-1 font-medium text-slate-300">
                Passo {stepIndex + 1} / {steps.length}
              </span>
              <span
                className="text-slate-500"
                aria-live="polite"
                data-state={saveState}
              >
                {saveState === 'saving' && 'Salvando...'}
                {saveState === 'saved' && 'Rascunho salvo'}
                {saveState === 'retry' && 'Reconectando...'}
              </span>
            </div>
          }
        >
          <FormProvider {...methods}>
            <form
              className="space-y-8"
              onSubmit={(event) => {
                event.preventDefault();
                void goNext();
              }}
              aria-busy={isCompleting}
            >
            <Stepper
              steps={steps.map((step, index) => ({
                id: step.id,
                label: step.label,
                status:
                  index < stepIndex
                    ? 'completed'
                    : index === stepIndex
                    ? 'current'
                    : 'upcoming'
              }))}
              current={stepIndex}
              allowNavigation={!isCompleting}
              onStepSelect={(index) => {
                if (!isCompleting) {
                  setStepIndex(index);
                }
              }}
            />

            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep.id}
                variants={stepMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={stepTransition}
                className="space-y-6"
              >
                {renderStep(currentStep.id, {
                  formState,
                  values,
                  setValue,
                  setStepIndex,
                  selectedCountry,
                  suggestedCountry,
                  summaryStatus
                })}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={goPrevious}
                disabled={stepIndex === 0 || isCompleting}
              >
                Voltar
              </Button>
              <FormSavePulse active={isCompleting || saveState === 'saving' || saveState === 'retry'}>
                <Button type="submit" disabled={isCompleting}>
                  {isLastStep ? 'Concluir' : 'Avançar'}
                </Button>
              </FormSavePulse>
            </div>
            </form>
          </FormProvider>
        </Card>
        {isCompleting ? (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-slate-950/70 backdrop-blur"
            role="status"
            aria-live="assertive"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p className="mt-3 text-sm font-semibold text-slate-200">Configurando sua empresa…</p>
          </div>
        ) : null}
      </div>

      {completed ? (
        <Card tone="success" title="🎉 Organização configurada">
          <p className="text-sm text-success-100">
            {autoAuthenticated === false
              ? 'Organização criada! Faça login para acessar o workspace recém configurado.'
              : 'Você pode seguir para criar objetivos estratégicos ou convidar sua equipe. Os dados alimentam cadências, integrações e sugestões do MCP.'}
          </p>
        </Card>
      ) : null}

      {currentStep.id !== 'summary' ? (
        <Card title="Prévia" subtitle="Os dados digitados serão exibidos na etapa final para revisão.">
          <dl className="grid gap-4 md:grid-cols-2">
            {summaryEntries.map((entry) => (
              <div key={entry.label} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">{entry.label}</dt>
                <dd className="mt-2 text-sm text-slate-200">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}
    </div>
  );
};

type StepRendererProps = {
  formState: FormState<OnboardingFormValues>;
  values: OnboardingFormValues;
  setValue: UseFormSetValue<OnboardingFormValues>;
  setStepIndex: (index: number) => void;
  selectedCountry?: CountryInfo;
  suggestedCountry?: CountryInfo;
  summaryStatus: Record<keyof OnboardingFormValues, boolean>;
};

const segmentSuggestions = ['Tecnologia', 'Serviços Financeiros', 'Varejo', 'Educação', 'Saúde', 'Indústria'];

const reviewFields: Array<{ id: keyof OnboardingFormValues; label: string }> = [
  { id: 'name', label: 'Organização' },
  { id: 'country', label: 'País' },
  { id: 'segment', label: 'Segmento' },
  { id: 'size', label: 'Porte' },
  { id: 'mission', label: 'Missão' },
  { id: 'vision', label: 'Visão' }
];

const renderStep = (
  stepId: WizardStep['id'],
  { formState, values, setValue, setStepIndex, selectedCountry, suggestedCountry, summaryStatus }: StepRendererProps
) => {
  switch (stepId) {
    case 'name':
      return (
        <Input
          label="Qual é o nome da organização?"
          placeholder="Ex.: DataInova Consultoria LTDA"
          value={values.name}
          onChange={(event) => setValue('name', event.target.value, { shouldValidate: true })}
          description="Vamos começar pelo essencial. O nome aparece em convites e dashboards executivos."
          error={formState.errors.name?.message}
        />
      );
    case 'country':
      return (
        <div className="space-y-4">
          <CountryCombobox
            label="Onde está a operação predominante?"
            value={values.country}
            onChange={(code) => setValue('country', code, { shouldValidate: true, shouldDirty: true })}
            error={formState.errors.country?.message}
            suggestedCountry={suggestedCountry}
            selectedCountry={selectedCountry}
          />
          <CountryDerivedInfo country={selectedCountry} />
        </div>
      );
    case 'segment':
      return (
        <div className="space-y-3">
          <Input
            label="Qual é o segmento primário?"
            placeholder="Tecnologia, Varejo, Consultoria..."
            value={values.segment}
            onChange={(event) => setValue('segment', event.target.value, { shouldValidate: true })}
            description={`Sugestões: ${segmentSuggestions.join(', ')}`}
            error={formState.errors.segment?.message}
          />
          <div className="flex flex-wrap gap-2">
            {segmentSuggestions.map((suggestion) => {
              const isSelected =
                values.segment.toLowerCase().trim() === suggestion.toLowerCase().trim();
              return (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setValue('segment', suggestion, { shouldValidate: true, shouldDirty: true })}
                  className={`rounded-full border px-3 py-1 text-xs transition duration-200 ease-brand ${
                    isSelected
                      ? 'border-brand-500/60 bg-brand-500/15 text-brand-50'
                      : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-brand-500/40 hover:bg-brand-500/10'
                  }`}
                  aria-pressed={isSelected}
                >
                  {suggestion}
                </button>
              );
            })}
          </div>
        </div>
      );
    case 'size':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {sizeOptions.map((option) => {
            const isSelected = values.size === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setValue('size', option.value, { shouldValidate: true })}
                className={`rounded-2xl border p-5 text-left transition duration-200 ease-brand ${
                  isSelected
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-50'
                    : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-brand-500/40 hover:bg-brand-500/10'
                }`}
                aria-pressed={isSelected}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="mt-2 text-xs text-slate-400">{option.description}</p>
              </button>
            );
          })}
          {formState.errors.size ? (
            <p className="col-span-full text-xs text-danger-400">{formState.errors.size.message}</p>
          ) : null}
        </div>
      );
    case 'mission':
      return (
        <Textarea
          label="Por que a organização existe?"
          placeholder="Empoderar equipes com dados confiáveis..."
          value={values.mission}
          onChange={(event) => setValue('mission', event.target.value, { shouldValidate: true })}
          description="Conte a razão de existir da empresa em 140 a 360 caracteres."
          minLength={140}
          maxLength={360}
          error={formState.errors.mission?.message}
        />
      );
    case 'vision':
      return (
        <Textarea
          label="Onde desejam chegar em 3 – 5 anos?"
          placeholder="Ser a plataforma líder em execução estratégica na América Latina..."
          value={values.vision}
          onChange={(event) => setValue('vision', event.target.value, { shouldValidate: true })}
          description="Descreva o horizonte aspiracional dos próximos anos. Use linguagem concreta e mensurável."
          minLength={140}
          maxLength={360}
          error={formState.errors.vision?.message}
        />
      );
    case 'summary':
      return (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Confira se está tudo certo. Você pode editar qualquer item clicando no cartão correspondente.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {reviewFields.map((field) => {
              const targetIndex = steps.findIndex((step) => step.id === field.id);
              const fieldComplete = summaryStatus[field.id];
              let displayValue = String(values[field.id] ?? '—') || '—';
              if (field.id === 'country') {
                displayValue = selectedCountry
                  ? `${selectedCountry.label} (${selectedCountry.code})`
                  : displayValue;
              }
              if (field.id === 'size') {
                const sizeLabel = sizeOptions.find((option) => option.value === values.size)?.label;
                displayValue = sizeLabel ?? displayValue;
              }
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => targetIndex >= 0 && setStepIndex(targetIndex)}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-left transition hover:border-brand-500/40 hover:bg-brand-500/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{field.label}</p>
                    <span
                      className={`text-xs font-semibold ${
                        fieldComplete ? 'text-success-300' : 'text-warning-300'
                      }`}
                    >
                      {fieldComplete ? 'Pronto' : 'Pendente'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">
                    {displayValue}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      );
    default:
      return null;
  }
};

const MAX_COUNTRY_RESULTS = 12;

type CountryComboboxProps = {
  label: string;
  value: string;
  onChange: (code: string) => void;
  error?: string;
  suggestedCountry?: CountryInfo;
  selectedCountry?: CountryInfo;
};

const formatCountryOption = (country: CountryInfo) => `${country.label} (${country.code})`;

const CountryCombobox = ({
  label,
  value,
  onChange,
  error,
  suggestedCountry,
  selectedCountry
}: CountryComboboxProps) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = 'onboarding-country-listbox';

  useEffect(() => {
    if (selectedCountry) {
      setQuery(formatCountryOption(selectedCountry));
    } else if (!value) {
      setQuery('');
    } else {
      setQuery(value.toUpperCase());
    }
  }, [selectedCountry, value]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return countryOptions.slice(0, MAX_COUNTRY_RESULTS);
    }
    return countryOptions
      .filter((option) => {
        const haystack = `${option.label} ${option.code}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, MAX_COUNTRY_RESULTS);
  }, [normalizedQuery]);

  useEffect(() => {
    if (!open) return;
    if (activeIndex >= filteredOptions.length) {
      setActiveIndex(0);
    }
    if (selectedCountry) {
      const currentIndex = filteredOptions.findIndex((option) => option.code === selectedCountry.code);
      if (currentIndex >= 0) {
        setActiveIndex(currentIndex);
      }
    }
  }, [filteredOptions, activeIndex, open, selectedCountry]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: CountryInfo) => {
    setQuery(formatCountryOption(option));
    onChange(option.code);
    setOpen(false);
    setActiveIndex(0);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    const trimmed = nextQuery.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    const matchByCode = countryOptions.find(
      (option) => option.code.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchByCode) {
      onChange(matchByCode.code);
      return;
    }
    const matchByLabel = countryOptions.find(
      (option) => option.label.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchByLabel) {
      onChange(matchByLabel.code);
      return;
    }
    if (value) {
      onChange('');
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => {
        if (!filteredOptions.length) return 0;
        return Math.min(index + 1, filteredOptions.length - 1);
      });
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => {
        if (!filteredOptions.length) return 0;
        return Math.max(index - 1, 0);
      });
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (open && option) {
        handleSelect(option);
      } else {
        const trimmed = query.trim();
        const directMatch = countryOptions.find(
          (country) => country.code.toLowerCase() === trimmed.toLowerCase()
        );
        if (directMatch) {
          handleSelect(directMatch);
        }
      }
      setOpen(false);
    }
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const suggestionText =
    suggestedCountry && suggestedCountry.code !== selectedCountry?.code
      ? `Sugestão automática: ${formatCountryOption(suggestedCountry)}`
      : 'Busque por nome ou código ISO de 2 letras.';

  const activeOption = open && filteredOptions[activeIndex] ? filteredOptions[activeIndex] : undefined;

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        label={label}
        placeholder="Busque por nome ou código ISO (ex.: Brasil ou BR)"
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOption ? `country-${activeOption.code}` : undefined}
        error={error}
        autoComplete="off"
        name="country"
        id="onboarding-country"
        description={suggestionText}
      />

      {open ? (
        filteredOptions.length ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/95 p-1 shadow-elevated backdrop-blur"
          >
            {filteredOptions.map((option, index) => {
              const isActive = index === activeIndex;
              const isSelected = selectedCountry?.code === option.code;
              return (
                <li key={option.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    id={`country-${option.code}`}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition duration-150 ease-brand ${
                      isActive
                        ? 'border-brand-500/60 bg-brand-500/10 text-brand-50'
                        : 'border-transparent text-slate-200 hover:border-brand-500/30 hover:bg-brand-500/5'
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(option);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span>{option.label}</span>
                    <span className="text-xs text-slate-400">{option.code}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="absolute left-0 right-0 z-20 mt-2 rounded-2xl border border-slate-800 bg-slate-950/95 px-4 py-3 text-sm text-slate-300 shadow-elevated">
            Nenhum país encontrado. Ajuste a busca ou utilize o código ISO (ex.: BR).
          </div>
        )
      ) : null}
    </div>
  );
};

const normalizeLocale = (locale: string | undefined, code: string) => {
  if (!locale) return `en-${code}`;
  const [language, region] = locale.split(/[-_]/);
  return `${(language ?? 'en').toLowerCase()}-${(region ?? code).toUpperCase()}`;
};

const CountryDerivedInfo = ({ country }: { country?: CountryInfo }) => {
  if (!country) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400">
        Selecione um país para derivar timezone, moeda e locale sugeridos. Você pode ajustar depois em Settings &gt;
        Organização.
      </div>
    );
  }

  const locale = normalizeLocale(country.locale, country.code);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Derivações automáticas</p>
      <dl className="mt-3 grid gap-3 text-sm text-slate-200 md:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Fuso horário padrão</dt>
          <dd className="mt-1">{country.timezone ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Moeda de referência</dt>
          <dd className="mt-1">{country.currency ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Locale sugerido</dt>
          <dd className="mt-1">{locale}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-400">
        Ajuste timezone, moeda ou locale em Settings &gt; Organização quando necessário.
      </p>
    </div>
  );
};

export default OnboardingWizardPage;
