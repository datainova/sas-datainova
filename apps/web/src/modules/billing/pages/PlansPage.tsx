import { PageHeader } from '../../../design-system/layout/PageHeader';
import { Card } from '../../../design-system/components/Card';
import { Button } from '../../../design-system/components/Button';

const plans = [
  {
    name: 'Free',
    price: 'R$0',
    description: 'Ideal para pequenas equipes validarem o fluxo.',
    features: ['3 objetivos', '5 KResults', 'KPIs básicos', 'Check-ins semanais']
  },
  {
    name: 'Pro',
    price: 'R$890/mês',
    description: 'Para squads que precisam de execução disciplinada.',
    features: ['Objetivos ilimitados', 'Segmentação avançada', 'Integração HubSpot', 'Alertas operacionais']
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'Governança, agent dedicado e integrações MCP.',
    features: ['Agent privado', 'SLA 24x7', 'Workspaces ilimitados', 'Controle de entitlements']
  }
];

const PlansPage = () => {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Planos"
        title="Escolha o plano adequado ao seu estágio"
        description="Planos modulados por volume de objetivos, integrações MCP e governança corporativa."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            title={plan.name}
            subtitle={plan.description}
            actions={<Button variant="primary">Selecionar</Button>}
          >
            <p className="text-2xl font-semibold text-white">{plan.price}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {plan.features.map((feature) => (
                <li key={feature}>• {feature}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PlansPage;
