import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { AnimatePresence, motion } from 'framer-motion';
import type { Cadence, IndicatorDirection } from '@datainova/common';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Stepper } from '../../../design-system/components/Stepper';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Textarea } from '../../../design-system/components/Textarea';
import { DateRangePicker } from '../../../design-system/components/DateRangePicker';
import { ChipInput } from '../../../design-system/components/ChipInput';
import { Select } from '../../../design-system/components/Select';
import { Card } from '../../../design-system/components/Card';
import { useAutosave } from '../../../core/hooks/useAutosave';
import { useToast } from '../../../design-system/feedback/useToast';
import { FormSavePulse } from '../../../design-system/motion/FormSavePulse';
import { useCreateKeyResultMutation, type CreateKeyResultInput } from '../api/kresultApi';
import { useObjectiveDetailQuery } from '../../objectives/api/objectiveApi';
import type { SegmentAxis } from '../../../core/types/strategic';

const segmentSchema = z.object({
  label: z.string().min(2, 'Informe um rótulo'),
  code: z.string().min(2, 'Código obrigatório').max(12, 'Use até 12 caracteres'),
  values: z.array(z.string().min(1)).min(1, 'Adicione ao menos um valor').max(12)
});

const krSchema = z.object({
  title: z.string().min(4, 'Informe um título claro').max(140, 'Limite de 140 caracteres'),
  description: z.string().min(20, 'Detalhe o indicador com pelo menos 20 caracteres').max(400),
  direction: z.enum(['INCREASE', 'DECREASE', 'MAINTAIN']),
  unit: z.enum(['PERCENT', 'NUMBER', 'CURRENCY']),
  targetValue: z.number().positive('Informe a meta alvo'),
  baselineValue: z.number().nonnegative('Informe o valor atual'),
  cadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
  timeRange: z
    .object({ start: z.string(), end: z.string() })
    .refine((range) => new Date(range.start) < new Date(range.end), {
      message: 'A data final deve ser posterior à inicial',
      path: ['end']
    }),
  segments: z.array(segmentSchema).max(5).default([])
});

type KrFormValues = z.infer<typeof krSchema>;

type StepId = 'about' | 'measurement' | 'cadence' | 'segments' | 'summary';

const steps: Array<{ id: StepId; label: string; description: string }> = [
  { id: 'about', label: 'Contexto', description: 'Defina o título e o propósito do resultado.' },
  { id: 'measurement', label: 'Medição', description: 'Direção, unidade e metas.' },
  { id: 'cadence', label: 'Cadência', description: 'Período de acompanhamento.' },
  { id: 'segments', label: 'Segmentação', description: 'Opcional, refine por eixos.' },
  { id: 'summary', label: 'Resumo', description: 'Revise e confirme o resultado-chave.' }
];

const directionCopy: Record<IndicatorDirection, string> = {
  INCREASE: 'Aumentar',
  DECREASE: 'Reduzir',
  MAINTAIN: 'Manter'
};

const unitCopy = {
  PERCENT: 'Percentual',
  NUMBER: 'Número absoluto',
  CURRENCY: 'Financeiro'
} as const;

type KrFieldPath = FieldPath<KrFormValues>;

const allowedKrCadences: readonly KrFormValues['cadence'][] = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL'
] as const;

const allowedKrCadenceSet = new Set<KrFormValues['cadence']>(allowedKrCadences);

const coerceCadence = (cadence: Cadence): KrFormValues['cadence'] =>
  allowedKrCadenceSet.has(cadence as KrFormValues['cadence'])
    ? (cadence as KrFormValues['cadence'])
    : 'ANNUAL';

const stepValidationFields: Record<StepId, KrFieldPath[]> = {
  about: ['title', 'description'],
  measurement: ['direction', 'unit', 'targetValue', 'baselineValue'],
  cadence: ['cadence', 'timeRange.start', 'timeRange.end'],
  segments: ['segments'],
  summary: []
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

const KrWizardPage = () => {
  const { objectiveId = '' } = useParams();
  const navigate = useNavigate();
  const { data: objective } = useObjectiveDetailQuery(objectiveId);
  const storageKey = `datainova:kr-wizard:${objectiveId}`;
  const stepStorageKey = `datainova:kr-step:${objectiveId}`;
  const { showToast } = useToast();
  const [stepIndex, setStepIndex] = useState(() => loadStep(stepStorageKey));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const { mutateAsync: createKeyResult, isPending } = useCreateKeyResultMutation();

  const methods = useForm<KrFormValues>({
    resolver: zodResolver(krSchema),
    mode: 'onChange',
    defaultValues: loadDraft(storageKey) ?? getDefaultValues(objective)
  });

  const { control, formState, handleSubmit, setValue, trigger, watch, reset } = methods;
  const values = watch();
  const currentStep = steps[stepIndex];
  const isLastStep = currentStep.id === 'summary';

  const { fields: segmentFields, append: appendSegment, remove: removeSegment } = useFieldArray({
    control,
    name: 'segments'
  });

  useEffect(() => {
    if (!objective) return;
    setValue('cadence', coerceCadence(objective.cadence), { shouldValidate: true, shouldDirty: false });
    setValue(
      'timeRange',
      { start: objective.startDate, end: objective.endDate },
      { shouldValidate: true, shouldDirty: false }
    );
  }, [objective, setValue]);

  const persistDraft = useCallback(
    (payload: KrFormValues) => {
      try {
        setSaveState('saving');
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
        window.localStorage.setItem(stepStorageKey, String(stepIndex));
        window.setTimeout(() => setSaveState('saved'), 280);
      } catch (error) {
        console.error('Erro ao salvar rascunho de KR', error);
      }
    },
    [stepIndex, storageKey, stepStorageKey]
  );

  useAutosave(values, persistDraft, { delay: 600 });

  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = window.setTimeout(() => setSaveState('idle'), 1200);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const goNext = async () => {
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

  const goPrevious = () => setStepIndex((index) => Math.max(index - 1, 0));

  const onSubmit = async (formValues: KrFormValues) => {
    if (!objectiveId) return;
    const payload = mapFormToPayload(formValues, objectiveId);
    const keyResult = await createKeyResult(payload);
    window.localStorage.removeItem(storageKey);
    window.localStorage.removeItem(stepStorageKey);
    showToast({
      title: 'Resultado-chave criado',
      description: 'Mantenha a cadência de atualização com check-ins semanais.',
      variant: 'success'
    });
    reset(getDefaultValues(objective));
    setStepIndex(0);
    navigate(`/objectives/${objectiveId}`);
  };

  const summaryItems = useMemo(
    () => [
      { label: 'Título', value: values.title },
      { label: 'Direção', value: directionCopy[values.direction] },
      { label: 'Unidade', value: unitCopy[values.unit] },
      {
        label: 'Meta',
        value: formatValue(values.unit, values.targetValue)
      },
      {
        label: 'Baseline',
        value: formatValue(values.unit, values.baselineValue)
      },
      {
        label: 'Cadência',
        value: values.cadence
      },
      {
        label: 'Janela',
        value: `${formatDate(values.timeRange.start)} → ${formatDate(values.timeRange.end)}`
      }
    ],
    [values]
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="KResult"
        title="Crie um resultado-chave mensurável"
        description={objective ? `Conectado ao objetivo: ${objective.title}` : 'Selecione um objetivo para vincular.'}
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
              steps={steps.map((step, index) => ({
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
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6"
              >
                {renderStep(currentStep.id, {
                  formState,
                  values,
                  setValue,
                  segmentFields,
                  appendSegment,
                  removeSegment,
                  setStepIndex,
                  objective
                })}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={goPrevious} disabled={stepIndex === 0}>
                Voltar
              </Button>
              <FormSavePulse active={saveState === 'saving'}>
                <Button type="submit" isLoading={isPending}>
                  {isLastStep ? 'Concluir KR' : 'Avançar'}
                </Button>
              </FormSavePulse>
            </div>
          </form>
        </FormProvider>
      </Card>

      <Card title="Resumo" subtitle="Confirme se os números refletem a ambição desejada.">
        <dl className="grid gap-4 md:grid-cols-2">
          {summaryItems.map((item) => (
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
  formState: FormState<KrFormValues>;
  values: KrFormValues;
  setValue: UseFormSetValue<KrFormValues>;
  segmentFields: FieldArrayWithId<KrFormValues, 'segments', 'id'>[];
  appendSegment: UseFieldArrayAppend<KrFormValues, 'segments'>;
  removeSegment: UseFieldArrayRemove;
  setStepIndex: (index: number) => void;
  objective?: { cadence: Cadence; startDate: string; endDate: string } | null;
};

const renderStep = (
  stepId: StepId,
  { formState, values, setValue, segmentFields, appendSegment, removeSegment, setStepIndex, objective }: StepRendererProps
) => {
  switch (stepId) {
    case 'about':
      return (
        <div className="space-y-4">
          <Input
            label="Título do resultado-chave"
            placeholder="Ex.: Aumentar MRR mensal em R$ 200k"
            value={values.title}
            onChange={(event) => setValue('title', event.target.value, { shouldValidate: true })}
            error={formState.errors.title?.message}
          />
          <Textarea
            label="Descrição"
            placeholder="Detalhe o indicador, fontes de dados e critérios de aceitação."
            value={values.description}
            onChange={(event) => setValue('description', event.target.value, { shouldValidate: true })}
            error={formState.errors.description?.message}
          />
        </div>
      );
    case 'measurement':
      return (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {(['INCREASE', 'DECREASE', 'MAINTAIN'] as IndicatorDirection[]).map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => setValue('direction', direction, { shouldValidate: true })}
                className={`rounded-2xl border p-4 text-left transition ${
                  values.direction === direction
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-50'
                    : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-brand-500/40 hover:bg-brand-500/10'
                }`}
              >
                <p className="text-sm font-semibold">{directionCopy[direction]}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {direction === 'INCREASE'
                    ? 'Indicador deve crescer ao longo da cadência.'
                    : direction === 'DECREASE'
                    ? 'Busca redução progressiva com sustentação.'
                    : 'Manter dentro de faixa saudável.'}
                </p>
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Unidade"
              value={values.unit}
              onChange={(event) => setValue('unit', event.target.value as KrFormValues['unit'], { shouldValidate: true })}
              error={formState.errors.unit?.message}
            >
              <option value="NUMBER">Número absoluto</option>
              <option value="PERCENT">Percentual</option>
              <option value="CURRENCY">Financeiro</option>
            </Select>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Baseline"
                type="number"
                value={values.baselineValue}
                onChange={(event) =>
                  setValue('baselineValue', Number(event.target.value || 0), { shouldValidate: true })
                }
                error={formState.errors.baselineValue?.message}
              />
              <Input
                label="Meta"
                type="number"
                value={values.targetValue}
                onChange={(event) =>
                  setValue('targetValue', Number(event.target.value || 0), { shouldValidate: true })
                }
                error={formState.errors.targetValue?.message}
              />
            </div>
          </div>
        </div>
      );
    case 'cadence':
      return (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {cadenceOptionsForObjective(objective?.cadence).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setValue('cadence', option.value, { shouldValidate: true })}
                className={`rounded-2xl border p-4 text-left transition ${
                  values.cadence === option.value
                    ? 'border-brand-500/60 bg-brand-500/15 text-brand-50'
                    : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-brand-500/40 hover:bg-brand-500/10'
                }`}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="mt-2 text-xs text-slate-400">{option.description}</p>
              </button>
            ))}
          </div>
          <DateRangePicker
            label="Janela de acompanhamento"
            value={values.timeRange}
            onChange={(range) => setValue('timeRange', range, { shouldValidate: true })}
            error={formState.errors.timeRange?.end?.message}
            min={objective?.startDate}
            max={objective?.endDate}
          />
        </div>
      );
    case 'segments':
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Segmentação opcional</p>
              <p className="text-xs text-slate-400">Replique eixos dos objetivos ou crie recortes específicos.</p>
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
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeSegment(index)}>
                      Remover
                    </Button>
                  </div>
                  <ChipInput
                    label="Valores"
                    values={values.segments[index]?.values ?? []}
                    onChange={(items) => setValue(`segments.${index}.values`, items, { shouldValidate: true })}
                    error={formState.errors.segments?.[index]?.values?.message}
                    description="Use valores consistentes com as fontes oficiais."
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    case 'summary':
      return (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Revise os dados. Clique em qualquer cartão para editar rapidamente.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {steps
              .filter((step) => step.id !== 'summary')
              .map((step) => {
                const targetIndex = steps.findIndex((item) => item.id === step.id);
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => targetIndex >= 0 && setStepIndex(targetIndex)}
                    className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-left transition hover:border-brand-500/40 hover:bg-brand-500/10"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{step.label}</p>
                    <p className="mt-2 text-sm text-slate-200">{summaryValue(step.id, values)}</p>
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

const mapFormToPayload = (values: KrFormValues, objectiveId: string): CreateKeyResultInput => ({
  objectiveId,
  title: values.title,
  description: values.description,
  direction: values.direction,
  unitCode: values.unit,
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

const formatValue = (unit: KrFormValues['unit'], value: number) => {
  if (unit === 'CURRENCY') {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (unit === 'PERCENT') {
    return `${value}%`;
  }
  return value.toLocaleString('pt-BR');
};

const summaryValue = (stepId: StepId, values: KrFormValues) => {
  switch (stepId) {
    case 'about':
      return values.title;
    case 'measurement':
      return `${directionCopy[values.direction]} · ${unitCopy[values.unit]} · Meta ${formatValue(values.unit, values.targetValue)}`;
    case 'cadence':
      return `${values.cadence} · ${formatDate(values.timeRange.start)} → ${formatDate(values.timeRange.end)}`;
    case 'segments':
      return values.segments.length ? `${values.segments.length} eixos configurados` : 'Sem segmentação';
    default:
      return '';
  }
};

const getDefaultValues = (
  objective?: { cadence: Cadence; startDate: string; endDate: string } | null
): KrFormValues => ({
  title: '',
  description: '',
  direction: 'INCREASE',
  unit: 'NUMBER',
  baselineValue: 0,
  targetValue: 100,
  cadence: objective ? coerceCadence(objective.cadence) : 'MONTHLY',
  timeRange: {
    start: objective?.startDate ?? new Date().toISOString().slice(0, 10),
    end:
      objective?.endDate ?? new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().slice(0, 10)
  },
  segments: []
});

const loadDraft = (key: string): KrFormValues | null => {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    const partial = krSchema.partial().parse({
      ...parsed,
      targetValue: Number(parsed.targetValue ?? 0),
      baselineValue: Number(parsed.baselineValue ?? 0)
    });
    const defaults = getDefaultValues(null);
    return {
      ...defaults,
      ...partial,
      timeRange: {
        ...defaults.timeRange,
        ...(partial.timeRange ?? {})
      },
      segments: partial.segments ?? []
    };
  } catch (error) {
    console.warn('Falha ao carregar rascunho de KR', error);
    return null;
  }
};

const loadStep = (key: string) => {
  const stored = window.localStorage.getItem(key);
  const index = Number.parseInt(stored ?? '0', 10);
  if (Number.isNaN(index)) return 0;
  return Math.min(Math.max(index, 0), steps.length - 1);
};

const cadenceLabels: Record<KrFormValues['cadence'], string> = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual'
};

const cadenceDescriptions: Record<KrFormValues['cadence'], string> = {
  DAILY: 'Ideal para squads operacionais e indicadores críticos.',
  WEEKLY: 'Boa para rituais de check-in frequentes.',
  MONTHLY: 'Alinhado a ciclos táticos mensais.',
  QUARTERLY: 'Sincronizado com objetivos trimestrais.',
  SEMIANNUAL: 'Indicadores transformacionais.',
  ANNUAL: 'Metas estruturantes anuais.'
};

const cadenceOptionsForObjective = (objectiveCadence?: Cadence) => {
  const maxCadence = objectiveCadence ? coerceCadence(objectiveCadence) : undefined;
  const maxIndex = maxCadence ? allowedKrCadences.indexOf(maxCadence) : allowedKrCadences.length - 1;

  return allowedKrCadences
    .filter((cadence, index) => (maxIndex >= 0 ? index <= maxIndex : true))
    .map((cadence) => ({
      value: cadence,
      label: cadenceLabels[cadence],
      description: cadenceDescriptions[cadence]
    }));
};

const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

export default KrWizardPage;
