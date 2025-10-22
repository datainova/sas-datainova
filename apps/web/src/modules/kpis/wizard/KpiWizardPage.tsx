import { useMemo, useState } from 'react';
import { z } from 'zod';
import { FormProvider, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Stepper } from '../../../design-system/components/Stepper';
import { Button } from '../../../design-system/components/Button';
import { Input } from '../../../design-system/components/Input';
import { Textarea } from '../../../design-system/components/Textarea';
import { Card } from '../../../design-system/components/Card';
import { Select } from '../../../design-system/components/Select';
import { DateRangePicker } from '../../../design-system/components/DateRangePicker';
import { useCreateKpiMutation } from '../api/kpiApi';
import { useToast } from '../../../design-system/feedback/useToast';
import type { Cadence, IndicatorDirection } from '@datainova/common';

const kpiSchema = z.object({
  title: z.string().min(4, 'Informe um título relevante').max(140),
  description: z.string().min(20, 'Descreva o KPI com pelo menos 20 caracteres').max(400),
  direction: z.enum(['INCREASE', 'DECREASE', 'MAINTAIN']),
  unit: z.enum(['PERCENT', 'NUMBER', 'CURRENCY']),
  baselineValue: z.number().nonnegative('Informe o valor atual'),
  targetValue: z.number().positive('Informe a meta'),
  cadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY']),
  timeRange: z
    .object({
      start: z.string().min(1, 'Informe a data inicial'),
      end: z.string().min(1, 'Informe a data final')
    })
    .refine((range) => range.start <= range.end, {
      message: 'A data final deve ser posterior à inicial',
      path: ['end']
    })
});

type KpiFormValues = z.infer<typeof kpiSchema>;

type StepId = 'context' | 'targets' | 'summary';

const steps: Array<{ id: StepId; label: string; description: string }> = [
  { id: 'context', label: 'Contexto', description: 'Título e propósito do KPI.' },
  { id: 'targets', label: 'Metas', description: 'Unidade, direção e valores.' },
  { id: 'summary', label: 'Resumo', description: 'Revise os dados antes de publicar.' }
];

const directionCopy: Record<IndicatorDirection, string> = {
  INCREASE: 'Aumentar',
  DECREASE: 'Reduzir',
  MAINTAIN: 'Manter'
};

type KpiFieldPath = FieldPath<KpiFormValues>;

const stepValidationFields: Record<StepId, KpiFieldPath[]> = {
  context: ['title', 'description'],
  targets: [
    'direction',
    'unit',
    'baselineValue',
    'targetValue',
    'cadence',
    'timeRange.start',
    'timeRange.end'
  ],
  summary: []
};

const KpiWizardPage = () => {
  const [stepIndex, setStepIndex] = useState(0);
  const { mutateAsync: createKpi, isPending } = useCreateKpiMutation();
  const { showToast } = useToast();

  const methods = useForm<KpiFormValues>({
    resolver: zodResolver(kpiSchema),
    mode: 'onChange',
    defaultValues: {
      title: '',
      description: '',
      direction: 'INCREASE',
      unit: 'NUMBER',
      baselineValue: 0,
      targetValue: 100,
      cadence: 'WEEKLY',
      timeRange: {
        start: new Date().toISOString().slice(0, 10),
        end: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().slice(0, 10)
      }
    }
  });

  const { handleSubmit, setValue, formState, watch } = methods;
  const values = watch();
  const currentStep = steps[stepIndex];
  const isLastStep = currentStep.id === 'summary';

  const goNext = async () => {
    const fieldsToValidate = stepValidationFields[currentStep.id];
    if (fieldsToValidate.length && !(await methods.trigger(fieldsToValidate))) {
      return;
    }
    if (isLastStep) {
      handleSubmit(onSubmit)();
    } else {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }
  };

  const onSubmit = async (data: KpiFormValues) => {
    await createKpi({
      title: data.title,
      description: data.description,
      direction: data.direction,
      unitCode: data.unit,
      cadence: data.cadence,
      startDate: data.timeRange.start,
      endDate: data.timeRange.end
    });
    showToast({
      title: 'KPI criado',
      description: 'Adicione o KPI aos check-ins semanais para garantir visibilidade.',
      variant: 'success'
    });
    methods.reset();
    setStepIndex(0);
  };

  const summary = useMemo(
    () => [
      { label: 'Título', value: values.title || '—' },
      { label: 'Direção', value: directionCopy[values.direction] },
      { label: 'Unidade', value: unitLabel(values.unit) },
      { label: 'Cadência', value: cadenceLabel(values.cadence) },
      { label: 'Período', value: `${formatDate(values.timeRange.start)} → ${formatDate(values.timeRange.end)}` },
      { label: 'Baseline', value: formatValue(values.unit, values.baselineValue) },
      { label: 'Meta', value: formatValue(values.unit, values.targetValue) }
    ],
    [values]
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="KPI"
        title="Cadastre um KPI operacional"
        description="KPIs reforçam rotinas de acompanhamento e permitem reações rápidas a desvios."
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
                {currentStep.id === 'context' && (
                  <div className="space-y-4">
                    <Input
                      label="Título do KPI"
                      placeholder="Ex.: Tempo médio de onboarding"
                      value={values.title}
                      onChange={(event) => setValue('title', event.target.value, { shouldValidate: true })}
                      error={formState.errors.title?.message}
                    />
                    <Textarea
                      label="Descrição"
                      placeholder="Explique o propósito, fonte de dados e responsável pela atualização."
                      value={values.description}
                      onChange={(event) => setValue('description', event.target.value, { shouldValidate: true })}
                      error={formState.errors.description?.message}
                    />
                  </div>
                )}

                {currentStep.id === 'targets' && (
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
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Select
                        label="Unidade"
                        value={values.unit}
                        onChange={(event) => setValue('unit', event.target.value as KpiFormValues['unit'], { shouldValidate: true })}
                      >
                        <option value="NUMBER">Número absoluto</option>
                        <option value="PERCENT">Percentual</option>
                        <option value="CURRENCY">Financeiro</option>
                      </Select>
                      <Select
                        label="Cadência"
                        value={values.cadence}
                        onChange={(event) =>
                          setValue('cadence', event.target.value as KpiFormValues['cadence'], {
                            shouldValidate: true
                          })
                        }
                      >
                        <option value="DAILY">Diária</option>
                        <option value="WEEKLY">Semanal</option>
                        <option value="MONTHLY">Mensal</option>
                        <option value="QUARTERLY">Trimestral</option>
                      </Select>
                    </div>
                    <DateRangePicker
                      label="Período de acompanhamento"
                      value={values.timeRange}
                      onChange={(range) => setValue('timeRange', range, { shouldValidate: true })}
                      error={formState.errors.timeRange?.end?.message}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="Baseline"
                        type="number"
                        value={values.baselineValue}
                        onChange={(event) => setValue('baselineValue', Number(event.target.value || 0), { shouldValidate: true })}
                        error={formState.errors.baselineValue?.message}
                      />
                      <Input
                        label="Meta"
                        type="number"
                        value={values.targetValue}
                        onChange={(event) => setValue('targetValue', Number(event.target.value || 0), { shouldValidate: true })}
                        error={formState.errors.targetValue?.message}
                      />
                    </div>
                  </div>
                )}

                {currentStep.id === 'summary' && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-300">Revise as principais informações antes de publicar o KPI.</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {summary.map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                          <p className="mt-2 text-sm text-slate-200">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={() => setStepIndex((index) => Math.max(index - 1, 0))} disabled={stepIndex === 0}>
                Voltar
              </Button>
              <Button type="submit" isLoading={isPending}>
                {isLastStep ? 'Concluir KPI' : 'Avançar'}
              </Button>
            </div>
          </form>
        </FormProvider>
      </Card>
    </div>
  );
};

const unitLabel = (unit: KpiFormValues['unit']) => {
  switch (unit) {
    case 'NUMBER':
      return 'Número absoluto';
    case 'PERCENT':
      return 'Percentual';
    case 'CURRENCY':
      return 'Financeiro';
    default:
      return unit;
  }
};

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

const formatValue = (unit: KpiFormValues['unit'], value: number) => {
  if (unit === 'CURRENCY') {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (unit === 'PERCENT') {
    return `${value}%`;
  }
  return value.toLocaleString('pt-BR');
};

const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

export default KpiWizardPage;
