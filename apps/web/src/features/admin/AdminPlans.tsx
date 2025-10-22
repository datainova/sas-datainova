const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 'R$0',
    description: 'Ideal para validar objetivos iniciais.',
    features: ['Até 3 objetivos', 'Conectores read-only limitados', 'Check-ins básicos']
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'R$890/mês',
    description: 'Escala SaaS multi-equipes.',
    features: ['Objetivos ilimitados', 'Coletas agendadas', 'Alertas Slack/Teams', 'MCP Tools']
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Fale com vendas',
    description: 'Inclui Data Inova Agent on-prem.',
    features: ['Agent outbound-only', 'Versão e trilha de auditoria', 'SSO opcional', 'SLA dedicado']
  }
];

const AdminPlans = () => {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8">
        <h2 className="text-2xl font-semibold text-white">Planos & Entitlements</h2>
        <p className="mt-2 text-sm text-slate-400">
          Ajuste limites e feature flags por tenant. Stripe é a fonte da verdade para status da assinatura.
        </p>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <header>
                <p className="text-xs uppercase tracking-wide text-slate-500">{plan.name}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{plan.price}</h3>
                <p className="text-xs text-slate-400">{plan.description}</p>
              </header>
              <ul className="mt-4 space-y-2 text-sm text-slate-200">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button className="mt-6 w-full rounded-full border border-brand-500/60 px-4 py-2 text-xs font-semibold text-brand-100 hover:bg-brand-500/20 transition">
                Configurar
              </button>
            </article>
          ))}
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6">
          <h3 className="text-lg font-semibold text-white">Data Inova Agent</h3>
          <p className="mt-2 text-sm text-slate-400">
            Implantado no ambiente do cliente via Docker ou Helm, leitura read-only e envio outbound com HMAC/mTLS.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-400">
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Status</dt>
              <dd className="mt-1 text-emerald-300">Healthy</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Último heartbeat</dt>
              <dd className="mt-1 text-slate-200">há 4 min</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Jobs ativos</dt>
              <dd className="mt-1 text-slate-200">12</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-slate-500">Versão</dt>
              <dd className="mt-1 text-slate-200">1.2.0</dd>
            </div>
          </dl>
          <button className="mt-6 rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-400 transition">
            Gerenciar chaves
          </button>
        </article>
        <article className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6">
          <h3 className="text-lg font-semibold text-white">MCP Config</h3>
          <p className="mt-2 text-sm text-slate-400">
            Controle de scopes, quotas e logs de invocação para ferramentas expostas a assistentes.
          </p>
          <div className="mt-4 space-y-3 text-xs text-slate-300">
            <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <span>objective.create</span>
              <span className="text-slate-500">Quota: 60/dia</span>
            </div>
            <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <span>indicator.values.list</span>
              <span className="text-slate-500">Quota: 500/dia</span>
            </div>
            <div className="flex justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <span>agent.batch.ingest</span>
              <span className="text-slate-500">Quota: ilimitado</span>
            </div>
          </div>
          <button className="mt-6 rounded-full border border-brand-500/60 px-4 py-2 text-xs font-semibold text-brand-100 hover:bg-brand-500/20 transition">
            Exportar manifest MCP
          </button>
        </article>
      </section>
    </div>
  );
};

export default AdminPlans;
