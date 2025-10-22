import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useObjectivesQuery } from '../../modules/objectives/api/objectiveApi';
import { useKeyResultsByObjectiveQuery } from '../../modules/kresults/api/kresultApi';
import { useKpisQuery } from '../../modules/kpis/api/kpiApi';
import { Card } from '../../design-system/components/Card';
import { Badge } from '../../design-system/components/Badge';
import type { Objective } from '../../core/types/strategic';

const statusTone: Record<string, Parameters<typeof Badge>[0]['tone']> = {
  ACTIVE: 'success',
  DRAFT: 'muted',
  ARCHIVED: 'muted'
};

const Dashboard = () => {
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
      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Objetivos ativos" value={summary.active} trend={`Total: ${summary.totalObjectives}`} />
        <SummaryCard label="Rascunhos" value={summary.draft} trend="Objetivos aguardando validação" />
        <SummaryCard label="Arquivados" value={summary.archived} trend="Histórico para referência" />
        <SummaryCard label="KPIs monitorados" value={kpis.length} trend="Indicadores operacionais ativos" />
      </section>

      <Card title="Saúde dos objetivos" subtitle="Visão operacional do ciclo de execução estratégico.">
        {objectives.length === 0 ? (
          <p className="text-sm text-slate-400">Cadastre o primeiro objetivo para acompanhar aqui.</p>
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
  value: string | number;
  trend: string;
  alert?: boolean;
};

const SummaryCard = ({ label, value, trend, alert }: SummaryCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className={`rounded-2xl border ${alert ? 'border-warning-500/40 bg-warning-500/10' : 'border-slate-800 bg-slate-900/40'} p-5`}
  >
    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
    <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    <p className="text-xs text-slate-400">{trend}</p>
  </motion.div>
);

type ObjectiveCardProps = {
  objective: Objective;
  index: number;
};

const ObjectiveCard = ({ objective, index }: ObjectiveCardProps) => {
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
        <Badge tone={statusTone[objective.status] ?? 'muted'}>{statusLabel(objective.status)}</Badge>
      </header>
      <p className="mt-2 text-sm text-slate-400">{objective.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
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
      <KrsPreview objectiveId={objective.id} />
    </motion.article>
  );
};

type KrsPreviewProps = {
  objectiveId: string;
};

const KrsPreview = ({ objectiveId }: KrsPreviewProps) => {
  const { data: krs = [] } = useKeyResultsByObjectiveQuery(objectiveId);

  if (!krs.length) {
    return <p className="mt-4 text-xs text-slate-500">Sem KResults cadastrados ainda.</p>;
  }

  return (
    <div className="mt-6 space-y-3">
      {krs.slice(0, 3).map((kr) => (
        <div key={kr.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-white">{kr.title}</p>
            <Badge tone={statusTone[kr.status] ?? 'muted'}>{indicatorStatusLabel(kr.status)}</Badge>
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
    </div>
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

export default Dashboard;
