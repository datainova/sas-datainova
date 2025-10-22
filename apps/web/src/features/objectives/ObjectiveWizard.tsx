import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useForm, useFieldArray, type Control, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Cadence } from '@datainova/common';

const cadenceOptions: Array<{ value: Cadence; label: string }> = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' }
];

const objectiveSchema = z.object({
  title: z.string().min(5, 'Informe um título estratégico'),
  description: z.string().min(20, 'Descreva a ambição do objetivo'),
  cadence: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'BIENNIAL']),
  startDate: z.string(),
  endDate: z.string(),
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

type ObjectiveFormValues = z.infer<typeof objectiveSchema>;

const steps: Array<{ id: keyof ObjectiveFormValues | 'summary'; label: string }> = [
  { id: 'title', label: 'Título' },
  { id: 'description', label: 'Descrição' },
  { id: 'cadence', label: 'Cadência' },
  { id: 'startDate', label: 'Janela' },
  { id: 'segments', label: 'Segmentação' },
  { id: 'summary', label: 'Resumo' }
];

const summaryFields: Array<{ key: keyof ObjectiveFormValues; label: string }> = [
  { key: 'title', label: 'Título' },
  { key: 'description', label: 'Descrição' },
  { key: 'cadence', label: 'Cadência' },
  { key: 'startDate', label: 'Início' },
  { key: 'endDate', label: 'Fim' }
];

const segmentFieldDefaults: ObjectiveFormValues['segments'] = [];

const ObjectiveWizard = () => {
  const form = useForm<ObjectiveFormValues>({
    resolver: zodResolver(objectiveSchema),
    mode: 'onChange',
    defaultValues: {
      title: '',
      description: '',
      cadence: 'QUARTERLY',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().slice(0, 10),
      segments: segmentFieldDefaults
    }
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [success, setSuccess] = useState(false);

  const currentStep = steps[stepIndex];
  const canGoBack = stepIndex > 0;
  const isSummary = currentStep.id === 'summary';

  const goNext = async () => {
    const field = currentStep.id === 'summary' ? undefined : currentStep.id;
    if (field && typeof field === 'string') {
      const isValid = await form.trigger(field as keyof ObjectiveFormValues);
      if (!isValid) return;
    }
    if (isSummary) {
      setSuccess(true);
    } else {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }
  };

  const goBack = () => setStepIndex((index) => Math.max(index - 1, 0));

  const summaryData = form.watch();

  return (
    <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/50 p-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-brand-400">Objetivo Estratégico</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Deixe claro o direcionamento</h2>
          <p className="text-sm text-slate-400">Conecte o objetivo a cadências e segmentações consistentes.</p>
        </div>
        <div className="text-sm text-slate-400">
          Passo {stepIndex + 1}
          <span className="text-slate-600">/{steps.length}</span>
        </div>
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
            Objetivo criado com sucesso! Continue adicionando K-Results adequados à cadência escolhida.
          </div>
        ) : (
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack}
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
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <h3 className="mb-4 text-sm font-semibold text-white">Confirme os dados</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm text-slate-300">
              {summaryFields.map((field) => (
                <div key={field.key}>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">{field.label}</dt>
                  <dd className="mt-1 text-slate-100">{(summaryData as Record<string, unknown>)[field.key] as string}</dd>
                </div>
              ))}
            </dl>
            {summaryData.segments && summaryData.segments.length > 0 && (
              <div className="mt-4">
                <h4 className="text-xs uppercase tracking-wide text-slate-500">Segmentação</h4>
                <ul className="mt-2 space-y-2 text-sm text-slate-200">
                  {summaryData.segments.map((segment) => (
                    <li key={segment.code} className="rounded-lg border border-slate-800 p-3">
                      <p className="text-sm font-medium">{segment.label}</p>
                      <p className="text-xs text-slate-400">
                        Valores:{' '}
                        {segment.values.map((value) => value.value).join(', ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
};

type RenderStepProps = {
  form: ReturnType<typeof useForm<ObjectiveFormValues>>;
  currentStep: (typeof steps)[number];
};

const renderStep = ({ form, currentStep }: RenderStepProps) => {
  switch (currentStep.id) {
    case 'title':
      return (
        <FieldText
          label="Qual o enunciado deste objetivo?"
          placeholder="Ex.: Acelerar a adoção de dados nas squads de produto"
          error={form.formState.errors.title?.message}
          {...form.register('title')}
        />
      );
    case 'description':
      return (
        <FieldTextArea
          label="Descreva o contexto e resultado esperado"
          placeholder="Detalhe o impacto desejado, recortes e critérios de sucesso"
          error={form.formState.errors.description?.message}
          {...form.register('description')}
        />
      );
    case 'cadence':
      return (
        <div className="space-y-4">
          <p className="text-sm font-medium text-white">Com qual cadência iremos medir progresso?</p>
          <div className="grid gap-3 md:grid-cols-2">
            {cadenceOptions.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/30 p-4 hover:border-brand-500">
                <input
                  type="radio"
                  value={option.value}
                  {...form.register('cadence')}
                  className="h-4 w-4"
                />
                <div>
                  <p className="text-sm font-semibold text-white">{option.label}</p>
                  <p className="text-xs text-slate-400">Valores agregados conforme cadência</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      );
    case 'startDate':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <FieldDate label="Data inicial" error={form.formState.errors.startDate?.message} {...form.register('startDate')} />
          <FieldDate label="Data final" error={form.formState.errors.endDate?.message} {...form.register('endDate')} />
        </div>
      );
    case 'segments':
      return <SegmentBuilder form={form} />;
    case 'summary':
      return <p className="text-sm text-slate-300">Revise e confirme os dados antes de publicar.</p>;
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

const FieldTextArea = ({ label, error, rows = 5, ...props }: FieldTextAreaProps) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-white">{label}</label>
    <textarea
      {...props}
      className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-brand-400"
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
);

type FieldDateProps = FieldTextProps;

const FieldDate = ({ label, error, ...props }: FieldDateProps) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-white">{label}</label>
    <input
      {...props}
      type="date"
      className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-brand-400"
    />
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>
);

type SegmentBuilderProps = {
  form: UseFormReturn<ObjectiveFormValues>;
};

const SegmentBuilder = ({ form }: SegmentBuilderProps) => {
  const { control } = form;
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'segments'
  });

  const addAxis = () =>
    append({
      label: 'Novo eixo',
      code: `AX${fields.length + 1}`,
      values: []
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Segmentação opcional</p>
          <p className="text-xs text-slate-400">
            Crie eixos como Canal, Região ou Segmento de cliente. Os valores devem ser consistentes com as fontes de dados.
          </p>
        </div>
        <button
          type="button"
          onClick={addAxis}
          className="rounded-full border border-brand-500/60 px-3 py-1 text-xs font-medium text-brand-100 hover:bg-brand-500/20"
        >
          Adicionar eixo
        </button>
      </div>

      <div className="space-y-3">
        {fields.length ? (
          fields.map((field, index) => (
            <div key={field.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-1 gap-2">
                  <input
                    value={field.label}
                    onChange={(event) =>
                      update(index, { ...field, label: event.target.value })
                    }
                    placeholder="Rótulo do eixo"
                    className="w-2/3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-white"
                  />
                  <input
                    value={field.code}
                    onChange={(event) =>
                      update(index, { ...field, code: event.target.value.toUpperCase() })
                    }
                    placeholder="Código"
                    className="w-1/3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-white uppercase tracking-wide"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10"
                >
                  Remover
                </button>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Valores</p>
                <SegmentValuesEditor control={control} segmentIndex={index} />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
            Nenhum eixo configurado. Você pode prosseguir e adicionar segmentações posteriormente.
          </div>
        )}
      </div>
    </div>
  );
};

type SegmentValuesEditorProps = {
  control: Control<ObjectiveFormValues>;
  segmentIndex: number;
};

const SegmentValuesEditor = ({ control, segmentIndex }: SegmentValuesEditorProps) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `segments.${segmentIndex}.values` as const
  });

  const [value, setValue] = useState('');
  const [code, setCode] = useState('');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {fields.map((field, index) => (
          <span key={field.id} className="flex items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1 text-xs">
            {field.value}
            <button
              type="button"
              onClick={() => remove(index)}
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

export default ObjectiveWizard;
