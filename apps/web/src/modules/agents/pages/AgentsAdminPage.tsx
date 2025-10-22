import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Card } from '../../../design-system/components/Card';
import { Button } from '../../../design-system/components/Button';

const AgentsAdminPage = () => {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Agent"
        title="Automação corporativa"
        description="Gerencie o agent responsável por ingestão, políticas de dados e integrações MCP."
      />

      <Card
        title="Status do agent"
        subtitle="Provisionado em cluster privado. SLA 24x7 ativo."
        actions={<Button variant="secondary">Executar health check</Button>}
      >
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• Último heartbeat há 3 minutos</li>
          <li>• 4 integrações ativas (HubSpot, Slack, Stripe, Data Warehouse)</li>
          <li>• Atualização automática habilitada</li>
        </ul>
      </Card>

      <Card title="Playbooks automatizados" subtitle="Configure automações para disparo de alertas e ingestões.">
        <p className="text-sm text-slate-300">
          Playbooks permitem reagir a eventos críticos automaticamente: abrir tickets, enviar alertas ou acionar fluxos MCP.
        </p>
        <Button className="mt-4" variant="primary">
          Criar playbook
        </Button>
      </Card>
    </div>
  );
};

export default AgentsAdminPage;
