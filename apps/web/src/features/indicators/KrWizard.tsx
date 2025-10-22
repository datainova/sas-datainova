import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useForm, useFieldArray, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { type Cadence } from '@datainova/common';

const cadenceOptions: Array<{ value: Cadence; label: string }> = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'DAILY', label: 'Diário' }
];

const directionOptions = [
  { value: 'INCREASE', label: 'Maior é melhor' },
  { value: 'DECREASE', label: 'Menor é melhor' },
  { value: 'MAINTAIN', label: 'Manter' }
];

const krSchema = z.object({
  title: z.string().min(5, 'Título obrigatório'),
  description: z.string().min(10, 'Descrição obrigatória'),
  cadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'BIENNIAL']),
  startDate: z.string(),
  endDate: z.string(),
  unitCode: z.string().min(1),
  direction: z.enum(['INCREASE', 'DECREASE', 'MAINTAIN']),
  segments: z.array(
    z.object({
      label: z.string(),
      code: z.string(),
      values: z.array(
        z.object({
          value: z.string(),
          code: z.string()
        })
      )
    })
  )
});

type KrFormValues = z.infer<typeof krSchema>;

const steps: Array<{ id: keyof KrFormValues | 'summary'; label: string }> = [
  { id: 'title', label: 'Título' },
  { id: 'description', label: 'Descrição' },
  { id: 'cadence', label: 'Cadência' },
  { id: 'unitCode', label: 'Unidade' },
  { id: 'direction', label: 'Direção' },
  { id: 'segments', label: 'Segmentação' },
  { id: 'summary', label: 'Resumo' }
];

const KrWizard = () => {
  const form = useForm<KrFormValues>({
    resolver: zodResolver(krSchema),
    mode: 'onChange',
    defaultValues: {
      title: '',
      description: '',
      cadence: 'MONTHLY',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().slice(0, 10),
      unitCode: '%',
      direction: 'INCREASE',
      segments: []
    }
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [success, setSuccess] = useState(false);
  const currentStep = steps[stepIndex];
  const isSummary = currentStep.id === 'summary';

  const goNext = async () => {
    if (!isSummary) {
      const valid = await form.trigger(currentStep.id as keyof KrFormValues);
      if (!valid) return;
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    } else {
      setSuccess(true);
    }
  };

  const goBack = () => setStepIndex((index) => Math.max(index - 1, 0));

  const summary = form.watch();

  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/50 p-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-brand-400">K-Result</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Defina resultados chave mensuráveis</h2>
          <p className="text-sm text-slate-400">Cadência granular e direção orientada ao cálculo automático de status.</p>
        </div>
        <span className="text-sm text-slate-400">
          Passo {stepIndex + 1}
          <span className="text-slate-600">/{steps.length}</span>
        </span>
      </header>
      <div className="mb-6 flex items-center gap-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? 'bg-brand-500' : 'bg-slate-800'}`}
          />
        ))}
      </div>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void goNext();
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            {renderStep({ form, currentStep })}
          </motion.div>
        </AnimatePresence>

        {success ? (
          <div className="rounded-xl border border-brand-500/40 bg-brand-500/10 p-4 text-sm text-brand-100">
            KR criado! Você pode adicionar um novo indicador ou retornar ao objetivo.
          </div>
        ) : (
          <div className="flex justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0}
              className="rounded-full border border-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Voltar
            </button>
            <button
              type="submit"
              className="rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-400 transition"
            >
              {isSummary ? 'Concluir' : 'Avançar'}
            </button>
          </div>
        )}

        {isSummary && !success && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-300">
            <p className="font-semibold text-white">Resumo</p>
            <p className="mt-3 text-sm text-slate-200">{summary.title}</p>
            <p className="text-xs text-slate-500">{summary.description}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-400">
              <div>
                <p className="uppercase tracking-wide text-slate-500">Cadência</p>
                <p className="text-slate-200">{summary.cadence}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Direção</p>
                <p className="text-slate-200">{summary.direction}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-slate-500">Unidade</p>
                <p className="text-slate-200">{summary.unitCode}</p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

type RenderStepProps = {
  form: UseFormReturn<KrFormValues>;
  currentStep: (typeof steps)[number];
};

const renderStep = ({ form, currentStep }: RenderStepProps) => {
  switch (currentStep.id) {
    case 'title':
      return (
        <FieldText
          label="Título"
          placeholder="Ex.: Incrementar NPS trimestral"
          error={form.formState.errors.title?.message}
          {...form.register('title')}
        />
      );
    case 'description':
      return (
        <FieldTextArea
          label="Descrição"
          placeholder="Explique o impacto do resultado chave"
          error={form.formState.errors.description?.message}
          {...form.register('description')}
        />
      );
    case 'cadence':
      return (
        <div className="grid gap-3 md:grid-cols-3">
          {cadenceOptions.map((option) => (
            <label key={option.value} className="flex cursor-pointer gap-3 rounded-xl border border-slate-800 bg-slate-900/30 p-4 hover:border-brand-500">
              <input type="radio" value={option.value} {...form.register('cadence')} className="h-4 w-4" />
              <div>
                <p className="text-sm font-semibold text-white">{option.label}</p>
                <p className="text-xs text-slate-400">Coleta agregada {option.label.toLowerCase()}</p>
              </div>
            </label>
          ))}
        </div>
      );
    case 'unitCode':
      return (
        <FieldText
          label="Unidade"
          placeholder="%, R$, #, horas"
          error={form.formState.errors.unitCode?.message}
          {...form.register('unitCode')}
        />
      );
    case 'direction':
      return (
        <div className="grid gap-3 md:grid-cols-3">
          {directionOptions.map((option) => (
            <label key={option.value} className="flex cursor-pointer gap-3 rounded-xl border border-slate-800 bg-slate-900/30 p-4 hover:border-brand-500">
              <input type="radio" value={option.value} {...form.register('direction')} className="h-4 w-4" />
              <div>
                <p className="text-sm font-semibold text-white">{option.label}</p>
                <p className="text-xs text-slate-400">Cálculo automático do status</p>
              </div>
            </label>
          ))}
        </div>
      );
    case 'segments':
      return <SegmentBuilder form={form} />;
    case 'summary':
      return <p className="text-sm text-slate-300">Confirme os dados e conclua o KR.</p>;
    default:
      return null;
  }
};

type FieldTextProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

const FieldText = ({ label, error, ...props }: FieldTextProps) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-white">{label}</label>
    <input
      {...props}
      className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-brand-400"
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
);

type FieldTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

const FieldTextArea = ({ label, error, ...props }: FieldTextAreaProps) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-white">{label}</label>
    <textarea
      {...props}
      rows={5}
      className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-brand-400"
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
);

const SegmentBuilder = ({ form }: { form: UseFormReturn<KrFormValues> }) => {
  const { control } = form;
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'segments'
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Segmentação independente</p>
          <p className="text-xs text-slate-400">Opcional. Permite granularidade adicional por canal, região ou outra dimensão.</p>
        </div>
        <button
          type="button"
          onClick={() =>
            append({
              label: 'Novo eixo',
              code: `SEG${fields.length + 1}`,
              values: []
            })
          }
          className="rounded-full border border-brand-500/60 px-3 py-1 text-xs font-medium text-brand-100 hover:bg-brand-500/20"
        >
          Adicionar eixo
        </button>
      </div>
      {fields.length ? (
        fields.map((field, index) => (
          <div key={field.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center gap-2">
              <input
                value={field.label}
                onChange={(event) => update(index, { ...field, label: event.target.value })}
                className="w-2/3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-white"
              />
              <input
                value={field.code}
                onChange={(event) => update(index, { ...field, code: event.target.value.toUpperCase() })}
                className="w-1/3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-white uppercase tracking-wide"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10"
              >
                Remover
              </button>
            </div>
            <SegmentValues control={control} index={index} />
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
          Nenhuma segmentação. Você pode continuar e adicionar depois.
        </div>
      )}
    </div>
  );
};

const SegmentValues = ({ control, index }: { control: UseFormReturn<KrFormValues>['control']; index: number }) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `segments.${index}.values` as const
  });
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {fields.map((field, i) => (
          <span key={field.id} className="flex items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1 text-xs text-slate-200">
            {field.value}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-slate-500 hover:text-red-300"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Valor"
          className="flex-1 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-white"
        />
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Código"
          className="w-24 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-white uppercase tracking-wide"
        />
        <button
          type="button"
          onClick={() => {
            if (!value || !code) return;
            append({ value, code });
            setValue('');
            setCode('');
          }}
          className="rounded-full border border-brand-500/40 px-3 py-1 text-xs text-brand-100 hover:bg-brand-500/20"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
};

export default KrWizard;
