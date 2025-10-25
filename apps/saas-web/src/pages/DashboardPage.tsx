import { useEffect, useMemo } from "react";
import AppLayout from "../components/AppLayout";
import { Target, Activity, Users, CalendarRange } from "lucide-react";
import { useAuthSession } from "../hooks/useAuthSession";

export function DashboardPage() {
  const { session } = useAuthSession();
  const name = session?.user.name ?? session?.user.email ?? "";

  // Placeholder sparkline SVG
  const Sparkline = useMemo(() => (
    <svg viewBox="0 0 100 28" className="h-10 w-full">
      <polyline
        fill="rgba(255,255,255,0.08)"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1"
        points="0,20 10,18 20,16 30,14 40,10 50,12 60,8 70,12 80,9 90,6 100,8"
      />
    </svg>
  ), []);

  return (
    <AppLayout title="Dashboard">
      <section className="mb-6">
        <h1 className="text-xl font-semibold">Bem-vindo, {name.split(" ")[0]}</h1>
        <p className="text-sm text-white/70">Aqui está um panorama rápido do ambiente.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Target className="h-4 w-4" />} title="Objetivos ativos" value="—" sparkline={Sparkline} />
        <KpiCard icon={<Activity className="h-4 w-4" />} title="Indicadores" value="—" sparkline={Sparkline} />
        <KpiCard icon={<CalendarRange className="h-4 w-4" />} title="Períodos" value="—" sparkline={Sparkline} />
        <KpiCard icon={<Users className="h-4 w-4" />} title="Membros" value="—" sparkline={Sparkline} />
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-white/90">Próximas ações</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-white/70">
            <li>Crie seu período estratégico atual.</li>
            <li>Cadastre um objetivo e seus KRs de acompanhamento.</li>
            <li>Convide sua equipe para colaborar.</li>
          </ul>
          <div className="mt-3 flex gap-3">
            <a href="/wizard/objectives" className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-[#1f1d1b]">Abrir Wizard</a>
            <a href="/manage/periods" className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/80">Períodos</a>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-white/90">Atividade recente</h3>
          <p className="text-sm text-white/60">Nenhuma atividade por enquanto.</p>
        </div>
      </section>
    </AppLayout>
  );
}

function KpiCard({ icon, title, value, sparkline }: { icon: React.ReactNode; title: string; value: string | number; sparkline?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/80">{icon}<span className="text-sm">{title}</span></div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
      <div className="mt-2">{sparkline}</div>
    </div>
  );
}

export default DashboardPage;

