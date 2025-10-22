import { useState } from 'react';
import { useForm, FormProvider, useFormContext } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';

const onboardingSchema = z.object({
  name: z.string().min(3, 'Informe o nome da organização'),
  country: z.string().min(2, 'Selecione o país'),
  segment: z.string().min(2, 'Informe o segmento'),
  size: z.string().min(2, 'Informe o porte'),
  mission: z.string().min(10, 'Descreva a missão'),
  vision: z.string().min(10, 'Descreva a visão'),
  summary: z.string().min(10, 'Contextualize o momento atual')
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

const steps: Array<{ id: keyof OnboardingFormValues; label: string; description: string }> = [
  { id: 'name', label: 'Organização', description: 'Nome da empresa ou equipe principal.' },
  { id: 'country', label: 'País', description: 'Onde está localizado o time predominante.' },
  { id: 'segment', label: 'Segmento', description: 'Setor de atuação.' },
  { id: 'size', label: 'Porte', description: 'Quantidade aproximada de colaboradores.' },
  { id: 'mission', label: 'Missão', description: 'Por que a organização existe?' },
  { id: 'vision', label: 'Visão', description: 'Onde a organização deseja chegar?' },
  { id: 'summary', label: 'Resumo', description: 'Contexto estratégico atual.' }
];

const fieldCopy: Record<keyof OnboardingFormValues, { placeholder: string; type?: string; asTextArea?: boolean }> = {
  name: { placeholder: 'Ex.: DataInova Labs' },
  country: { placeholder: 'Brasil' },
  segment: { placeholder: 'Tecnologia / Dados' },
  size: { placeholder: '101-250 pessoas' },
  mission: { placeholder: 'Empoderar equipes com dados confiáveis.', asTextArea: true },
  vision: { placeholder: 'Ser a plataforma líder em execução estratégica.', asTextArea: true },
  summary: { placeholder: 'Em 2025 queremos alinhar objetivos globais...', asTextArea: true }
};

const stepVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 }
};

const defaultValues: OnboardingFormValues = {
  name: '',
  country: '',
  segment: '',
  size: '',
  mission: '',
  vision: '',
  summary: ''
};

const OnboardingWizard = () => {
  const methods = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onChange',
    defaultValues
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(false);

  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const goNext = async () => {
    const valid = await methods.trigger(currentStep.id);
    if (!valid) return;
    if (isLastStep) {
      setHasCompleted(true);
    } else {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }
  };

  const goBack = () => setStepIndex((index) => Math.max(index - 1, 0));

  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/50 p-10 shadow-xl shadow-black/30">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-brand-400">Onboarding</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Conheça sua organização</h2>
          <p className="text-sm text-slate-400">Wizards guiados com autosave e retomada.</p>
        </div>
        <span className="text-sm text-slate-400">
          Passo {stepIndex + 1}
          <span className="text-slate-600">/{steps.length}</span>
        </span>
      </div>

      <div className="mb-6 flex items-center gap-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`h-2 flex-1 rounded-full ${index <= stepIndex ? 'bg-brand-500' : 'bg-slate-800'}`}
          />
        ))}
      </div>

      <FormProvider {...methods}>
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
              className="space-y-3"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <div>
                <p className="text-sm font-medium text-white">{currentStep.label}</p>
                <p className="text-xs text-slate-400">{currentStep.description}</p>
              </div>
              <Field id={currentStep.id} />
            </motion.div>
          </AnimatePresence>

          {hasCompleted ? (
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-4 text-sm text-brand-100">
              🎉 Organização configurada! Prossiga para criar seus objetivos ou convide sua equipe.
            </div>
          ) : (
            <div className="flex justify-between">
              <button
                type="button"
                onClick={goBack}
                disabled={stepIndex === 0}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="rounded-full bg-brand-500 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-400 transition"
              >
                {isLastStep ? 'Concluir' : 'Avançar'}
              </button>
            </div>
          )}
        </form>
      </FormProvider>
    </div>
  );
};

type FieldProps = {
  id: keyof OnboardingFormValues;
};

const Field = ({ id }: FieldProps) => {
  const {
    register,
    formState: { errors }
  } = useFormContext<OnboardingFormValues>();
  const fieldMeta = fieldCopy[id];

  const error = errors[id]?.message;
  const InputTag = fieldMeta.asTextArea ? 'textarea' : 'input';

  return (
    <div className="space-y-2">
      <InputTag
        {...register(id)}
        placeholder={fieldMeta.placeholder}
        rows={fieldMeta.asTextArea ? 4 : undefined}
        className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-brand-400 focus:bg-slate-900"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};

export default OnboardingWizard;
