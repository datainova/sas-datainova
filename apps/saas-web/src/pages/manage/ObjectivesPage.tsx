import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import AppLayout from "../../components/AppLayout";
import { useAuthSession } from "../../hooks/useAuthSession";
import { createObjective, listObjectives, listPeriods } from "../../api/wizard";
import type { StrategicPeriod, StrategicCadence } from "../../types/wizard";
import { Loader2, Plus, CalendarRange } from "lucide-react";

const schema = z.object({
  periodId: z.string().uuid({ message: "Selecione um período" }),
  name: z.string().trim().min(2, "Informe um nome com 2+ caracteres"),
  description: z.string().trim().optional(),
  startDate: z.string().min(1, "Informe a data inicial"),
  endDate: z.string().min(1, "Informe a data final"),
  cadence: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "BIENNIAL"]).default("ANNUAL"),
});
type FormValues = z.infer<typeof schema>;

export default function ObjectivesPage() {
  const { session } = useAuthSession();
  const token = session?.accessToken ?? "";
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>();

  const periodsQuery = useQuery({
    enabled: Boolean(token),
    queryKey: ["periods", "for-objectives"],
    queryFn: () => listPeriods(token, { limit: 50 }),
  });

  const periodList = periodsQuery.data?.items ?? [];

  useEffect(() => {
    if (!selectedPeriod && periodList.length > 0) {
      setSelectedPeriod(periodList[0]!.id);
    }
  }, [periodList, selectedPeriod]);

  const objectivesQuery = useQuery({
    enabled: Boolean(token && selectedPeriod),
    queryKey: ["objectives", selectedPeriod],
    queryFn: () => listObjectives(token, selectedPeriod!, { limit: 100 }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", periodId: selectedPeriod, startDate: "", endDate: "", cadence: "ANNUAL" },
  });

  useEffect(() => {
    const p = periodList.find((x) => x.id === selectedPeriod);
    form.setValue("periodId", selectedPeriod ?? "");
    if (p) {
      form.setValue("startDate", p.startDate.substring(0, 10));
      form.setValue("endDate", p.endDate.substring(0, 10));
      form.setValue("cadence", p.cadence as StrategicCadence);
    }
  }, [selectedPeriod, periodList, form]);

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createObjective(token, {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        periodId: values.periodId,
        startDate: new Date(values.startDate).toISOString(),
        endDate: new Date(values.endDate).toISOString(),
        cadence: values.cadence,
      }),
    onSuccess: () => objectivesQuery.refetch(),
  });

  if (!token) return null;

  const objectives = objectivesQuery.data?.items ?? [];

  return (
    <AppLayout title="Objetivos (OKRs)">
      <div className="mx-auto max-w-6xl">
        <section className="mb-6 flex items-center gap-3">
          <span className="text-sm text-white/70">Período:</span>
          <select
            value={selectedPeriod ?? ""}
            onChange={(e) => setSelectedPeriod(e.target.value || undefined)}
            className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-white/60"
          >
            {periodList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <a href="/manage/periods" className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white/90">
            <CalendarRange className="h-3.5 w-3.5" /> Gerenciar períodos
          </a>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Criar objetivo</h2>
          <form
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          >
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs text-white/70">Nome</label>
              <input className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("name")} />
              {form.formState.errors.name?.message && <p className="mt-1 text-xs text-red-300">{form.formState.errors.name.message}</p>}
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs text-white/70">Descrição (opcional)</label>
              <input className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("description")} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Início</label>
              <input type="date" className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("startDate")} />
              {form.formState.errors.startDate?.message && <p className="mt-1 text-xs text-red-300">{form.formState.errors.startDate.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Fim</label>
              <input type="date" className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("endDate")} />
              {form.formState.errors.endDate?.message && <p className="mt-1 text-xs text-red-300">{form.formState.errors.endDate.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Cadência</label>
              <select className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("cadence")}>
                <option value="ANNUAL">Anual</option>
                <option value="SEMIANNUAL">Semestral</option>
                <option value="QUARTERLY">Trimestral</option>
                <option value="MONTHLY">Mensal</option>
                <option value="BIENNIAL">Bienal</option>
              </select>
            </div>
            <div className="lg:col-span-6">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#1f1d1b] shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/60"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar objetivo
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Objetivos do período</h2>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5 text-left text-white/70">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Início</th>
                  <th className="px-3 py-2">Fim</th>
                  <th className="px-3 py-2">Cadência</th>
                </tr>
              </thead>
              <tbody>
                {objectives.map((o) => (
                  <tr key={o.id} className="odd:bg-white/[0.025]">
                    <td className="px-3 py-2 font-medium text-white">{o.name}</td>
                    <td className="px-3 py-2 text-white/80">{new Date(o.startDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-white/80">{new Date(o.endDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-white/80">{o.cadence}</td>
                  </tr>
                ))}
                {objectives.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-white/50">Nenhum objetivo neste período.</td>
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

