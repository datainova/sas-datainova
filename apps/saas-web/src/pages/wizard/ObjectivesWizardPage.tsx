import { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ApiError } from "../../lib/http";
import { useAuthSession } from "../../hooks/useAuthSession";
import {
  createIndicator,
  createObjective,
  createPeriod,
  getPeriodSummary,
  listIndicators,
  listObjectives
} from "../../api/wizard";
import type {
  CreateIndicatorRequest,
  CreateObjectiveRequest,
  CreatePeriodRequest,
  IndicatorDefinition,
  Objective,
  StrategicCadence,
  PeriodGranularity,
  PeriodSummaryResponse,
  StrategicPeriod
} from "../../types/wizard";
import { Loader2, Target, CalendarRange, ClipboardList, ListChecks, CheckCircle2, Check, ArrowLeft, ArrowRight } from "lucide-react";

type StepKey = 0 | 1 | 2 | 3 | 4; // Period, Objective, KR, PI, Summary

const periodSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com 2+ caracteres."),
  startDate: z.string().min(1, "Informe a data inicial."),
  endDate: z.string().min(1, "Informe a data final."),
  cadence: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "BIENNIAL"]) as z.ZodType<StrategicCadence>
});
type PeriodFormValues = z.infer<typeof periodSchema>;

const objectiveSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com 2+ caracteres."),
  description: z.string().trim().optional(),
  startDate: z.string().min(1, "Informe a data inicial."),
  endDate: z.string().min(1, "Informe a data final."),
  cadence: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "BIENNIAL"]) as z.ZodType<StrategicCadence>
});
type ObjectiveFormValues = z.infer<typeof objectiveSchema>;

const indicatorSchema = z.object({
  code: z.string().trim().min(1, "Informe um código"),
  name: z.string().trim().min(2, "Informe um nome com 2+ caracteres"),
  isKeyResult: z.literal(true).or(z.literal(false)),
  direction: z.enum(["UP", "DOWN", "RANGE", "EQUAL", "OUTSIDE_RANGE"]).default("UP"),
  granularityDefault: z.enum(["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]) as z.ZodType<PeriodGranularity>,
  unit: z.string().trim().optional().nullable()
});
type IndicatorFormValues = z.infer<typeof indicatorSchema>;

function usePathPeriodId() {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  const parts = path.split("/").filter(Boolean);
  // /wizard/objectives/:periodId?
  return parts.length >= 3 ? parts[2] : null;
}

export function ObjectivesWizardPage() {
  const { session, isAuthenticated } = useAuthSession();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<StepKey>(0);
  const [period, setPeriod] = useState<StrategicPeriod | null>(null);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "info" | "success" | "error"; title: string; description?: string } | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const pathPeriodId = usePathPeriodId();
  const draftKey = useMemo(() => getAutosaveKey(period?.id ?? pathPeriodId ?? null), [period?.id, pathPeriodId]);
  const hydratedRef = useRef(false);

  // Forms need to be initialized before effects/callbacks that reference them,
  // otherwise React/TS hits TDZ errors ("cannot access X before initialization").
  const periodForm = useForm<PeriodFormValues>({
    resolver: zodResolver(periodSchema),
    defaultValues: {
      name: "",
      startDate: "",
      endDate: "",
      cadence: "ANNUAL"
    }
  });

  const objectiveForm = useForm<ObjectiveFormValues>({
    resolver: zodResolver(objectiveSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      cadence: "ANNUAL"
    }
  });

  const krForm = useForm<IndicatorFormValues>({
    resolver: zodResolver(indicatorSchema),
    defaultValues: {
      code: "",
      name: "",
      isKeyResult: true,
      direction: "UP",
      granularityDefault: "MONTH",
      unit: ""
    }
  });

  const piForm = useForm<IndicatorFormValues>({
    resolver: zodResolver(indicatorSchema),
    defaultValues: {
      code: "",
      name: "",
      isKeyResult: false,
      direction: "DOWN",
      granularityDefault: "MONTH",
      unit: ""
    }
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    if (period?.id) return;
    if (pathPeriodId) {
      // When navigating directly to existing period URL, fetch summary to hydrate
      // Light query: we’ll rely on summary section to refresh details later too
      getPeriodSummary(session!.accessToken, pathPeriodId)
        .then((data) => {
          setPeriod(data.period);
          setStep(1);
        })
        .catch((err) => {
          const msg = extractErrorMessage(err);
          setNotification({ type: "error", title: "Falha ao carregar período", description: msg });
        });
    }
  }, [isAuthenticated, pathPeriodId, period?.id, session]);

  // Hydrate drafts from localStorage
  useEffect(() => {
    if (hydratedRef.current) return;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
      if (!raw) {
        hydratedRef.current = true;
        return;
      }
      const draft = JSON.parse(raw) as WizardDraft;
      if (draft.step !== undefined) {
        // if there's no period created yet, don't start beyond step 0
        const safeStep: StepKey = (period || pathPeriodId) ? (draft.step as StepKey) : 0;
        setStep(safeStep);
      }
      if (!period && draft.periodDraft) {
        periodForm.reset(draft.periodDraft);
      }
      if (draft.objectiveDraft) {
        objectiveForm.reset(draft.objectiveDraft);
      }
      if (draft.krDraft) {
        krForm.reset(draft.krDraft);
      }
      if (draft.piDraft) {
        piForm.reset(draft.piDraft);
      }
      if (draft.selectedObjectiveId) {
        setSelectedObjectiveId(draft.selectedObjectiveId);
      }
    } catch {
      // ignore invalid draft
    } finally {
      hydratedRef.current = true;
    }
  }, [draftKey]);

  // Autosave scheduler
  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setIsSaving(true);
    saveTimer.current = setTimeout(() => {
      try {
        const payload: WizardDraft = {
          step,
          periodId: period?.id ?? pathPeriodId ?? null,
          periodDraft: period ? undefined : periodForm.getValues(),
          objectiveDraft: objectiveForm.getValues(),
          selectedObjectiveId,
          krDraft: krForm.getValues(),
          piDraft: piForm.getValues()
        };
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
        const now = new Date().toISOString();
        setLastSavedAt(now);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 1000);
      } catch {
        // ignore
      } finally {
        setIsSaving(false);
      }
    }, 800);
  }, [draftKey, krForm, objectiveForm, pathPeriodId, period, periodForm, selectedObjectiveId, step]);

  // Watch forms via hook (no manual unsubscribe) and trigger autosave
  const periodValues = useWatch({ control: periodForm.control });
  const objectiveValues = useWatch({ control: objectiveForm.control });
  const krValues = useWatch({ control: krForm.control });
  const piValues = useWatch({ control: piForm.control });

  useEffect(() => {
    scheduleAutosave();
  }, [periodValues, objectiveValues, krValues, piValues, selectedObjectiveId, step, scheduleAutosave]);


  const createPeriodMutation = useMutation({
    mutationFn: async (values: PeriodFormValues) => {
      if (!session) throw new Error("Sessão inválida");
      const payload: CreatePeriodRequest = {
        name: values.name.trim(),
        startDate: toUtcIso(values.startDate),
        endDate: toUtcIso(values.endDate),
        cadence: values.cadence
      };
      return createPeriod(session.accessToken, payload);
    },
    onSuccess: (data) => {
      setPeriod(data);
      setStep(1);
      setNotification({ type: "success", title: "Período criado", description: data.name });
      // navigate to period URL
      tryNavigate(`/wizard/objectives/${data.id}`);
      migrateAutosaveKey("new", data.id);
    },
    onError: (err) => {
      setNotification({ type: "error", title: "Falha ao criar período", description: extractErrorMessage(err) });
    }
  });

  const objectivesQuery = useQuery({
    enabled: Boolean(session && period?.id),
    queryKey: ["objectives", period?.id],
    queryFn: async () => {
      const res = await listObjectives(session!.accessToken, period!.id, { limit: 100 });
      return res.items;
    }
  });

  const selectedObjective: Objective | null = useMemo(() => {
    if (!selectedObjectiveId) return null;
    const list = objectivesQuery.data ?? [];
    return list.find((o) => o.id === selectedObjectiveId) ?? null;
  }, [objectivesQuery.data, selectedObjectiveId]);

  const krsQuery = useQuery({
    enabled: Boolean(session && selectedObjectiveId),
    queryKey: ["indicators", "kr", selectedObjectiveId],
    queryFn: async () => {
      const res = await listIndicators(session!.accessToken, { objectiveId: selectedObjectiveId!, limit: 100 });
      return res.items;
    }
  });

  const pisQuery = useQuery({
    enabled: Boolean(session && period?.id),
    queryKey: ["indicators", "pi", period?.id],
    queryFn: async () => {
      const res = await listIndicators(session!.accessToken, { periodId: period!.id, limit: 100 });
      return res.items;
    }
  });

  const gateQuery = useQuery({
    enabled: Boolean(session && period?.id),
    queryKey: ["period", "gate", period?.id],
    queryFn: async () => getPeriodSummary(session!.accessToken, period!.id)
  });

  const createObjectiveMutation = useMutation({
    mutationFn: async (values: ObjectiveFormValues) => {
      if (!session || !period) throw new Error("Sessão ou período inválido");
      const body: CreateObjectiveRequest = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        ownerId: undefined,
        periodId: period.id,
        startDate: toUtcIso(values.startDate),
        endDate: toUtcIso(values.endDate),
        cadence: values.cadence
      };
      return createObjective(session.accessToken, body);
    },
    onSuccess: (obj) => {
      setSelectedObjectiveId(obj.id);
      setStep(2);
      setNotification({ type: "success", title: "Objetivo criado", description: obj.name });
      queryClient.invalidateQueries({ queryKey: ["objectives", period?.id] });
    },
    onError: (err) => {
      setNotification({ type: "error", title: "Falha ao criar objetivo", description: extractErrorMessage(err) });
    }
  });

  const createKrMutation = useMutation({
    mutationFn: async (values: IndicatorFormValues) => {
      if (!session || !selectedObjective) throw new Error("Objetivo não selecionado");
      const body: CreateIndicatorRequest = {
        code: values.code.trim(),
        name: values.name.trim(),
        isKeyResult: true,
        objectiveId: selectedObjective.id,
        direction: values.direction,
        granularityDefault: values.granularityDefault,
        unit: values.unit?.trim() || undefined
      };
      return createIndicator(session.accessToken, body);
    },
    onSuccess: (kr) => {
      setNotification({ type: "success", title: "KR criado", description: kr.name });
      krForm.reset({ code: "", name: "", isKeyResult: true, direction: "UP", granularityDefault: "MONTH", unit: "" });
      queryClient.invalidateQueries({ queryKey: ["indicators", "kr", selectedObjectiveId] });
      queryClient.invalidateQueries({ queryKey: ["period", "gate", period?.id] });
      queryClient.invalidateQueries({ queryKey: ["period", "summary", period?.id] });
    },
    onError: (err) => {
      setNotification({ type: "error", title: "Falha ao criar KR", description: extractErrorMessage(err) });
    }
  });

  const createPiMutation = useMutation({
    mutationFn: async (values: IndicatorFormValues) => {
      if (!session || !period) throw new Error("Período inválido");
      const body: CreateIndicatorRequest = {
        code: values.code.trim(),
        name: values.name.trim(),
        isKeyResult: false,
        periodId: period.id,
        direction: values.direction,
        granularityDefault: values.granularityDefault,
        unit: values.unit?.trim() || undefined
      };
      return createIndicator(session.accessToken, body);
    },
    onSuccess: (pi) => {
      setNotification({ type: "success", title: "PI criado", description: pi.name });
      piForm.reset({ code: "", name: "", isKeyResult: false, direction: "DOWN", granularityDefault: "MONTH", unit: "" });
      queryClient.invalidateQueries({ queryKey: ["indicators", "pi", period?.id] });
      queryClient.invalidateQueries({ queryKey: ["period", "summary", period?.id] });
    },
    onError: (err) => {
      setNotification({ type: "error", title: "Falha ao criar PI", description: extractErrorMessage(err) });
    }
  });

  const canGoToPI = useMemo(() => {
    // Prefer server gate if available
    const gate = gateQuery.data?.gate?.allObjectivesHaveKR;
    if (typeof gate === "boolean") return gate;
    // Fallback: if selected objective has >= 1 KR
    return (krsQuery.data ?? []).length > 0;
  }, [gateQuery.data?.gate?.allObjectivesHaveKR, krsQuery.data]);

  const header = (
    <div className="relative z-10 mx-auto w-full max-w-5xl px-6 pt-8 text-white">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-white/70">DataInova Connect</p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl flex items-center gap-2">
            <Target className="h-6 w-6" /> Wizard de Objetivos
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-white/70 sm:text-sm">
            Cadastre o período estratégico, objetivos e seus KRs. As alterações são salvas automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
          {lastSavedAt ? (
            <p>
              Último salvamento automático em <span className="font-semibold text-white">{new Date(lastSavedAt).toLocaleTimeString()}</span>
            </p>
          ) : (
            <p>Os dados são salvos continuamente.</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 text-sm" role="navigation" aria-label="Etapas do wizard">
        <StepperItem active={step === 0} completed={Boolean(period)} icon={<CalendarRange className="h-4 w-4" />}>Período</StepperItem>
        <StepperDivider />
        <StepperItem active={step === 1} completed={Boolean(selectedObjective)} icon={<ClipboardList className="h-4 w-4" />}>Objetivos</StepperItem>
        <StepperDivider />
        <StepperItem active={step === 2} completed={(krsQuery.data ?? []).length > 0} icon={<ListChecks className="h-4 w-4" />}>KRs</StepperItem>
        <StepperDivider />
        <StepperItem active={step === 3} completed={(pisQuery.data ?? []).length > 0} icon={<ListChecks className="h-4 w-4" />}>PIs</StepperItem>
        <StepperDivider />
        <StepperItem active={step === 4} completed={false} icon={<CheckCircle2 className="h-4 w-4" />}>Resumo</StepperItem>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0e0e0e] text-white">
      <AnimatedBackdrop prefersReducedMotion={prefersReducedMotion} />
      {header}
      {notification && (
        <div className={`relative z-10 mx-auto mt-4 max-w-5xl px-6`}>
          <div className={
            notification.type === "error"
              ? "rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100"
              : notification.type === "success"
              ? "rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100"
              : "rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80"
          }>
            <div className="font-medium">{notification.title}</div>
            {notification.description && <div className="opacity-80">{notification.description}</div>}
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto mt-6 max-w-5xl px-6 pb-16">
        <div className="relative overflow-hidden rounded-md border border-white/10 bg-white/5 shadow">
          <div className="relative px-5 py-6 sm:px-8 sm:py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -12 }}
                transition={{ duration: prefersReducedMotion ? 0.16 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              >
          {step === 0 && (
            <form
              onSubmit={periodForm.handleSubmit((v) => createPeriodMutation.mutate(v))}
              className="grid gap-4 md:grid-cols-2"
            >
              <FieldText label="Nome do Período" {...periodForm.register("name")} error={periodForm.formState.errors.name?.message} />
              <FieldSelectCadence label="Cadência" value={periodForm.watch("cadence")} onChange={(val) => periodForm.setValue("cadence", val)} />
              <FieldDate label="Início" {...periodForm.register("startDate")} error={periodForm.formState.errors.startDate?.message} />
              <FieldDate label="Fim" {...periodForm.register("endDate")} error={periodForm.formState.errors.endDate?.message} />
              <div className="md:col-span-2 mt-2 flex justify-end">
                <PrimaryButton type="submit" loading={createPeriodMutation.isPending}>
                  {createPeriodMutation.isPending ? "Criando..." : "Criar período"}
                </PrimaryButton>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="grid gap-6 md:grid-cols-3">
              <div className="md:col-span-2">
                <form
                  onSubmit={objectiveForm.handleSubmit((v) => createObjectiveMutation.mutate(v))}
                  className="grid gap-4"
                >
                  <FieldText label="Nome do Objetivo" {...objectiveForm.register("name")} error={objectiveForm.formState.errors.name?.message} />
                  <FieldText label="Descrição (opcional)" {...objectiveForm.register("description")} error={objectiveForm.formState.errors.description?.message} />
                  <div className="grid gap-4 md:grid-cols-3">
                    <FieldSelectCadence label="Cadência" value={objectiveForm.watch("cadence")} onChange={(val) => objectiveForm.setValue("cadence", val)} />
                    <FieldDate label="Início" {...objectiveForm.register("startDate")} error={objectiveForm.formState.errors.startDate?.message} />
                    <FieldDate label="Fim" {...objectiveForm.register("endDate")} error={objectiveForm.formState.errors.endDate?.message} />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <PrimaryButton
                      type="submit"
                      loading={createObjectiveMutation.isPending}
                      disabled={gateQuery.data ? gateQuery.data.gate.allObjectivesHaveKR === false : false}
                    >
                      {createObjectiveMutation.isPending ? "Criando..." : "Criar objetivo"}
                    </PrimaryButton>
                  </div>
                </form>
              </div>
              <div className="md:col-span-1">
                <h3 className="text-sm font-medium mb-2">Objetivos do Período</h3>
                {objectivesQuery.isLoading && <InlineSpinner />}
                <div className="flex flex-col gap-2">
                  {(objectivesQuery.data ?? []).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => { setSelectedObjectiveId(o.id); setStep(2); }}
                      className={`rounded-md border p-2 text-left hover:bg-neutral-50 ${
                        selectedObjectiveId === o.id ? "border-neutral-900" : "border-neutral-200"
                      }`}
                    >
                      <div className="text-sm font-medium">{o.name}</div>
                      <div className="text-xs opacity-70">{new Date(o.startDate).toISOString().slice(0,10)} → {new Date(o.endDate).toISOString().slice(0,10)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && selectedObjective && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium mb-2">Cadastrar KR para: {selectedObjective.name}</h3>
                <form onSubmit={krForm.handleSubmit((v) => createKrMutation.mutate(v))} className="grid gap-4">
                  <FieldText label="Código" {...krForm.register("code")} error={krForm.formState.errors.code?.message} />
                  <FieldText label="Nome" {...krForm.register("name")} error={krForm.formState.errors.name?.message} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldSelectDirection value={krForm.watch("direction")} onChange={(val) => krForm.setValue("direction", val)} />
                    <FieldSelectGranularity value={krForm.watch("granularityDefault")} onChange={(val) => krForm.setValue("granularityDefault", val)} />
                  </div>
                  <FieldText label="Unidade (opcional)" {...krForm.register("unit")} error={krForm.formState.errors.unit?.message} />
                  <div className="mt-2 flex items-center gap-2">
                    <PrimaryButton type="submit" loading={createKrMutation.isPending}>
                      {createKrMutation.isPending ? "Criando..." : "Adicionar KR"}
                    </PrimaryButton>
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() => setStep(1)}
                    >
                      Concluir KRs deste objetivo
                    </button>
                  </div>
                </form>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">KRs cadastrados</h3>
                {krsQuery.isLoading && <InlineSpinner />}
                <div className="flex flex-col gap-2">
                  {(krsQuery.data ?? []).map((k: IndicatorDefinition) => (
                    <div key={k.id} className="rounded-md border border-neutral-200 p-2">
                      <div className="text-sm font-medium">{k.code} · {k.name}</div>
                      <div className="text-xs opacity-70">{k.direction} · {k.granularityDefault}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <PrimaryButton
                    type="button"
                    disabled={(krsQuery.data ?? []).length === 0}
                    onClick={() => setStep(1)}
                  >
                    { (krsQuery.data ?? []).length === 0 ? "Cadastre ao menos 1 KR" : "Voltar aos objetivos" }
                  </PrimaryButton>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium mb-2">Indicadores do Período (PIs)</h3>
                {!canGoToPI && (
                  <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                    Cada objetivo precisa de pelo menos 1 Key Result. Cadastre ao menos um KR para continuar.
                  </div>
                )}
                <form
                  onSubmit={piForm.handleSubmit((v) => createPiMutation.mutate(v))}
                  className="grid gap-4"
                >
                  <FieldText label="Código" {...piForm.register("code")} error={piForm.formState.errors.code?.message} />
                  <FieldText label="Nome" {...piForm.register("name")} error={piForm.formState.errors.name?.message} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldSelectDirection value={piForm.watch("direction")} onChange={(val) => piForm.setValue("direction", val)} />
                    <FieldSelectGranularity value={piForm.watch("granularityDefault")} onChange={(val) => piForm.setValue("granularityDefault", val)} />
                  </div>
                  <FieldText label="Unidade (opcional)" {...piForm.register("unit")} error={piForm.formState.errors.unit?.message} />
                  <div className="mt-2 flex justify-end">
                    <PrimaryButton type="submit" disabled={!canGoToPI} loading={createPiMutation.isPending}>
                      {createPiMutation.isPending ? "Criando..." : "Adicionar PI"}
                    </PrimaryButton>
                  </div>
                </form>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">PIs cadastrados</h3>
                {pisQuery.isLoading && <InlineSpinner />}
                <div className="flex flex-col gap-2">
                  {(pisQuery.data ?? []).map((p: IndicatorDefinition) => (
                    <div key={p.id} className="rounded-md border border-white/15 bg-black/30 p-2">
                      <div className="text-sm font-medium text-white/90">{p.code} · {p.name}</div>
                      <div className="text-xs text-white/60">{p.direction} · {p.granularityDefault}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && period && (
            <SummaryBlock token={session!.accessToken} periodId={period.id} />
          )}

              </motion.div>
            </AnimatePresence>
          </div>
          <footer className="flex flex-col gap-3 border-t border-white/10 bg-black/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-center gap-3">
              <AutosaveIndicator isSaving={isSaving} justSaved={justSaved} />
              <span className="hidden text-[12px] text-white/60 sm:inline">Passo {step + 1} de 5</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep((s) => (s > 0 ? ((s - 1) as StepKey) : s))}
                disabled={step === 0}
                className="flex items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-[13px] font-medium text-white/80 transition hover:border-white/30 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar
              </button>
              {step < 4 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s < 4 ? ((s + 1) as StepKey) : s))}
                  disabled={(step === 1 && (krsQuery.data ?? []).length === 0 && (objectivesQuery.data ?? []).length > 0) || (step === 3 && !canGoToPI)}
                  className="flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-[13px] font-semibold text-[#1f1d1b] shadow-sm transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/60 disabled:cursor-not-allowed disabled:bg-white/60"
                >
                  <ArrowRight className="h-4 w-4" /> Avançar
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function SummaryBlock({ token, periodId }: { token: string; periodId: string }) {
  const query = useQuery({
    queryKey: ["period", "summary", periodId],
    queryFn: () => getPeriodSummary(token, periodId)
  });
  if (query.isLoading) return <InlineSpinner />;
  if (query.isError) return <div className="text-sm text-red-200">Falha ao carregar resumo.</div>;
  const data = query.data as PeriodSummaryResponse | undefined;
  if (!data) return null;
  return (
    <div className="grid gap-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Período</h3>
        <div className="rounded-md border border-white/15 bg-black/30 p-3 text-sm text-white/90">
          {data.period.name} · {data.period.cadence}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Objetivos</h3>
        <div className="flex flex-col gap-2">
          {data.objectives.map((o) => (
            <div key={o.id} className="rounded-md border border-white/15 bg-black/30 p-2">
              <div className="text-sm font-medium text-white/90">{o.name}</div>
              <div className="text-xs text-white/60">KRs: {o.krCount ?? (o as any).krs?.length ?? 0}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">PIs</h3>
        <div className="flex flex-col gap-2">
          {data.pis.map((p) => (
            <div key={p.id} className="rounded-md border border-white/15 bg-black/30 p-2">
              <div className="text-sm font-medium text-white/90">{p.code} · {p.name}</div>
            </div>
          ))}
        </div>
      </div>
      {!data.gate.allObjectivesHaveKR && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Ainda há objetivos sem KR. Adicione pelo menos 1 KR para cada objetivo.
        </div>
      )}
    </div>
  );
}

function StepperItem({ active, completed, children, icon }: { active: boolean; completed: boolean; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${completed ? "bg-emerald-600 text-white" : active ? "bg-white text-[#1f1d1b]" : "bg-white/20 text-white"}`}>
        {completed ? <Check className="h-3.5 w-3.5" /> : icon ?? null}
      </div>
      <div className={`text-sm ${active ? "font-medium text-white" : "text-white/70"}`}>{children}</div>
    </div>
  );
}

function StepperDivider() {
  return <div className="h-px w-10 bg-white/30" />;
}

const FieldText = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }>(
  ({ label, error, ...props }, ref) => {
    return (
      <label className="block text-sm">
        <div className="mb-1 font-medium text-white/90">{label}</div>
        <input
          ref={ref}
          {...props}
          type={props.type ?? "text"}
          className={`w-full rounded-md border bg-black/30 p-2 text-white outline-none focus:ring-2 focus:ring-white/60 ${error ? "border-red-400/60" : "border-white/15"}`}
        />
        {error && <div className="mt-1 text-xs text-red-300">{error}</div>}
      </label>
    );
  }
);
FieldText.displayName = "FieldText";

const FieldDate = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }>((props, ref) => {
  return <FieldText ref={ref} {...props} type="date" />;
});
FieldDate.displayName = "FieldDate";

function FieldSelectCadence({ label, value, onChange }: { label: string; value: StrategicCadence; onChange: (v: StrategicCadence) => void }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium text-white/90">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value as StrategicCadence)} className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-white">
        <option value="MONTHLY">Mensal</option>
        <option value="QUARTERLY">Trimestral</option>
        <option value="SEMIANNUAL">Semestral</option>
        <option value="ANNUAL">Anual</option>
        <option value="BIENNIAL">Bienal</option>
      </select>
    </label>
  );
}

function FieldSelectDirection({ value, onChange }: { value: CreateIndicatorRequest["direction"]; onChange: (v: CreateIndicatorRequest["direction"]) => void }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium text-white/90">Direção</div>
      <select value={value} onChange={(e) => onChange(e.target.value as any)} className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-white">
        <option value="UP">Para cima</option>
        <option value="DOWN">Para baixo</option>
        <option value="RANGE">Dentro da faixa</option>
        <option value="EQUAL">Igual</option>
        <option value="OUTSIDE_RANGE">Fora da faixa</option>
      </select>
    </label>
  );
}

function FieldSelectGranularity({ value, onChange }: { value: PeriodGranularity; onChange: (v: PeriodGranularity) => void }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium text-white/90">Granularidade</div>
      <select value={value} onChange={(e) => onChange(e.target.value as PeriodGranularity)} className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-white">
        <option value="MONTH">Mensal</option>
        <option value="QUARTER">Trimestral</option>
        <option value="YEAR">Anual</option>
        <option value="WEEK">Semanal</option>
        <option value="DAY">Diária</option>
      </select>
    </label>
  );
}

function PrimaryButton({ loading, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#1f1d1b] shadow-sm transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/60 disabled:cursor-not-allowed disabled:bg-white/60`}
    >
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {props.children}
    </button>
  );
}

function InlineSpinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-white/80">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
    </div>
  );
}

function extractErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.problem?.detail ?? error.problem?.title ?? error.message ?? "Erro inesperado.";
  }
  if (error instanceof Error) return error.message;
  return "Erro inesperado.";
}

function toUtcIso(localDate: string): string {
  // Expecting yyyy-mm-dd from input type="date"; convert to midnight UTC
  if (!localDate) return "";
  return new Date(localDate + "T00:00:00Z").toISOString();
}

function tryNavigate(path: string) {
  try {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, document.title, path);
    }
  } catch {
    // noop
  }
}

function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(media.matches);
    const listener = (event: MediaQueryListEvent) => setPrefers(event.matches);
    if (media.addEventListener) {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);
  return prefers;
}

function AnimatedBackdrop({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  if (prefersReducedMotion) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-b from-[#121212] via-[#141414] to-[#0e0e0e]" />
      <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),rgba(255,255,255,0)_60%)] blur-2xl" />
      <div className="absolute bottom-[-10%] right-[10%] h-64 w-64 rounded-full bg-[conic-gradient(from_90deg,rgba(255,255,255,0.08),rgba(255,255,255,0)_60%)] blur-2xl" />
    </div>
  );
}

function AutosaveIndicator({ isSaving, justSaved }: { isSaving: boolean; justSaved: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs ${isSaving ? "bg-white/10 text-white" : "bg-white/5 text-white/70"}`}>
      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" /> : <Check className="h-3.5 w-3.5" />}
      {isSaving ? "Salvando..." : justSaved ? "Salvo" : "Salvamento automático"}
    </div>
  );
}

// Autosave local
const AUTOSAVE_PREFIX = "datainova-connect.wizard.objectives.";
function getAutosaveKey(periodId: string | null) {
  return AUTOSAVE_PREFIX + (periodId ?? "new");
}

type WizardDraft = {
  step?: StepKey;
  periodDraft?: PeriodFormValues;
  periodId?: string | null;
  objectiveDraft?: ObjectiveFormValues;
  selectedObjectiveId?: string | null;
  krDraft?: IndicatorFormValues;
  piDraft?: IndicatorFormValues;
};

function migrateAutosaveKey(oldKeySuffix: string, newPeriodId: string) {
  try {
    const oldKey = AUTOSAVE_PREFIX + oldKeySuffix;
    const raw = window.localStorage.getItem(oldKey);
    if (raw) {
      const parsed = JSON.parse(raw) as WizardDraft;
      const next: WizardDraft = { ...parsed, periodId: newPeriodId };
      const newKey = getAutosaveKey(newPeriodId);
      window.localStorage.setItem(newKey, JSON.stringify(next));
      window.localStorage.removeItem(oldKey);
    }
  } catch {
    // noop
  }
}
