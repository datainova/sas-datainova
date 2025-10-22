import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Card } from '../../../design-system/components/Card';
import { EmptyState } from '../../../design-system/components/EmptyState';

const CheckinsPage = () => {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Check-ins"
        title="Rituais de acompanhamento"
        description="Organize os check-ins semanais e registre decisões chave."
      />

      <Card title="Próximos check-ins" subtitle="Configure cadências para objetivos e times.">
        <EmptyState
          title="Sem check-ins agendados"
          description="Agende check-ins para reforçar accountability e cadência de comunicação."
        />
      </Card>
    </div>
  );
};

export default CheckinsPage;
