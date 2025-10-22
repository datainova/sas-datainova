import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Card } from '../../../design-system/components/Card';
import { Button } from '../../../design-system/components/Button';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { Badge } from '../../../design-system/components/Badge';
import { useKpisQuery } from '../api/kpiApi';
import type { Kpi } from '../../../core/types/strategic';

const statusTone: Record<string, Parameters<typeof Badge>[0]['tone']> = {
  ACTIVE: 'success',
  DRAFT: 'muted',
  ARCHIVED: 'muted'
};

const KpiListPage = () => {
  const { data: kpis = [], isLoading } = useKpisQuery();
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="KPIs"
        title="Indicadores operacionais"
        description="KPIs suportam check-ins frequentes e sinalizam tendências emergentes."
        actions={<Button onClick={() => navigate('/kpis/new')}>Novo KPI</Button>}
      />

      <Card title="KPIs" subtitle="Monitoramento contínuo de indicadores críticos.">
        {isLoading ? (
          <div className="text-sm text-slate-400">Carregando KPIs...</div>
        ) : kpis.length === 0 ? (
          <EmptyState
            title="Sem KPIs cadastrados"
            description="Cadastre KPIs para reforçar a operação e alimentar dashboards."
            action={{ label: 'Criar KPI', onClick: () => navigate('/kpis/new') }}
          />
        ) : (
          <div className="space-y-4">
            {kpis.map((kpi) => (
              <KpiRow key={kpi.id} kpi={kpi} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

type KpiRowProps = {
  kpi: Kpi;
};

const KpiRow = ({ kpi }: KpiRowProps) => {
  return (
    <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-white">{kpi.title}</p>
        <Badge tone={statusTone[kpi.status] ?? 'muted'}>{statusLabel(kpi.status)}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-slate-800 px-2 py-1 uppercase tracking-[0.2em]">
          {directionLabel(kpi.direction)}
        </span>
        <span className="rounded-full border border-slate-800 px-2 py-1 uppercase tracking-[0.2em]">
          {unitLabel(kpi.unitCode, kpi.unitCustom)}
        </span>
        <span className="rounded-full border border-slate-800 px-2 py-1 uppercase tracking-[0.2em]">
          {kpi.cadence}
        </span>
      </div>
    </div>
  );
};

const statusLabel = (status: string) => {
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

const directionLabel = (direction: Kpi['direction']) => {
  switch (direction) {
    case 'INCREASE':
      return 'Aumentar';
    case 'DECREASE':
      return 'Reduzir';
    case 'MAINTAIN':
      return 'Manter';
    default:
      return direction;
  }
};

const unitLabel = (unitCode: string, unitCustom?: string | null) => {
  switch (unitCode) {
    case 'NUMBER':
      return 'Número absoluto';
    case 'PERCENT':
      return 'Percentual';
    case 'CURRENCY':
      return 'Financeiro';
    default:
      return unitCustom ?? unitCode;
  }
};

export default KpiListPage;
