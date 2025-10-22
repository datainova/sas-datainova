import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Button } from '../../../design-system/components/Button';
import { Card } from '../../../design-system/components/Card';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { Badge } from '../../../design-system/components/Badge';
import { useObjectivesQuery } from '../api/objectiveApi';
import type { Objective, ObjectiveStatus } from '../../../core/types/strategic';

const statusTone: Record<ObjectiveStatus, Parameters<typeof Badge>[0]['tone']> = {
  ACTIVE: 'success',
  DRAFT: 'muted',
  ARCHIVED: 'muted'
};

const statusLabel: Record<ObjectiveStatus, string> = {
  ACTIVE: 'Ativo',
  DRAFT: 'Rascunho',
  ARCHIVED: 'Arquivado'
};

const ObjectivesListPage = () => {
  const { data: objectives = [], isLoading } = useObjectivesQuery();
  const navigate = useNavigate();

  const totals = useMemo(() => {
    const total = objectives.length;
    const active = objectives.filter((objective) => objective.status === 'ACTIVE').length;
    const draft = objectives.filter((objective) => objective.status === 'DRAFT').length;
    const archived = objectives.filter((objective) => objective.status === 'ARCHIVED').length;
    return { total, active, draft, archived };
  }, [objectives]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Portfólio"
        title="Objetivos estratégicos em execução"
        description="Acompanhe a saúde dos objetivos, cadências e segmentações para garantir foco e accountability."
        actions={<Button onClick={() => navigate('/objectives/new')}>Novo objetivo</Button>}
      />

      <Card>
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryStat label="Total" value={totals.total} />
          <SummaryStat label="Ativos" value={totals.active} tone="success" />
          <SummaryStat label="Rascunhos" value={totals.draft} />
          <SummaryStat label="Arquivados" value={totals.archived} tone="muted" />
        </div>
      </Card>

      <Card title="Objetivos" subtitle="Resumo operacional dos objetivos vigentes.">
        {isLoading ? (
          <div className="animate-pulse text-sm text-slate-400">Carregando objetivos...</div>
        ) : objectives.length === 0 ? (
          <EmptyState
            title="Nenhum objetivo ainda"
            description="Crie o primeiro objetivo estratégico para alinhar times e metas."
            action={{ label: 'Criar objetivo', onClick: () => navigate('/objectives/new') }}
          />
        ) : (
          <div className="space-y-4">
            {objectives.map((objective) => (
              <ObjectiveRow key={objective.id} objective={objective} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

type SummaryStatProps = {
  label: string;
  value: number;
  tone?: Parameters<typeof Badge>[0]['tone'];
};

const SummaryStat = ({ label, value, tone = 'muted' }: SummaryStatProps) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    {tone !== 'muted' ? <Badge tone={tone}>{tone === 'success' ? 'Saudável' : tone === 'warning' ? 'Atenção' : 'Crítico'}</Badge> : null}
  </div>
);

type ObjectiveRowProps = {
  objective: Objective;
};

const ObjectiveRow = ({ objective }: ObjectiveRowProps) => (
  <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
    <Link to={`/objectives/${objective.id}`} className="text-lg font-semibold text-white transition hover:text-brand-200">
      {objective.title}
    </Link>
    <p className="text-sm text-slate-400">{objective.description}</p>
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
      <Badge tone={statusTone[objective.status]}>{statusLabel[objective.status]}</Badge>
      <span className="rounded-full border border-slate-800 px-3 py-1 uppercase tracking-[0.2em]">
        {objective.cadence}
      </span>
      <span>
        {formatDate(objective.startDate)} → {formatDate(objective.endDate)}
      </span>
    </div>
    {objective.segments.length ? (
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        {objective.segments.map((segment) => (
          <span key={segment.id} className="rounded-full border border-slate-800 px-2 py-1">
            {segment.label}
          </span>
        ))}
      </div>
    ) : null}
  </div>
);

const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

export default ObjectivesListPage;
