import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Card } from '../../../design-system/components/Card';
import { EmptyState } from '../../../design-system/components/EmptyState';

const AlertsPage = () => {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Alertas"
        title="Centro de alertas"
        description="Monitore ingestões, integrações e desvios críticos nos indicadores."
      />

      <Card title="Alertas" subtitle="Nenhum alerta crítico no momento.">
        <EmptyState
          title="Tudo operando"
          description="Acompanhe aqui falhas de ingestão de dados, integrações e violações de SLA."
        />
      </Card>
    </div>
  );
};

export default AlertsPage;
