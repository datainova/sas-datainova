# DataInova — Arquitetura SaaS para Objetivos Estratégicos

Plataforma SaaS multi-tenant para modelagem e gestão de objetivos estratégicos, K-Results e KPIs, oferecendo compatibilidade com MCP, agentes on-premise e integrações corporativas. Este README consolida as instruções de operação e descreve cada camada solicitada: variáveis de ambiente, frontend, backend, endpoints, MCP, login e segurança, além dos fluxos críticos do sistema.

## Sumário
- [Visão Geral](#visão-geral)
- [Arquitetura Geral](#arquitetura-geral)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Backend](#backend)
  - [Instruções para o Backend](#instruções-para-o-backend)
- [Frontend](#frontend)
  - [Instruções para o Frontend](#instruções-para-o-frontend)
- [Endpoints Principais](#endpoints-principais)
- [MCP](#mcp)
- [Login e Segurança](#login-e-segurança)
- [Fluxos do Sistema](#fluxos-do-sistema)
- [Recursos Complementares](#recursos-complementares)

## Visão Geral
- **Foco**: orquestrar o ciclo de execução estratégica (onboarding, construção de objetivos/KRs/KPIs, ingestão de dados agregados, check-ins, alertas e auditoria). Não substitui plataformas de BI.
- **Público**: squads, lideranças e times de dados responsáveis por instalar o Data Inova Agent em ambientes Enterprise.
- **Princípios**: multi-tenancy seguro com RLS, idempotência em ingestão/webhooks, observabilidade nativa e extensibilidade via MCP.

## Arquitetura Geral
```
.
├─ apps/
│  ├─ api/        # Fastify + TypeScript + Prisma + pg-boss (jobs)
│  ├─ web/        # SPA React/TypeScript com Tailwind, Framer Motion, React Query
│  ├─ agent/      # Template para agente on-premise
│  └─ mcp/        # Placeholder para cliente MCP
├─ packages/
│  ├─ common/     # Tipos utilitários (cadências, status, helpers)
│  ├─ config/     # Schema Zod para variáveis de ambiente e loader
│  └─ database/   # Prisma schema, client builder e migrações
└─ docs/          # Guias funcionais, arquitetura, OpenAPI e materiais de apoio
```
- **Frontend** consome a API via REST e MCP para experiências guiadas.
- **Backend/API** concentra domínios (`auth`, `onboarding`, `objectives`, `indicators`, `agents`, `alerts`, `checkins`, `billing`, `mcp`).
- **Workers** (placeholder pg-boss) tratam ingestões, webhooks, alertas e backfills.
- **Banco**: PostgreSQL com partições temporais, RLS por organização e auditoria completa.
- **Chroma** (planejado) para glossários e alias semânticos multi-tenant.
- **Data Inova Agent** roda outbound-only em ambiente do cliente Enterprise, assinando lotes de ingestão.

## Variáveis de Ambiente
As validações estão centralizadas em `packages/config` (`appEnvSchema`). Configure um arquivo `.env` na raiz ou exporte as variáveis antes de iniciar cada workspace.

| Variável | Obrigatória | Uso | Descrição |
| --- | --- | --- | --- |
| `NODE_ENV` | não (default `development`) | Geral | Define o ambiente de execução. |
| `PORT` | não (default `3000`) | API | Porta do Fastify. |
| `DATABASE_URL` | sim | API/Workers | Conexão PostgreSQL com privilégios RLS. |
| `CHROMA_URL` | opcional | API | Endpoint do repositório vetorial (glossário). |
| `JWT_PUBLIC_KEY` / `JWT_PRIVATE_KEY` | sim | Auth/API | Par RSA/EC usado para assinar e validar tokens. |
| `JWT_ISSUER` | sim | Auth | Identificador do emissor dos JWTs. |
| `AGENT_SIGNING_SECRET` | sim (≥32 chars) | Agent/API | Segredo HMAC para validar lotes do Agent. |
| `AUTH_PASSWORD_PEPPER` | sim | Auth | Pepper aplicado ao hash de senha. |
| `AUTH_ACCESS_TOKEN_TTL_SEC` | não (default 900) | Auth | TTL (segundos) do access token. |
| `AUTH_REFRESH_TOKEN_TTL_DAYS` | não (default 30) | Auth | TTL (dias) do refresh token. |
| `AUTH_SIGNUP_TOKEN_TTL_MINUTES` | não (default 60) | Auth | Validade do token de convite/cadastro. |
| `AUTH_RESET_TOKEN_TTL_MINUTES` | não (default 60) | Auth | Validade do token de recuperação de senha. |
| `FRONTEND_URL` | sim | API/Auth | URL base do SPA (redirecionamentos, cookies). |
| `GOOGLE_CLIENT_ID` / `SECRET` / `REDIRECT_URI` | opcional | Auth | Integração OIDC com Google. |
| `EMAIL_SMTP_HOST` / `PORT` / `USER` / `PASSWORD` | sim | Auth | SMTP usado para convites, reset e notificações. |
| `EMAIL_SMTP_SECURE` | opcional | Auth | Define uso de TLS no SMTP. |
| `EMAIL_FROM_ACCOUNT` | sim | Auth | Remetente padrão. |
| `EMAIL_FROM_SIGNUP` / `EMAIL_FROM_RECOVERY` | opcional | Auth | Remetentes específicos para convites/recuperação. |
| `RATE_LIMIT_PER_MIN` | não (default 120) | API | Limite global por IP. |
| `STRIPE_WEBHOOK_SECRET` / `STRIPE_SECRET_KEY` | opcional | Billing | Validação e chamadas API Stripe. |
| `HUBSPOT_WEBHOOK_SECRET` / `HUBSPOT_ACCESS_TOKEN` | opcional | Billing/Leads | Verificação de webhooks e API CRM. |
| `SLACK_WEBHOOK_URL` | opcional | Alertas | Notificações externas. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | opcional | Observabilidade | Exportação de traces/logs via OTLP. |

> Dica: mantenha valores sensíveis fora do versionamento e considere usar `.env.local` por ambiente. A CLI valida o schema ao subir a API, falhando cedo em caso de inconsistências.

## Backend

### Visão Técnica
- Implementado em **Fastify + TypeScript**, com validação sistemática via **Zod**.
- **Prisma** gerencia o acesso ao PostgreSQL, incluindo seeds, políticas RLS e auditoria (`recordAudit`, `recordTelemetryEvent`).
- Autorização multi-tenant por cabeçalhos `x-org-id`, `x-tenant-id`, `x-user-id` e roles (`ORG_OWNER`, `MANAGER`, `CONTRIBUTOR`, `VIEWER`).
- **pg-boss** (placeholder) preparado para filas de ingestão, alertas, e-mail e backfills.
- Arquitetura modular (arquivos `*.routes.ts` por domínio) e utilitários compartilhados em `apps/api/src/utils`.

### Domínios Principais
- **Auth**: login/password, refresh tokens, convites, recuperação de senha, OIDC Google, auditoria e telemetria.
- **Onboarding**: sessões com autosave, parsing de storytelling, criação de organização, tenant e planos iniciais.
- **Objectives & Indicators**: CRUD completo com segmentações, metas, cadências e auditoria de mudanças.
- **Check-ins e Alertas**: registro de rituais e reconhecimento de alertas automáticos.
- **Agents & Ingestão**: registro, atualização de status/versão, ingestão idempotente (`/ingest/indicator-values`) com assinatura HMAC.
- **Billing & Leads**: webhooks Stripe/HubSpot com validação de assinatura, upsert de assinaturas e leads.
- **MCP**: servidor JSON-RPC consolidado no mesmo processo Fastify.

### Observabilidade e Operação
- Logs estruturados (JSON) com correlação por `requestId`/`jobId`.
- Métricas planejadas via OpenTelemetry (exportador configurável por env).
- Auditoria extensiva (`recordAudit`) para ações sensíveis.
- Rate limiting global conforme `RATE_LIMIT_PER_MIN`.

### Instruções para o Backend
1. **Instale dependências** (raiz do monorepo):
   ```bash
   npm install
   ```
2. **Configure o banco** (migrations + seed implícitos nas migrações Prisma):
   ```bash
   npm run prisma:migrate --workspace @datainova/database
   ```
3. **Gere o client Prisma** (caso altere o schema):
   ```bash
   npm run prisma:generate --workspace @datainova/database
   ```
4. **Inicie a API em modo desenvolvimento** (porta padrão 3000):
   ```bash
   npm run dev --workspace @datainova/api
   ```
5. **Jobs / workers**: quando implementados, inicialize `apps/api/src/jobs` acoplando ao mesmo processo Fastify ou movendo para serviço separado. As filas esperam um PostgreSQL compartilhado.
6. **Testes e lint** (quando implementados):
   ```bash
   npm run lint --workspace @datainova/api
   npm run typecheck --workspace @datainova/api
   ```

> Regras de cabeçalho: requisições autenticadas devem enviar `Authorization: Bearer <token>` e `x-org-id`. `x-tenant-id` e `x-user-id` são resolvidos automaticamente via sessão, mas podem ser utilizados para cenários de auditoria.

## Frontend

### Visão Técnica
- **SPA React + TypeScript** com `Vite` (porta padrão 5173), `React Router`, `React Query` e estilização via **Tailwind CSS**.
- Animações com **Framer Motion** para wizards e transições.
- Camada de **design system** baseada em componentes compartilhados e tokens definidos em `apps/web/src/styles`.
- Consumo de dados por hooks `useQuery`/`useMutation`, com mocks para dashboards e placeholders administrativos até integração com a API.

### Estrutura de Pastas (apps/web)
- `src/pages/onboarding` — fluxo storytelling multi-etapas com autosave.
- `src/pages/objectives` — listagem, criação, edição e segmentação de objetivos.
- `src/pages/indicators` — KRs/KPIs, metas e visão histórica.
- `src/pages/admin` — planos, limites, visão do Agent e integrações.
- `src/components` — biblioteca de componentes reutilizáveis (formularios, layout, gráficos mock).
- `src/libs/api` — cliente REST/MCP (quando conectado).

### UX & Acessibilidade
- Idioma padrão pt-BR com estrutura preparada para i18n.
- Navegação totalmente via teclado e marcação ARIA em componentes críticos.
- Wizards apresentam resumos e próximas melhores ações ao final de cada passo.

### Instruções para o Frontend
1. **Instale dependências** (já coberto ao instalar na raiz, mas pode ser feito isoladamente):
   ```bash
   npm install --workspace @datainova/web
   ```
2. **Configure o arquivo `.env` local** (Vite usa prefixo `VITE_`). Ex.: `VITE_API_URL=http://localhost:3000`.
3. **Execute em modo desenvolvimento** (porta 5173):
   ```bash
   npm run dev --workspace @datainova/web
   ```
4. **Build de produção**:
   ```bash
   npm run build --workspace @datainova/web
   npm run preview --workspace @datainova/web
   ```
5. **Integração com API**: ajuste `src/libs/api` para apontar para a instância desejada; utilize `x-org-id` e tokens JWT obtidos no fluxo de login. MCP pode ser acessado via SSE (`/mcp`) ou transportes customizados conforme necessidade do cliente MCP.

> Recomenda-se configurar proxy Vite para `/mcp` e `/api` durante o desenvolvimento, evitando problemas de CORS.

## Endpoints Principais
Veja `docs/api_openapi.yaml` para a especificação completa. Abaixo um panorama por módulo:

### Health
- `GET /healthz` — status do serviço (sem autenticação).

### Autenticação
- `POST /auth/login` — login com email/senha.
- `POST /auth/logout` — encerra sessão, revogando refresh token.
- `POST /auth/signup` → `GET /auth/signup/confirm` → `POST /auth/signup/complete` — fluxo de convite/cadastro.
- `POST /auth/password/forgot` → `POST /auth/password/reset` — recuperação de senha.
- `GET /auth/session` — retorna contexto da sessão ativa (roles, planos).
- `GET /auth/oidc/google/init` / `GET /auth/oidc/google/callback` — integração OIDC.

### Onboarding
- `POST /onboarding/sessions` — cria sessão de onboarding.
- `PATCH /onboarding/sessions/:id/step` — persiste respostas por passo.
- `POST /onboarding/sessions/:id/complete` — finaliza onboarding, cria organização/tenant e emite token inicial.

### Objetivos
- `GET /objectives` — paginação e filtros por status/search.
- `POST /objectives` — cria objetivo (respeita limites do plano).
- `GET /objectives/:id` — recupera detalhe com segmentos.
- `PATCH /objectives/:id` — atualiza metadados/cadência.
- `POST /objectives/:id/archive` / `POST /objectives/:id/restore` — controla ciclo de vida.
- `POST /objectives/:id/segments` — substitui eixos/valores de segmentação.
- `DELETE /objectives/:id` — remove (soft delete via auditoria).

### Indicadores (KR/KPI)
- `GET /indicators` — lista indicadores por tipo/objetivo.
- `GET /indicators/:id` — detalhe completo.
- `GET /indicators/:id/values` — série histórica (filtra por range/segment).
- `POST /indicators/:id/segments` — atualiza segmentações.
- `POST /indicators/:id/targets` — define metas.
- `POST /indicators/:id/values` — cria valor manual (quando permitido).

### Check-ins & Alertas
- `POST /checkins` — registra check-in (cadência semanal/mensal).
- `GET /checkins?objectiveId=` — histórico de check-ins por objetivo.
- `GET /alerts` — lista alertas abertos/resolvidos.
- `POST /alerts/ack` — reconhece/encerra alerta.

### Agentes & Ingestão
- `GET /agents` — lista agentes registrados (roles OWNER/MANAGER).
- `POST /agents/register` — registra novo agente.
- `PATCH /agents/:id` — atualiza status/versão.
- `POST /ingest/indicator-values` — ingestão idempotente com assinatura HMAC (`x-agent-id`, `x-agent-signature`).

### Billing & Integrações
- `POST /webhooks/stripe` — captura eventos de billing (assinatura/renewal).
- `POST /webhooks/hubspot` — sincroniza leads/contatos.

### MCP
- `POST /mcp` — endpoint JSON-RPC (tools/resources/prompts). Ver seção [MCP](#mcp) para detalhes.

## MCP
- **Transporte**: HTTP JSON-RPC disponível em `/mcp` (streamable em produção); modo `stdio` planejado para o cliente CLI.
- **Autenticação**: mesma verificação de bearer token do REST. Exige `x-org-id` e contexto válido (`request.getTenantContext()`).
- **Feature Flag**: requere plano com feature `mcp` habilitada (`PRO` e `ENTERPRISE` por padrão).
- **Ferramentas disponíveis**:
  - `objective.create`, `objective.segment`, `objective.complete`
  - `kr.create`, `kpi.create`
  - `indicator.targets.upsert`, `indicator.values.list`
  - `agent.batch.ingest` (somente Enterprise)
  - `plan.upgrade.preview`
- **Recursos**: URIs virtuais `objective://{id}`, `kr://{id}`, `indicator://{id}/values` (lista e leitura respeitam RLS).
- **Prompts**: `draft-objective-from-mission`, `segment-suggestions`.
- **Auditoria**: cada chamada gera log em `McpToolInvocationLog` com duração, sucesso/erro e payload assinado.
- **Uso recomendado**: consumir via SDK MCP (plano) ou agentes LLM, respeitando quotas por plano e roles. Implementar `idempotencyKey` nos payloads quando disponível.

## Login e Segurança
- **Sessões**: JWT de curta duração (`AUTH_ACCESS_TOKEN_TTL_SEC`) + refresh token persistido com rotação e revogação (`auth_refresh_tokens`).
- **Cookies**: httpOnly, `SameSite=strict` e assinatura opcional; fallback via body para integrações mobile.
- **RBAC**: roles por organização; enforcement em cada rota via `request.requireRoles()`.
- **Multi-tenancy**: políticas RLS em todas as tabelas chave (`org_id`) e uso obrigatório de `request.withTenantScope`.
- **Proteções**:
  - Rate limiting global (`RATE_LIMIT_PER_MIN`) e limites específicos em tentativas de login (5 tentativas em 5 minutos).
  - Hash de senha com salt + pepper (`AUTH_PASSWORD_PEPPER`) e custo configurável (ver `lib/password`).
  - Auditoria (`recordAuthAuditEvent`) para logins/logouts, reset de senha e integrações OIDC.
  - Webhooks (Stripe/HubSpot) validados via HMAC e tolerância temporal.
  - Ingestão do Agent exige HMAC (`AGENT_SIGNING_SECRET`) e valida duplicidade (`batchId`, `checksum`).
  - Dados sensíveis cifrados em trânsito (TLS) e uso recomendado de KMS para secrets em produção.

## Fluxos do Sistema
- **Onboarding Storytelling**: wizard coleta missão, visão, porte, segmentos e objetivos preliminares; salva via `/onboarding/sessions` e, ao concluir, cria organização + tenant com planos seed (Free/Pro/Enterprise) e emite token inicial.
- **Criação de Objetivos/KRs/KPIs**: usuários com role OWNER/MANAGER utilizam o wizard (frontend) ou MCP (`objective.create`, `kr.create`, `kpi.create`). Segmentações sincronizam com indicadores.
- **Ingestão de Dados**:
  - Conectores SaaS (roadmap) e Data Inova Agent enviam valores agregados (`/ingest/indicator-values`) com versionamento.
  - Backfills e retries controlados por pg-boss (jobs a implementar).
- **Check-ins & Alertas**: check-ins alimentam status qualitativo; alertas são abertos automaticamente (desvio, staleness) e encerrados manualmente via `POST /alerts/ack`.
- **Ciclo de Login**: credenciais locais, convites via e-mail, recuperação com token temporário, opção OIDC (Google) e auditoria completa. Tokens renovados via refresh com rotação segura.
- **Billing & Upgrades**: Stripe envia webhooks para atualizar `Subscription`; MCP tool `plan.upgrade.preview` auxilia propostas. HubSpot sincroniza leads gerados no onboarding ou ações comerciais.
- **MCP & Assistentes**: LLMs podem criar objetivos, atualizar metas ou disparar ingestões (Enterprise) respeitando limites do plano e auditoria, estendendo o frontend com automações.

## Recursos Complementares
- `docs/architecture.md` — visão aprofundada (C4, requisitos, roadmap, riscos).
- `docs/api_openapi.yaml` — especificação OpenAPI completa.
- `docs/frontend-auth-handoff.md` — detalhes do fluxo de autenticação com o SPA.
- `docs/mcp_user_guide.md` / `docs/mcp_saas.txt` — referência detalhada do MCP.
- `docs/Login.txt` / `docs/Backend SaaS.txt` — guias narrativos de produto.
- `packages/database/prisma/schema.prisma` — modelos de dados e políticas RLS.

> Mantenha este README sincronizado com os artefatos acima ao evoluir o produto. Ajustes em domínios, fluxos ou integrações devem refletir nas seções correspondentes (especialmente variáveis de ambiente, endpoints e instruções operacionais).

