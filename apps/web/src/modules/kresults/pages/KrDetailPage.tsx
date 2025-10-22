import { useNavigate, useParams } from 'react-router-dom';
import { useKeyResultDetailQuery } from '../api/kresultApi';
import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Card } from '../../../design-system/components/Card';
import { Badge } from '../../../design-system/components/Badge';
import { EmptyState } from '../../../design-system/components/EmptyState';
import type { KeyResult } from '../../../core/types/strategic';

const toneByStatus: Record<string, Parameters<typeof Badge>[0]['tone']> = {
  ACTIVE: 'success',
  DRAFT: 'muted',
  ARCHIVED: 'muted'
};

const KrDetailPage = () => {
  const { kresultId = '' } = useParams();
  const navigate = useNavigate();
  const { data: keyResult, isLoading } = useKeyResultDetailQuery(kresultId);

  if (isLoading) {
    return <div className="text-sm text-slate-400">Carregando resultado-chave...</div>;
  }

  if (!keyResult) {
    return (
      <EmptyState
        title="Resultado-chave não encontrado"
        description="Verifique se o link está correto ou se você possui acesso."
        action={{ label: 'Voltar para objetivos', onClick: () => navigate('/objectives') }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="KResult"
        title={keyResult.title}
        description={keyResult.description}
        actions={<Badge tone={toneByStatus[keyResult.status] ?? 'muted'}>{statusLabel(keyResult.status)}</Badge>}
      />

      <Card title="Visão geral" subtitle="Contexto de medição e metas.">
        <div className="grid gap-6 md:grid-cols-3">
          <DetailItem label="Direção" value={directionLabel(keyResult.direction)} />
          <DetailItem label="Unidade" value={unitLabel(keyResult.unitCode, keyResult.unitCustom)} />
          <DetailItem label="Cadência" value={keyResult.cadence} />
          <DetailItem label="Período" value={`${formatDate(keyResult.startDate)} → ${formatDate(keyResult.endDate)}`} />
          <DetailItem label="Status" value={statusLabel(keyResult.status)} />
          <DetailItem label="Indicador" value={keyResult.id} />
        </div>
      </Card>

      <Card title="Segmentos"
        subtitle={keyResult.segments.length ? 'Análises por eixo configuradas.' : 'Nenhum eixo configurado ainda.'}
      >
        {keyResult.segments.length ? (
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            {keyResult.segments.map((segment) => (
              <span key={segment.id} className="rounded-full border border-slate-800 px-3 py-1">
                {segment.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Use segmentação para encontrar tendências por região, canal ou portfólio.</p>
        )}
      </Card>
    </div>
  );
};

type DetailItemProps = {
  label: string;
  value: string;
};

const DetailItem = ({ label, value }: DetailItemProps) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
    <p className="mt-2 text-sm text-slate-200">{value}</p>
  </div>
);

const directionLabel = (direction: KeyResult['direction']) => {
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

const formatDate = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

export default KrDetailPage;
