import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import AppLayout from "../../components/AppLayout";
import { useAuthSession } from "../../hooks/useAuthSession";
import { createIndicator, listIndicators, listObjectives, listPeriods } from "../../api/wizard";
import type { CreateIndicatorRequest, IndicatorDefinition, PeriodGranularity } from "../../types/wizard";
import { Loader2, Plus, ToggleLeft, ToggleRight } from "lucide-react";

const baseSchema = z.object({
  code: z.string().trim().min(1, "Informe um código"),
  name: z.string().trim().min(2, "Informe um nome com 2+ caracteres"),
  direction: z.enum(["UP", "DOWN", "RANGE", "EQUAL", "OUTSIDE_RANGE"]).default("UP"),
  granularityDefault: z.enum(["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]).default("MONTH"),
  unit: z.string().trim().optional().nullable(),
});

type FormValues = z.infer<typeof baseSchema> & {
  isKeyResult: boolean;
  periodId?: string | null;
  objectiveId?: string | null;
};

export default function IndicatorsPage() {
  const { session } = useAuthSession();
  const token = session?.accessToken ?? "";

  const [modeKr, setModeKr] = useState<boolean>(true); // true = KR, false = KPI
  const [periodId, setPeriodId] = useState<string | undefined>();
  const [objectiveId, setObjectiveId] = useState<string | undefined>();

  const periodsQuery = useQuery({
    enabled: Boolean(token),
    queryKey: ["periods", "for-indicators"],
    queryFn: () => listPeriods(token, { limit: 50 }),
  });
  const periodList = periodsQuery.data?.items ?? [];

  useEffect(() => {
    if (!periodId && periodList.length) setPeriodId(periodList[0]!.id);
  }, [periodList, periodId]);

  const objectivesQuery = useQuery({
    enabled: Boolean(token && periodId),
    queryKey: ["objectives", periodId, "for-indicators"],
    queryFn: () => listObjectives(token, periodId!, { limit: 200 }),
  });
  const objectiveList = objectivesQuery.data?.items ?? [];

  useEffect(() => {
    if (modeKr && !objectiveId && objectiveList.length) setObjectiveId(objectiveList[0]!.id);
  }, [modeKr, objectiveList, objectiveId]);

  const indicatorsQuery = useQuery({
    enabled: Boolean(token && periodId),
    queryKey: ["indicators", periodId, objectiveId, modeKr],
    queryFn: async () => {
      const params: any = modeKr ? { objectiveId } : { periodId };
      const res = await listIndicators(token, { ...params, limit: 100 });
      return res.items.filter((i) => i.isKeyResult === modeKr);
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      isKeyResult: modeKr,
      code: "",
      name: "",
      direction: "UP",
      granularityDefault: "MONTH",
      unit: "",
    },
  });

  useEffect(() => {
    form.setValue("isKeyResult", modeKr);
  }, [modeKr, form]);

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: CreateIndicatorRequest = {
        code: values.code.trim(),
        name: values.name.trim(),
        isKeyResult: modeKr,
        direction: values.direction,
        granularityDefault: values.granularityDefault as PeriodGranularity,
        unit: values.unit || undefined,
        ...(modeKr ? { objectiveId } : { periodId }),
      };
      return createIndicator(token, payload);
    },
    onSuccess: () => indicatorsQuery.refetch(),
  });

  const indicators = indicatorsQuery.data ?? [];

  if (!token) return null;

  return (
    <AppLayout title="Indicadores (KRs & KPIs)">
      <div className="mx-auto max-w-6xl">
        <section className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
            {modeKr ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            <span className="mr-2">Modo:</span>
            <button
              className={`rounded px-2 py-0.5 ${modeKr ? "bg-white text-[#1f1d1b]" : "bg-transparent text-white/80"}`}
              onClick={() => setModeKr(true)}
            >
              KR
            </button>
            <button
              className={`rounded px-2 py-0.5 ${!modeKr ? "bg-white text-[#1f1d1b]" : "bg-transparent text-white/80"}`}
              onClick={() => setModeKr(false)}
            >
              KPI
            </button>
          </div>
          <span className="text-sm text-white/70">Período:</span>
          <select
            value={periodId ?? ""}
            onChange={(e) => setPeriodId(e.target.value || undefined)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-white/60"
          >
            {periodList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {modeKr ? (
            <>
              <span className="text-sm text-white/70">Objetivo:</span>
              <select
                value={objectiveId ?? ""}
                onChange={(e) => setObjectiveId(e.target.value || undefined)}
                className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-white/60"
              >
                {objectiveList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Criar {modeKr ? "KR" : "KPI"}</h2>
          <form
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          >
            <div>
              <label className="mb-1 block text-xs text-white/70">Código</label>
              <input className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("code")} />
              {form.formState.errors.code?.message && <p className="mt-1 text-xs text-red-300">{form.formState.errors.code.message}</p>}
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs text-white/70">Nome</label>
              <input className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("name")} />
              {form.formState.errors.name?.message && <p className="mt-1 text-xs text-red-300">{form.formState.errors.name.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Direção</label>
              <select className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("direction")}>
                <option value="UP">Para cima</option>
                <option value="DOWN">Para baixo</option>
                <option value="RANGE">Dentro da faixa</option>
                <option value="EQUAL">Igual</option>
                <option value="OUTSIDE_RANGE">Fora da faixa</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Granularidade</label>
              <select className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("granularityDefault")}>
                <option value="MONTH">Mensal</option>
                <option value="QUARTER">Trimestral</option>
                <option value="YEAR">Anual</option>
                <option value="WEEK">Semanal</option>
                <option value="DAY">Diária</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Unidade (opcional)</label>
              <input className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("unit")} />
            </div>
            <div className="lg:col-span-6">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#1f1d1b] shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/60"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar {modeKr ? "KR" : "KPI"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-white/80">{modeKr ? "KRs" : "KPIs"} cadastrados</h2>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-white/70">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Direção</th>
                  <th className="px-3 py-2">Granularidade</th>
                </tr>
              </thead>
              <tbody>
                {indicators.map((i) => (
                  <tr key={i.id} className="odd:bg-white/[0.025]">
                    <td className="px-3 py-2 font-mono text-white">{i.code}</td>
                    <td className="px-3 py-2 text-white/90">{i.name}</td>
                    <td className="px-3 py-2 text-white/80">{i.direction}</td>
                    <td className="px-3 py-2 text-white/80">{i.granularityDefault}</td>
                  </tr>
                ))}
                {indicators.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-white/50">Nenhum registro encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

