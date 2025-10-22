# Arquitetura SaaS — DataInova

Documento de referência para o produto SaaS de gestão de objetivos estratégicos, K-Results e KPIs, incluindo agente on-premise (Enterprise) e compatibilidade MCP.

---

## 1. Visão & Escopo
- Plataforma focada em **modelagem, coleta agregada e orquestração** do ciclo de execução estratégica — não substitui ferramentas de BI.
- Dados sempre **agregados por período** (ex.: mensal) obtidos via conectores read-only ou **Data Inova Agent** (Enterprise).
- Públicos: squads/equipes, gestores, diretoria e operações de dados (para instalar/operar o Agent).
- Metas principais: onboarding rápido, confiabilidade na coleta/versionamento, segurança multi-tenant + auditoria forte.

## 2. Requisitos Funcionais (alto nível)
- Modelagem organizacional: organizações → times → papéis (RBAC) / permissões / entitlements.
- Wizards para Objetivos, K-Results, KPIs (cadência, janela, unidade, direção, segmentação, resumo).
- Segmentação flexível (eixos/valores), cadências variadas e controles de status automáticos.
- Coleta & ingestão (agenda, backfill, dedupe, versionamento, DLQ).
- Check-ins & rituais (status, notas, aprendizados), alertas & notificações (desvio meta, staleness, falhas ingestão).
- Dashboards operacionais (saúde dos objetivos/indicadores).
- Integrações: HubSpot, Stripe, Slack/Teams, DWs (BigQuery, Snowflake, Redshift, Databricks, PostgreSQL, SQL Server).
- MCP server (tools/resources/prompts) com mesma autorização da API.

## 3. Requisitos Não Funcionais
- Multi-tenant seguro (RLS por `org_id`), criptografia em trânsito/repouso.
- Disponibilidade 99.9%, jobs com retry/backoff + DLQ.
- Desempenho: wizards TTFB < 200ms, endpoints paginados com índices `(indicator_id, period)`.
- Observabilidade: métricas, logs estruturados, tracing (OpenTelemetry).
- Auditoria total de metas, fontes, fórmulas e segmentações.
- Idempotência (ingestão, webhooks Agent/Stripe/HubSpot).
- Privacidade: apenas agregados, evitar PII, mascaramento.
- I18n/A11y: pt-BR first, chaves isoladas, suporte teclado/ARIA.

## 4. Stack Técnica
| Camada | Stack |
| --- | --- |
| Frontend | React + TypeScript, Tailwind, Framer Motion, React Query |
| API/Backend | Node + TypeScript (Fastify), validação Zod + OpenAPI |
| ORM | Prisma (PostgreSQL c/ RLS e partições temporais) |
| Jobs | pg-boss (sobre PostgreSQL) |
| Vetorial | Chroma (glossário, alias, FAQs) |
| Agent | Node/TS empacotado para Docker/Helm (outbound-only) |
| MCP | Node/TS com transporte HTTP streamable (prod) / stdio (dev) |

## 5. C4 — Visão de Contexto
```mermaid
flowchart TB
  subgraph Cliente
    U[Usuário]
    AG[Data Inova Agent]
    DW[(DW / Data Lake)]
  end

  subgraph SaaS
    FE[Web App (React/TS/Tailwind)]
    API[API (Node/TS/Fastify)]
    MCP[MCP Server]
    JOBS[Workers/Jobs (pg-boss)]
    PG[(PostgreSQL)]
    CH[(Chroma)]
  end

  U -->|HTTPS| FE
  FE -->|REST| API
  FE -->|MCP Tools| MCP
  MCP --> API
  API --> PG
  JOBS --> PG
  API --> CH

  AG -->|HTTPS push| API
  AG -. read .-> DW

  API --> STR[(Stripe)]
  API --> HSP[(HubSpot)]
  API --> SLK[(Slack/Teams)]
```

Notas:
- SaaS multi-tenant; Agent roda no ambiente do cliente e só faz conexões outbound.
- MCP expõe capabilities equivalentes aos endpoints REST.

## 6. Arquitetura de Containers
- **Frontend (SPA)**: routers para onboarding, objetivo/KR/KPI, home OKRs, dashboards, admin (planos/Agent).
- **API (Fastify)**: módulos por domínio (`auth`, `organizations`, `objectives`, `indicators`, `segments`, `values`, `checkins`, `alerts`, `agents`, `integrations`, `mcp`, `billing`, `leads`).
- **Workers (pg-boss)**: ingestão (validação/dedupe/versionamento), coleta RO (conectores), alertas, webhooks, backfills.
- **PostgreSQL**: esquema multi-tenant com RLS + partições por período.
- **Chroma**: coleções por `org_id` para glossário, indicadores, FAQs.
- **Agent**: jobs locais, agregação conforme `IndicatorDefinition`, envio assinado (`batch_id`, `checksum`), health/telemetria.
- **Integrações**: Stripe (billing), HubSpot (leads), Slack/Teams (notificações), DWs (dados).

## 7. Domínios Principais
- **Organização & Tenancy**: `Organization`, `Tenant`, `Plan`, `Entitlement`, `Subscription`, `UserRole`.
- **Objetivos/OKRs**: wizard, cadência, janela, segmentação opcional, estados `Draft → Active`.
- **K-Results & KPIs**: cadência própria, unidade, direção (increase/decrease/maintain), segmentação independente.
- **Ingestão**: conectores RO (SaaS) e Agent (Enterprise) com idempotência e versionamento.
- **Alertas & Check-ins**: alertas por desvio/staleness/ingestão, check-ins com status/notas/aprendizados.
- **Billing & Planos**: Free, Pro, Enterprise (com Agent). Stripe como source of truth.
- **MCP**: tools (mirror REST), resources (RO), prompts (guidance a partir de missão/visão).

## 8. Fluxos Principais (Sequence)
1. **Onboarding**: wizard storytelling (nome → país → segmento → porte → missão → visão → resumo). Autosave + resume, HubSpot upsert assíncrono.
2. **Objetivo**: wizard até resumo; pós-conclusão orienta para novos objetivos ou KRs.
3. **K-Result**: wizard com unidade/direção/segmentação; sugere próximos passos.
4. **Ingestão (Agent)**: job local → agregação → `POST /ingest/indicator-values` com `batch_id`/`checksum` → dedupe/versiona → eventos/alertas.
5. **Billing (Stripe)**: upgrade via Checkout/Portal → webhooks (`checkout.session.completed`, `subscription.updated`) idempotentes → aplica entitlements.

## 9. Modelo de Dados (Prisma)
- **Organizações**: `Organization`, `Tenant`, `Plan`, `Entitlement`, `Subscription`, `UserRole`, `Team`.
- **Objetivos/Indicadores**: `Objective`, `ObjectiveSegmentAxis/Value`, `IndicatorDefinition`, `IndicatorSegmentAxis/Value`, `IndicatorTarget`, `IndicatorSourceBinding`, `IndicatorValue`.
- **Ingestão/Agent**: `Agent`, `AgentJob`, `DataTransferBatch`.
- **Auditoria & Observabilidade**: `AuditLog`, `TelemetryEvent`, `Alert`, `Checkin`, `McpToolInvocationLog`.
- **Leads/Billing**: `Lead`, `OnboardingSession`.
- Índices: `(indicator_id, period)` para séries; `org_id` em todas as entidades multi-tenant; timestamps padrão.

## 10. Regras de Cálculo — Status Indicador
| Direção | On Track | At Risk | Off Track |
| --- | --- | --- | --- |
| INCREASE | valor ≥ meta | valor ≥ meta × (1 - tolerância) | demais |
| DECREASE | valor ≤ meta | valor ≤ meta × (1 + tolerância) | demais |
| MAINTAIN | \|valor - meta\| ≤ tolerância | — | demais |

## 11. APIs (resumo)
- **Onboarding**: `POST /onboarding/sessions`, `PATCH /onboarding/sessions/:id/step`, `POST /onboarding/sessions/:id/complete`.
- **Objetivos**: `POST/GET/PATCH /objectives`, `POST /objectives/:id/segments`, `POST /objectives/:id/complete`.
- **KRs/KPIs**: `POST /kresults`, `POST /kpis`, `POST /indicators/:id/segments`, `POST /indicators/:id/targets`, `GET /indicators/:id/values`.
- **Ingestão**: `POST /ingest/indicator-values`, `GET /agents`, `POST /agents/register`, `PATCH /agents/:id`.
- **Billing/Leads**: `POST /webhooks/stripe`, `POST /webhooks/hubspot`.
- **Alertas/Check-ins**: `GET /alerts`, `POST /alerts/ack`, `POST /checkins`, `GET /checkins`.
- Contratos via OpenAPI/Zod; pagination padrão; ETag/If-None-Match quando aplicável.

## 12. MCP Mapping
- **Transporte**: HTTP streamable em produção (`/mcp`); stdio no dev.
- **Autenticação**: bearer curto com escopos (`org_id`, `roles`, `plan`, `tool:*`).
- **Tools**: `objective.create`, `objective.segment`, `kr.create`, `kpi.create`, `indicator.values.list`, `agent.batch.ingest`, `plan.upgrade.preview`.
- **Resources**: `objective://{id}`, `kr://{id}`, `indicator://{id}/values`.
- **Prompts**: `draft-objective-from-mission`, `okr-retro-template`, etc.
- **Logs**: `McpToolInvocationLog` + quotas por plano.

## 13. Segurança
- RLS por `org_id`, credenciais read-only para conectores, TLS 1.2+, dados sensíveis com KMS.
- Autenticação: JWT curto + refresh, SSO (OIDC/SAML) planejado para Enterprise.
- Agent: outbound-only, payload HMAC/mTLS, rotação de chaves, idempotência `batch_id + checksum`.
- Webhooks: verificação assinatura Stripe/HubSpot, retries/backoff/dedupe.
- Auditoria: alterações em objetivos, indicadores, metas, fontes, jobs, ingestões.
- Privacidade: apenas agregados; logs sem PII (mascaramento).

## 14. Observabilidade & Operação
- Métricas: ingestão (taxa, atraso), jobs (latência, erros), health Agent, sucesso webhooks.
- Logs estruturados: JSON com correlação request/job e `org_id`.
- Tracing: OpenTelemetry (API, workers, Agent).
- SLOs: disponibil. 99.9%, atraso ingestão < Xh (por plano), MTTR < Y min.
- Runbooks: backfill, rollback Agent, incident response (falhas conectores, perda ingestão).

## 15. UX & Wizards
- **Onboarding**: storytelling corporativo, Framer Motion, autosave/resume.
- **Objetivo**: passos cadenciados, resumo, sugestão de próximos objetivos/KRs.
- **KR/KPI**: unidade/direção, segmentação independente, resumo com status preview.
- **Check-ins**: cadência semanal/mensal, status derivado, aprendizados anexados.

## 16. Deploy & Ambientes
- Ambientes: Dev, Staging, Prod (isolados).
- Infra: API/workers em Kubernetes/Fargate/Nomad; Postgres gerenciado; Chroma gerenciado/container; CDN p/ SPA.
- CI/CD: testes unit/integração/e2e, lint, prisma migrate, blue/green ou rolling.
- Agent: distribuição via Docker image/Helm installer; updates versionados; telemetria de instalação.

## 17. Roadmap
1. **MVP**: onboarding + objetivo + KR + ingestão Agent (Enterprise) + Stripe + HubSpot + alertas básicos + MCP (create/list).
2. **MVP+1**: wizard KPI, dashboards operacionais, notificações Slack/Teams, conectores RO (Pro/Free).
3. **MVP+2**: SSO (OIDC/SAML), segmentação avançada, prompts MCP avançados, i18n completo.

## 18. Riscos & Mitigações
- Divergência semântica → glossário/alias (Chroma), governança definicional.
- Variações segmentação (SP vs São Paulo) → normalização + catálogo sugerido.
- Polarity/metas mal configuradas → previews de cálculo, validações no wizard.
- Aprovação TI para Agent → hardening, outbound-only, docs e security review.
- Conectividade restrita → suporte proxies, endpoints dedicados.

## 19. Glossário
- **Objetivo**: direcionador estratégico com janela/cadência.
- **KR (K-Result)**: resultado chave mensurável, atrelado (ou não) a objetivo.
- **KPI**: indicador contínuo com cadência específica.
- **Segmentação**: eixos/valores para fatiar indicadores (ex.: Estado, Canal).
- **Agent**: componente on-prem que agrega e envia dados agregados.
- **MCP**: protocolo para expor tools/resources/prompts para LLMs/assistentes.

## 20. Schemas (simplificados)
```ts
type Objective = {
  id: string;
  orgId: string;
  title: string;
  description: string;
  cadence: 'DAILY'|'WEEKLY'|'MONTHLY'|'QUARTERLY'|'SEMIANNUAL'|'ANNUAL'|'BIENNIAL';
  startDate: string;
  endDate: string;
  status: 'DRAFT'|'ACTIVE'|'ARCHIVED';
};

interface IndicatorDefinition {
  id: string;
  orgId: string;
  objectiveId?: string;
  type: 'KR'|'KPI';
  title: string;
  description: string;
  cadence: Objective['cadence'];
  unitCode: string;
  direction: 'INCREASE'|'DECREASE'|'MAINTAIN';
  startDate: string;
  endDate: string;
  status: 'DRAFT'|'ACTIVE'|'ARCHIVED';
}

interface IndicatorValue {
  id: string;
  indicatorId: string;
  period: string;
  segmentKey?: string;
  value: number;
  statusCalc: 'ON'|'RISK'|'OFF';
  collectedAt: string;
  origin: 'AGENT'|'CONNECTOR';
  version: number;
}
```

---

Este documento serve como baseline de arquitetura, devendo ser atualizado conforme evoluções no produto, stacks auxiliares ou requisitos regulatórios.
