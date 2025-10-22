import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { useObjectiveDetailQuery } from '../api/objectiveApi';
import { useKeyResultsByObjectiveQuery } from '../../kresults/api/kresultApi';
import { Card } from '../../../design-system/components/Card';
import { Badge } from '../../../design-system/components/Badge';
import { Button } from '../../../design-system/components/Button';
import { EmptyState } from '../../../design-system/components/EmptyState';
import type { Objective, ObjectiveStatus, KeyResult } from '../../../core/types/strategic';

const statusTone: Record<ObjectiveStatus, Parameters<typeof Badge>[0]['tone']> = {
  ACTIVE: 'success',
  DRAFT: 'muted',
  ARCHIVED: 'muted'
};

const krStatusTone: Record<string, Parameters<typeof Badge>[0]['tone']> = {
  ACTIVE: 'success',
  DRAFT: 'muted',
  ARCHIVED: 'muted'
};

const ObjectiveDetailPage = () => {
  const { objectiveId = '' } = useParams();
  const navigate = useNavigate();
  const { data: objective, isLoading } = useObjectiveDetailQuery(objectiveId);
  const { data: keyResults = [], isLoading: loadingKrs } = useKeyResultsByObjectiveQuery(objectiveId);

  if (isLoading) {
    return <div className="text-sm text-slate-400">Carregando objetivo...</div>;
  }

  if (!objective) {
    return (
      <EmptyState
        title="Objetivo não encontrado"
        description="O objetivo pode ter sido removido ou você não possui acesso."
        action={{ label: 'Voltar aos objetivos', onClick: () => navigate('/objectives') }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Objetivo"
        title={objective.title}
        description={objective.description}
        actions={
          <Button onClick={() => navigate(`/objectives/${objective.id}/kresults/new`)}>Adicionar KResult</Button>
        }
      />

      <Card title="Overview" subtitle="Resumo dos metadados estratégicos.">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</p>
            <Badge tone={statusTone[objective.status]}>{statusLabel(objective.status)}</Badge>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Cadência</p>
            <p className="text-sm text-slate-200">{objective.cadence}</p>
          </div>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Janela</p>
            <p className="text-sm text-slate-200">
              {formatDate(objective.startDate)} → {formatDate(objective.endDate)}
            </p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Segmentos</p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              {objective.segments.length
                ? objective.segments.map((segment) => (
                    <span key={segment.id} className="rounded-full border border-slate-800 px-2 py-1">
                      {segment.label}
                    </span>
                  ))
                : 'Sem segmentação definida'}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Identificador</p>
            <p className="text-sm text-slate-200 font-mono">{objective.id}</p>
          </div>
        </div>
      </Card>

      <Card title="Resultados-chave" subtitle="Indicadores conectados ao objetivo.">
        {loadingKrs ? (
          <div className="text-sm text-slate-400">Carregando resultados-chave...</div>
        ) : keyResults.length === 0 ? (
          <EmptyState
            title="Sem KResults cadastrados"
            description="Registre resultados-chave para tornar o objetivo mensurável."
            action={{ label: 'Adicionar KResult', onClick: () => navigate(`/objectives/${objective.id}/kresults/new`) }}
          />
        ) : (
          <div className="space-y-4">
            {keyResults.map((kr) => (
              <KeyResultRow key={kr.id} keyResult={kr} />
            ))}
          </div>
        )}
      </Card>

      <Card tone="info" title="Configurar segmentações avançadas">
        <p className="text-sm text-info-100">
          Utilize o Agent para automatizar ingestão de dados e manter os indicadores sempre atualizados. Recursos liberados no
          plano Enterprise.
        </p>
      </Card>
    </div>
  );
};

type KeyResultRowProps = {
  keyResult: KeyResult;
};

const KeyResultRow = ({ keyResult }: KeyResultRowProps) => {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="flex items-center justify-between">
        <Link to={`/kresults/${keyResult.id}`} className="text-sm font-semibold text-white transition hover:text-brand-200">
          {keyResult.title}
        </Link>
        <Badge tone={krStatusTone[keyResult.status] ?? 'muted'}>{indicatorStatusLabel(keyResult.status)}</Badge>
      </div>
      <p className="text-xs text-slate-400">{keyResult.description}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-slate-800 px-2 py-1 uppercase tracking-[0.2em]">
          {keyResult.direction}
        </span>
        <span className="rounded-full border border-slate-800 px-2 py-1 uppercase tracking-[0.2em]">
          {unitLabel(keyResult.unitCode, keyResult.unitCustom)}
        </span>
        <span>
          {formatDate(keyResult.startDate)} → {formatDate(keyResult.endDate)}
        </span>
      </div>
      {keyResult.segments.length ? (
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
          {keyResult.segments.map((segment) => (
            <span key={segment.id} className="rounded-full border border-slate-800 px-2 py-1">
              {segment.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const statusLabel = (status: ObjectiveStatus) => {
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

const unitLabel = (unitCode: string, unitCustom?: string | null) => {
  switch (unitCode) {
    case 'PERCENT':
      return 'Percentual';
    case 'NUMBER':
      return 'Número';
    case 'CURRENCY':
      return 'Financeiro';
    default:
      return unitCustom ?? unitCode;
  }
};

const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

export default ObjectiveDetailPage;
