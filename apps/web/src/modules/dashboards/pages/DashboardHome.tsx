import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Card } from '../../../design-system/components/Card';
import { Badge } from '../../../design-system/components/Badge';
import { useObjectivesQuery } from '../../objectives/api/objectiveApi';
import { useKpisQuery } from '../../kpis/api/kpiApi';
import { useKeyResultsByObjectiveQuery } from '../../kresults/api/kresultApi';
import type { Objective } from '../../../core/types/strategic';

const badgeToneForObjective = (status: Objective['status']): Parameters<typeof Badge>[0]['tone'] => {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'DRAFT':
      return 'info';
    case 'ARCHIVED':
      return 'muted';
    default:
      return 'muted';
  }
};

const badgeToneForIndicator = (status: string): Parameters<typeof Badge>[0]['tone'] => {
  switch (status) {
    case 'ON_TRACK':
    case 'ACTIVE':
      return 'success';
    case 'AT_RISK':
    case 'WARNING':
      return 'warning';
    case 'OFF_TRACK':
    case 'FAILED':
      return 'danger';
    default:
      return 'muted';
  }
};

const DashboardHome = () => {
  const { data: objectives = [] } = useObjectivesQuery();
  const { data: kpis = [] } = useKpisQuery();

  const summary = useMemo(() => {
    const totalObjectives = objectives.length;
    const active = objectives.filter((objective) => objective.status === 'ACTIVE').length;
    const draft = objectives.filter((objective) => objective.status === 'DRAFT').length;
    const archived = objectives.filter((objective) => objective.status === 'ARCHIVED').length;
    return { totalObjectives, active, draft, archived };
  }, [objectives]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Visão geral"
        title="Saúde da execução estratégica"
        description="Resumo executivo dos objetivos, resultados-chave e KPIs monitorados no ciclo atual."
      />

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Objetivos ativos" value={summary.active} detail={`Total: ${summary.totalObjectives}`} />
        <SummaryCard label="Rascunhos" value={summary.draft} detail="Objetivos aguardando validação" />
        <SummaryCard label="Arquivados" value={summary.archived} detail="Histórico para referência" />
        <SummaryCard label="KPIs monitorados" value={kpis.length} detail="Indicadores ativos" />
      </section>

      <Card title="Objetivos" subtitle="Estado atual dos objetivos estratégicos e seus resultados-chave.">
        {objectives.length === 0 ? (
          <p className="text-sm text-slate-400">Cadastre objetivos para visualizar o painel executivo.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {objectives.map((objective, index) => (
              <ObjectiveCard key={objective.id} objective={objective} index={index} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

type SummaryCardProps = {
  label: string;
  value: number;
  detail: string;
  alert?: boolean;
};

const SummaryCard = ({ label, value, detail, alert }: SummaryCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`rounded-2xl border ${alert ? 'border-warning-500/40 bg-warning-500/10' : 'border-slate-800 bg-slate-900/40'} p-5`}
  >
    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
    <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    <p className="text-xs text-slate-400">{detail}</p>
  </motion.div>
);

type ObjectiveCardProps = {
  objective: Objective;
  index: number;
};

const ObjectiveCard = ({ objective, index }: ObjectiveCardProps) => {
  const { data: keyResults = [] } = useKeyResultsByObjectiveQuery(objective.id);

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6"
    >
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Objetivo</p>
          <h4 className="text-lg font-semibold text-white">{objective.title}</h4>
        </div>
        <Badge tone={badgeToneForObjective(objective.status)}>{statusLabel(objective.status)}</Badge>
      </header>
      <p className="mt-2 text-sm text-slate-400">{objective.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-slate-800 px-3 py-1 uppercase tracking-[0.2em]">
          {objective.cadence}
        </span>
        <span>
          {formatDate(objective.startDate)} → {formatDate(objective.endDate)}
        </span>
      </div>
      {objective.segments.length ? (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
          {objective.segments.map((segment) => (
            <span key={segment.id} className="rounded-full border border-slate-800 px-2 py-1">
              {segment.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-6 space-y-3">
        {keyResults.slice(0, 3).map((kr) => (
          <div key={kr.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-white">{kr.title}</p>
              <Badge tone={badgeToneForIndicator(kr.status)}>{indicatorStatusLabel(kr.status)}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-slate-800 px-2 py-1 uppercase tracking-[0.16em]">
                {kr.direction}
              </span>
              <span>
                {formatDate(kr.startDate)} → {formatDate(kr.endDate)}
              </span>
            </div>
          </div>
        ))}
        {keyResults.length > 3 ? (
          <p className="text-xs text-slate-500">+{keyResults.length - 3} KRs adicionais</p>
        ) : null}
      </div>
    </motion.article>
  );
};

const statusLabel = (status: Objective['status']) => {
  switch (status) {
    case 'ACTIVE':
      return 'Ativo';
    case 'DRAFT':
      return 'Rascunho';
    case 'ARCHIVED':
      return 'Arquivado';
    default:
      return status;
  }
};

const indicatorStatusLabel = (status: string) => {
  switch (status) {
    case 'ON_TRACK':
      return 'Em dia';
    case 'AT_RISK':
      return 'Em risco';
    case 'OFF_TRACK':
      return 'Fora da meta';
    case 'ACTIVE':
      return 'Ativo';
    case 'DRAFT':
      return 'Rascunho';
    case 'ARCHIVED':
      return 'Arquivado';
    default:
      return status;
  }
};

const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

export default DashboardHome;
