import { motion } from "framer-motion";
import { useMemo } from "react";
import { Target, CalendarRange, Users, Building2, Settings, Activity, ChevronRight, ListChecks } from "lucide-react";
import { useAuthSession } from "../hooks/useAuthSession";
import { config } from "../config";

export function HomePage() {
  const { session } = useAuthSession();
  const docsUrl = useMemo(() => config.apiBaseUrl.replace(/\/v1$/, "") + "/docs", []);

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <Hero />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            icon={<CalendarRange className="h-5 w-5" />}
            title="Criar Período"
            description="Defina a janela estratégica (OKRs/indicadores)."
            href="/wizard/objectives"
          />
          <QuickAction
            icon={<Target className="h-5 w-5" />}
            title="Wizard de Objetivos"
            description="Crie objetivos e KRs guiados em minutos."
            href="/wizard/objectives"
          />
          <QuickAction
            icon={<Users className="h-5 w-5" />}
            title="Convidar Membros"
            description="Traga seu time para colaborar (em breve)."
          />
        </section>

        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold text-white/90">Cadastros</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <RegistryCard
              icon={<ListChecks className="h-5 w-5" />}
              title="Períodos"
              subtitle="Gerencie períodos estratégicos"
              href="/manage/periods"
            />
            <RegistryCard
              icon={<Target className="h-5 w-5" />}
              title="Indicadores"
              subtitle="Catálogo de PIs/KRs (em breve)"
            />
            <RegistryCard
              icon={<Building2 className="h-5 w-5" />}
              title="Organização"
              subtitle="Dados e preferências (em breve)"
            />
            <RegistryCard
              icon={<Users className="h-5 w-5" />}
              title="Membros"
              subtitle="Convites, cargos e acessos (em breve)"
            />
            <RegistryCard
              icon={<Activity className="h-5 w-5" />}
              title="Alertas"
              subtitle="Regras e acknowledge (em breve)"
            />
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/25"
            >
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-white/80" />
                <div>
                  <p className="font-medium">API & Docs</p>
                  <p className="text-sm text-white/60">Swagger da API do SaaS</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-white/40 transition group-hover:text-white/80" />
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-[#0e0e0e]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.07),transparent_45%)]" />
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-xs uppercase tracking-[0.35em] text-white/70"
        >
          DataInova Connect
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="font-display text-3xl sm:text-4xl"
        >
          Decida com objetivos claros e métricas confiáveis
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-3xl text-sm text-white/70"
        >
          Uma página inicial imersiva para começar rápido: crie períodos, objetivos e indicadores,
          convide seu time e acompanhe a execução com governança.
        </motion.p>
        <div className="mt-2 flex gap-3">
          <a
            href="/wizard/objectives"
            className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#1f1d1b] shadow-sm transition hover:bg-white/90"
          >
            <Target className="h-4 w-4" /> Abrir Wizard
          </a>
          <a
            href="/manage/periods"
            className="inline-flex items-center gap-2 rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/40"
          >
            <CalendarRange className="h-4 w-4" /> Cadastros
          </a>
        </div>
      </div>
    </section>
  );
}

function QuickAction({ icon, title, description, href }: { icon: React.ReactNode; title: string; description: string; href?: string }) {
  const content = (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 transition group-hover:border-white/25">
      <div className="mt-0.5 text-white/80">{icon}</div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-white/60">{description}</p>
      </div>
      <ChevronRight className="ml-auto h-5 w-5 text-white/40 transition group-hover:text-white/80" />
    </div>
  );
  return href ? (
    <a href={href} className="group">{content}</a>
  ) : (
    <div className="opacity-70">{content}</div>
  );
}

function RegistryCard({ icon, title, subtitle, href }: { icon: React.ReactNode; title: string; subtitle: string; href?: string }) {
  const body = (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition group-hover:border-white/25">
      <div className="flex items-center gap-3">
        <div className="text-white/80">{icon}</div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-white/60">{subtitle}</p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-white/40 transition group-hover:text-white/80" />
    </div>
  );
  return href ? (
    <a href={href} className="group">{body}</a>
  ) : (
    <div className="opacity-70">{body}</div>
  );
}

export default HomePage;

