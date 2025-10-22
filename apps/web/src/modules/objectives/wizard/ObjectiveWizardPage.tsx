import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import {
  FormProvider,
  useFieldArray,
  useForm,
  type FieldArrayWithId,
  type FieldPath,
  type FormState,
  type UseFieldArrayAppend,
  type UseFieldArrayRemove,
  type UseFormSetValue
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Cadence } from '@datainova/common';
import { Stepper } from '../../../design-system/components/Stepper';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Textarea } from '../../../design-system/components/Textarea';
import { DateRangePicker } from '../../../design-system/components/DateRangePicker';
import { ChipInput } from '../../../design-system/components/ChipInput';
import { Card } from '../../../design-system/components/Card';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { useAutosave } from '../../../core/hooks/useAutosave';
import { useToast } from '../../../design-system/feedback/useToast';
import { FormSavePulse } from '../../../design-system/motion/FormSavePulse';
import { useCreateObjectiveMutation, type CreateObjectiveInput } from '../api/objectiveApi';

const STORAGE_KEY = 'datainova:objective-wizard';
const STEP_KEY = 'datainova:objective-wizard-step';

const segmentSchema = z.object({
  label: z.string().min(2, 'Informe um rótulo'),
  code: z
    .string()
    .min(2, 'Código curto obrigatório')
    .max(12, 'Use até 12 caracteres'),
  values: z
    .array(z.string().min(1, 'Valor inválido'))
    .min(1, 'Adicione ao menos um valor')
    .max(12, 'Limite de 12 valores por eixo')
});

const baseObjectiveSchema = z.object({
  title: z
    .string()
    .min(4, 'Título deve ter ao menos 4 caracteres')
    .max(120, 'Limite de 120 caracteres'),
  description: z
    .string()
    .min(20, 'Descreva o contexto com ao menos 20 caracteres')
    .max(500, 'Limite de 500 caracteres'),
  cadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'BIENNIAL']),
  timeRange: z
    .object({
      start: z.string(),
      end: z.string()
    })
    .refine((range) => new Date(range.start) < new Date(range.end), {
      message: 'A data final deve ser posterior à inicial',
      path: ['end']
    }),
  segments: z.array(segmentSchema).max(5, 'Limite de 5 eixos').default([])
});

const objectiveSchema = baseObjectiveSchema.superRefine((value, ctx) => {
  const minDays = cadenceMinimumDays[value.cadence];
  const diff = differenceInDays(value.timeRange.start, value.timeRange.end);
  if (diff < minDays) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['timeRange', 'end'],
      message: `Para cadência ${cadenceLabel(value.cadence)} use uma janela mínima de ${minDays} dias.`
    });
  }
});

type ObjectiveFormValues = z.infer<typeof objectiveSchema>;

const wizardSteps = [
  { id: 'title', label: 'Título', description: 'Enuncie o objetivo estratégico.' },
  { id: 'description', label: 'Descrição', description: 'Explique o impacto e o contexto.' },
  { id: 'cadence', label: 'Cadência', description: 'Selecione como o objetivo será acompanhado.' },
  { id: 'timeRange', label: 'Janela', description: 'Determine o período de vigência.' },
  { id: 'segments', label: 'Segmentação', description: 'Opcional, refine análises por eixos.' },
  { id: 'summary', label: 'Resumo', description: 'Revise e confirme o objetivo.' }
] as const;

type WizardStepId = (typeof wizardSteps)[number]['id'];

type ObjectiveFieldPath = FieldPath<ObjectiveFormValues>;

const stepValidationFields: Record<WizardStepId, ObjectiveFieldPath[]> = {
  title: ['title'],
  description: ['description'],
  cadence: ['cadence'],
  timeRange: ['timeRange.start', 'timeRange.end'],
  segments: ['segments'],
  summary: []
};

const cadenceOptions: Array<{
  value: Cadence;
  label: string;
  description: string;
}> = [
  { value: 'DAILY', label: 'Diária', description: 'Acompanhamento dia a dia para iniciativas críticas.' },
  { value: 'WEEKLY', label: 'Semanal', description: 'Ritmo operacional com checkpoints frequentes.' },
  { value: 'MONTHLY', label: 'Mensal', description: 'Oscilações mensais e visão macro contínua.' },
  { value: 'QUARTERLY', label: 'Trimestral', description: 'Boa para OKRs padrão.' },
  { value: 'SEMIANNUAL', label: 'Semestral', description: 'Horizonte de transformação.' },
  { value: 'ANNUAL', label: 'Anual', description: 'Objetivos estruturantes de longo prazo.' },
  { value: 'BIENNIAL', label: 'Bienal', description: 'Transformações amplas com roadmap de 24 meses.' }
];

const cadenceMinimumDays: Record<Cadence, number> = {
  DAILY: 7,
  WEEKLY: 28,
  MONTHLY: 90,
  QUARTERLY: 90,
  SEMIANNUAL: 180,
  ANNUAL: 365,
  BIENNIAL: 730
};

const DAY_IN_MS = 86_400_000;

const differenceInDays = (start: string, end: string) => {
  if (!start || !end) return 0;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.floor((endDate.getTime() - startDate.getTime()) / DAY_IN_MS);
};

const addDays = (isoDate: string, amount: number) => {
  const base = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) {
    return isoDate;
  }
  base.setDate(base.getDate() + amount);
  return base.toISOString().slice(0, 10);
};

const defaultValues: ObjectiveFormValues = {
  title: '',
  description: '',
  cadence: 'QUARTERLY',
  timeRange: {
    start: new Date().toISOString().slice(0, 10),
    end: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().slice(0, 10)
  },
  segments: []
};

const loadDraft = (): ObjectiveFormValues | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const partial = baseObjectiveSchema.partial().parse(JSON.parse(stored));
    return {
      ...defaultValues,
      ...partial,
      timeRange: {
        ...defaultValues.timeRange,
        ...(partial.timeRange ?? {})
      },
      segments: partial.segments ?? []
    };
  } catch (error) {
    console.warn('Falha ao carregar rascunho de objetivo', error);
    return null;
  }
};

const loadStep = (): number => {
  const stored = window.localStorage.getItem(STEP_KEY);
  const index = Number.parseInt(stored ?? '0', 10);
  if (Number.isNaN(index)) return 0;
  return Math.min(Math.max(index, 0), wizardSteps.length - 1);
};

const motionVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

const ObjectiveWizardPage = () => {
  const draft = useMemo(() => loadDraft(), []);
  const [stepIndex, setStepIndex] = useState(loadStep);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [completedObjectiveId, setCompletedObjectiveId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { mutateAsync: createObjective, isPending } = useCreateObjectiveMutation();
  const shouldReduceMotion = useReducedMotion();
  const methods = useForm<ObjectiveFormValues>({
    resolver: zodResolver(objectiveSchema),
    mode: 'onChange',
    defaultValues: draft ?? defaultValues
  });
  const { control, formState, handleSubmit, setValue, trigger, watch, reset } = methods;
  const values = watch();
  const currentStep = wizardSteps[stepIndex];
  const isLastStep = currentStep.id === 'summary';
  const stepTransition = useMemo(
    () =>
      shouldReduceMotion
        ? { duration: 0 }
        : { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
    [shouldReduceMotion]
  );

  const { fields: segmentFields, append: appendSegment, remove: removeSegment } = useFieldArray({
    control,
    name: 'segments'
  });

  const persistDraft = useCallback(
    (payload: ObjectiveFormValues) => {
      try {
        setSaveState('saving');
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        window.localStorage.setItem(STEP_KEY, String(stepIndex));
        window.setTimeout(() => setSaveState('saved'), 300);
      } catch (error) {
        console.error('Erro ao salvar rascunho de objetivo', error);
      }
    },
    [stepIndex]
  );

  useAutosave(values, persistDraft, { delay: 600, enabled: !completedObjectiveId });

  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = window.setTimeout(() => setSaveState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
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

  useEffect(() => {
    const minDays = cadenceMinimumDays[values.cadence];
    const { start, end } = values.timeRange;
    if (!start || !end) return;
    const diff = differenceInDays(start, end);
    if (diff < minDays) {
      const adjustedEnd = addDays(start, minDays);
      setValue(
        'timeRange',
        { start, end: adjustedEnd },
        { shouldValidate: true, shouldDirty: true }
      );
    }
  }, [setValue, values.cadence, values.timeRange.end, values.timeRange.start]);

  const goNext = async () => {
    const fieldsToValidate = stepValidationFields[currentStep.id];
    if (fieldsToValidate.length && !(await trigger(fieldsToValidate))) {
      return;
    }
    if (isLastStep) {
      handleSubmit(onSubmit)();
    } else {
      setStepIndex((index) => Math.min(index + 1, wizardSteps.length - 1));
    }
  };

  const goPrevious = () => {
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const onSubmit = async (formValues: ObjectiveFormValues) => {
    try {
      const payload = mapFormToPayload(formValues);
      const objectiveId = await createObjective(payload);
      setCompletedObjectiveId(objectiveId);
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(STEP_KEY);
      showToast({
        title: 'Objetivo criado com sucesso',
        description: 'Agora cadastre os resultados-chave alinhados à cadência definida.',
        variant: 'success'
      });
      reset(defaultValues);
      setStepIndex(0);
      navigate(`/objectives/${objectiveId}`);
    } catch (error) {
      console.error('Falha ao criar objetivo', error);
      showToast({
        title: 'Erro ao criar objetivo',
        description: 'Verifique os dados e tente novamente.',
        variant: 'error'
      });
    }
  };

  const summaryData = useMemo(
    () => [
      { label: 'Título', value: values.title },
      { label: 'Descrição', value: values.description },
      { label: 'Cadência', value: cadenceLabel(values.cadence) },
      {
        label: 'Janela',
        value: `${formatDate(values.timeRange.start)} → ${formatDate(values.timeRange.end)}`
      },
      {
        label: 'Segmentação',
        value: values.segments.length ? `${values.segments.length} eixos configurados` : 'Sem segmentação no momento'
      }
    ],
    [values]
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Objetivo estratégico"
        title="Defina um direcionamento claro e mensurável"
        description="Objetivos alinham times e alimentam wizards de KR e KPI. Cadastre com contexto rico e segmentações consistentes."
        actions={
          <span className="text-xs text-slate-400" aria-live="polite">
            {saveState === 'saving' && 'Salvando rascunho...'}
            {saveState === 'saved' && 'Rascunho salvo'}
          </span>
        }
      />

      <Card subtitle={currentStep.description}>
        <FormProvider {...methods}>
          <form
            className="space-y-8"
            onSubmit={(event) => {
              event.preventDefault();
              void goNext();
            }}
          >
            <Stepper
              steps={wizardSteps.map((step, index) => ({
                id: step.id,
                label: step.label,
                status:
                  index < stepIndex ? 'completed' : index === stepIndex ? 'current' : 'upcoming'
              }))}
              current={stepIndex}
              allowNavigation
              onStepSelect={setStepIndex}
            />

            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep.id}
                variants={motionVariants}
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
                  segmentFields,
                  appendSegment,
                  removeSegment,
                  setStepIndex
                })}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={goPrevious} disabled={stepIndex === 0}>
                Voltar
              </Button>
              <FormSavePulse active={saveState === 'saving'}>
                <Button type="submit" isLoading={isPending}>
                  {isLastStep ? 'Concluir objetivo' : 'Avançar'}
                </Button>
              </FormSavePulse>
            </div>
          </form>
        </FormProvider>
      </Card>

      <Card title="Resumo" subtitle="Valide rapidamente se os dados estão coerentes.">
        <dl className="grid gap-4 md:grid-cols-2">
          {summaryData.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
              <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</dt>
              <dd className="mt-2 text-sm text-slate-200">{item.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
};

type StepRendererProps = {
  formState: FormState<ObjectiveFormValues>;
  values: ObjectiveFormValues;
  setValue: UseFormSetValue<ObjectiveFormValues>;
  segmentFields: FieldArrayWithId<ObjectiveFormValues, 'segments', 'id'>[];
  appendSegment: UseFieldArrayAppend<ObjectiveFormValues, 'segments'>;
  removeSegment: UseFieldArrayRemove;
  setStepIndex: (index: number) => void;
};

const renderStep = (
  stepId: WizardStepId,
  { formState, values, setValue, segmentFields, appendSegment, removeSegment, setStepIndex }: StepRendererProps
) => {
  switch (stepId) {
    case 'title':
      return (
        <Input
          label="Qual o enunciado do objetivo?"
          placeholder="Ex.: Aumentar a receita em canais parceiros"
          value={values.title}
          onChange={(event) => setValue('title', event.target.value, { shouldValidate: true })}
          error={formState.errors.title?.message}
        />
      );
    case 'description':
      return (
        <Textarea
          label="Descreva o contexto e resultado esperado"
          placeholder="Explique o impacto desejado, escopo, principais stakeholders e como o sucesso será avaliado."
          value={values.description}
          onChange={(event) => setValue('description', event.target.value, { shouldValidate: true })}
          error={formState.errors.description?.message}
        />
      );
    case 'cadence':
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-white">Com qual cadência iremos medir progresso?</p>
            <p className="text-xs text-slate-400">KRs podem ser mais finos, nunca mais grossos que o objetivo.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {cadenceOptions.map((option) => {
              const isSelected = values.cadence === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setValue('cadence', option.value, { shouldValidate: true })}
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
          </div>
        </div>
      );
    case 'timeRange': {
      const minDays = cadenceMinimumDays[values.cadence];
      return (
        <DateRangePicker
          label="Qual o período de vigência?"
          value={values.timeRange}
          onChange={(range) => setValue('timeRange', range, { shouldValidate: true })}
          error={formState.errors.timeRange?.end?.message}
          description={`Mínimo de ${minDays} dias para objetivos ${cadenceLabel(values.cadence).toLowerCase()}.`}
        />
      );
    }
    case 'segments': {
      const segmentPreview = values.segments.length
        ? JSON.stringify(
            values.segments.map((segment) => ({
              axis: segment.code,
              values: segment.values
            })),
            null,
            2
          )
        : null;
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Segmentação opcional</p>
              <p className="text-xs text-slate-400">
                Use eixos como Região, Canal ou Segmento de cliente para análises futuras. Limite de 5 eixos.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                appendSegment({
                  label: `Novo eixo ${segmentFields.length + 1}`,
                  code: `AX${segmentFields.length + 1}`,
                  values: []
                })
              }
              disabled={segmentFields.length >= 5}
            >
              Adicionar eixo
            </Button>
          </div>

          {segmentFields.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-sm text-slate-400">
              Nenhum eixo configurado. Você pode prosseguir sem segmentação e adicionar depois.
            </div>
          ) : (
            <div className="space-y-4">
              {segmentFields.map((axis, index) => (
                <div key={axis.id} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <Input
                      label="Rótulo do eixo"
                      value={values.segments[index]?.label ?? ''}
                      onChange={(event) =>
                        setValue(`segments.${index}.label`, event.target.value, { shouldValidate: true })
                      }
                      error={formState.errors.segments?.[index]?.label?.message}
                    />
                    <Input
                      label="Código"
                      value={values.segments[index]?.code ?? ''}
                      onChange={(event) =>
                        setValue(`segments.${index}.code`, event.target.value.toUpperCase(), {
                          shouldValidate: true
                        })
                      }
                      error={formState.errors.segments?.[index]?.code?.message}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSegment(index)}
                    >
                      Remover
                    </Button>
                  </div>
                  <ChipInput
                    label="Valores"
                    values={values.segments[index]?.values ?? []}
                    onChange={(items) => setValue(`segments.${index}.values`, items, { shouldValidate: true })}
                    error={formState.errors.segments?.[index]?.values?.message}
                    description="Adicione valores que existam nas fontes de dados oficiais."
                  />
                </div>
              ))}
            </div>
          )}
          {segmentPreview ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Prévia de chave</p>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{segmentPreview}</pre>
            </div>
          ) : null}
        </div>
      );
    }
    case 'summary':
      return (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Revise os dados antes de concluir. Clique em uma seção para voltar rapidamente e ajustar.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {wizardSteps
              .filter((step) => step.id !== 'summary')
              .map((step) => {
                const targetIndex = wizardSteps.findIndex((item) => item.id === step.id);
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => targetIndex >= 0 && setStepIndex(targetIndex)}
                    className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-left transition hover:border-brand-500/40 hover:bg-brand-500/10"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{step.label}</p>
                    <p className="mt-2 text-sm text-slate-200">
                      {summaryValueForStep(step.id, values, segmentFields.length)}
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

const summaryValueForStep = (stepId: WizardStepId, values: ObjectiveFormValues, segmentsCount: number) => {
  switch (stepId) {
    case 'title':
      return values.title || '—';
    case 'description':
      return values.description || '—';
    case 'cadence':
      return cadenceLabel(values.cadence);
    case 'timeRange':
      return `${formatDate(values.timeRange.start)} → ${formatDate(values.timeRange.end)}`;
    case 'segments':
      return segmentsCount ? `${segmentsCount} eixos configurados` : 'Sem segmentação';
    default:
      return '—';
  }
};

const normalizeSegmentCode = (value: string, fallback: string) => {
  const sanitized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return sanitized || fallback;
};

const mapFormToPayload = (values: ObjectiveFormValues): CreateObjectiveInput => ({
  title: values.title,
  description: values.description,
  cadence: values.cadence,
  startDate: values.timeRange.start,
  endDate: values.timeRange.end,
  segments: values.segments.map((segment, segmentIndex) => ({
    label: segment.label,
    code: segment.code.toUpperCase(),
    values: segment.values.map((value, valueIndex) => ({
      value,
      code: normalizeSegmentCode(value, `SEG_${segmentIndex + 1}_${valueIndex + 1}`)
    }))
  }))
});

const cadenceLabel = (cadence: Cadence) => {
  switch (cadence) {
    case 'DAILY':
      return 'Diária';
    case 'WEEKLY':
      return 'Semanal';
    case 'MONTHLY':
      return 'Mensal';
    case 'QUARTERLY':
      return 'Trimestral';
    case 'SEMIANNUAL':
      return 'Semestral';
    case 'ANNUAL':
      return 'Anual';
    case 'BIENNIAL':
      return 'Bienal';
    default:
      return cadence;
  }
};

const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

export default ObjectiveWizardPage;
