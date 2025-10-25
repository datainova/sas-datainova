import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useAuthSession } from "../../hooks/useAuthSession";
import { createPeriod, listPeriods, updatePeriod } from "../../api/wizard";
import { useToast } from "../../components/ToastProvider";
import AppLayout from "../../components/AppLayout";

const schema = z.object({
  name: z.string().trim().min(2, "Informe um nome com 2+ caracteres"),
  startDate: z.string().min(1, "Informe a data inicial"),
  endDate: z.string().min(1, "Informe a data final"),
  cadence: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "BIENNIAL"]).default("ANNUAL"),
});
type FormValues = z.infer<typeof schema>;

export function PeriodsPage() {
  const { session } = useAuthSession();
  const token = session?.accessToken ?? "";
  const [cursor, setCursor] = useState<string | undefined>();
  const { addToast } = useToast();

  const listQuery = useQuery({
    enabled: Boolean(token),
    queryKey: ["periods", cursor],
    queryFn: async () => {
      const res = await listPeriods(token, { limit: 20, cursor });
      return res;
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", startDate: "", endDate: "", cadence: "ANNUAL" },
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => createPeriod(token, values),
    onSuccess: () => {
      addToast({ type: "success", title: "Período criado" });
      listQuery.refetch();
      form.reset({ name: "", startDate: "", endDate: "", cadence: "ANNUAL" });
    },
    onError: (err: any) => {
      addToast({ type: "error", title: "Falha ao criar período", description: String(err?.message ?? err) });
    }
  });

  if (!token) return null;

  const items = listQuery.data?.items ?? [];
  const next = listQuery.data?.page?.next ?? null;

  return (
    <AppLayout title="Períodos">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Criar novo período</h2>
          <form
            onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-white/70">Nome</label>
              <input className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("name")} />
              {form.formState.errors.name?.message && (
                <p className="mt-1 text-xs text-red-300">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Início</label>
              <input type="date" className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("startDate")} />
              {form.formState.errors.startDate?.message && (
                <p className="mt-1 text-xs text-red-300">{form.formState.errors.startDate.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70">Fim</label>
              <input type="date" className="w-full rounded-md border border-white/15 bg-black/30 p-2 text-sm outline-none focus:ring-2 focus:ring-white/60" {...form.register("endDate")} />
              {form.formState.errors.endDate?.message && (
                <p className="mt-1 text-xs text-red-300">{form.formState.errors.endDate.message}</p>
              )}
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

            <div className="sm:col-span-2 lg:col-span-5">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#1f1d1b] shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/60"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar período
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-white/80">Períodos existentes</h2>
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
                {items.map((p) => (
                  <tr key={p.id} className="odd:bg-white/[0.025]">
                    <td className="px-3 py-2 font-medium text-white"><a className="hover:underline" href={`/wizard/objectives/${p.id}`}>{p.name}</a></td>
                    <td className="px-3 py-2 text-white/80">{new Date(p.startDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-white/80">{new Date(p.endDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-white/80">{p.cadence}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-white/50">Nenhum período encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            {next ? (
              <button onClick={() => setCursor(next)} className="rounded-md border border-white/20 px-3 py-1 text-sm text-white/80 hover:border-white/40">
                Carregar mais
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

export default PeriodsPage;
