# DataInova Connect — SaaS API

Backend oficial do DataInova Connect (nuvem). A aplicação expõe os serviços core (auth, onboarding, objetivos, ingestão etc.) sobre Fastify + TypeScript, com Prisma + PostgreSQL (RLS) e observabilidade integrada.

## Stack

| Área | Tecnologia |
| --- | --- |
| Runtime/API | Fastify 4, Zod, Swagger (`/docs`) |
| Autenticação | JWT (access/refresh), Argon2, OIDC (Google) |
| Banco | PostgreSQL 16, Prisma Client, RLS com `app.organization_id` |
| Jobs/Workers | pgboss (planejado) |
| Observabilidade | Pino (JSON), `/health`, `/ready`, `/metrics` |

## Endpoints principais

| Grupo | Endpoints |
| --- | --- |
| Auth / Sessão | `/auth/login`, `/auth/token`, `/auth/logout` |
| Signup & Confirmação | `/auth/signup`, `/auth/signup/confirm`, `/auth/signup/complete` |
| Recuperação de acesso | `/auth/password/forgot`, `/auth/password/validate`, `/auth/password/reset` |
| OIDC (Google) | `/auth/oidc/google/init`, `/auth/oidc/google/callback` |
| Onboarding | `/onboarding/sessions`, `/onboarding/sessions/:id/step`, `/onboarding/sessions/:id/complete` |
| Organização & Membros | `/organization`, `/members`, `/members/:id` |
| Convites | `/invites`, `/invites/:id/resend` |
| Domínio OKRs | Objetivos, indicadores, metas, valores (consultas e ingestão manual/automática) |
| Operações auxiliares | Alertas, check-ins, agentes, webhooks, MCP, observabilidade |

Documentação navegável: **`GET /docs`** (Swagger UI) e **`GET /docs/json`** (OpenAPI).

## Pré‑requisitos

- Node.js 20
- pnpm 9+
- PostgreSQL 16 (para desenvolvimento local use `infra/compose/docker-compose.dev.yml`)
- Variáveis padrão em `apps/saas-api/.env.example`

## Setup e execução

```bash
# instalar dependências
pnpm install

# gerar Prisma Client
pnpm --filter saas-api db:generate

# aplicar migrations (ambiente local)
pnpm --filter saas-api db:migrate

# popular dados demo (tenant DataInova)
pnpm --filter saas-api db:seed

# executar em modo desenvolvimento (Fastify + reload)
pnpm --filter saas-api dev
```

> A migration inicial cria enums, funções auxiliares (`app.require_tenant`, `app.assert_tenant_set`), RLS em todas as tabelas multitenant e partições mensais para `indicator_value`.

## Banco e RLS

- Toda transação precisa iniciar com `SET LOCAL app.organization_id = '<uuid>'`.
- `prisma/seed.ts` cria organização demo, usuário OWNER, agentes e valores exemplo.
- Tabelas de suporte incluídas: `email_verification_token`, `password_reset_token`, `refresh_token`, `onboarding_session`.

## Testes e lint

```bash
# typecheck
pnpm --filter saas-api exec tsc --noEmit

# vitest (run once)
pnpm --filter saas-api test -- --run
```

Os testes atuais cobrem auth, onboarding, convites, ingestão e consultas de indicadores usando Prisma mockado.

## Convenções importantes

- **Swagger**: mantenha os schemas alinhados; qualquer endpoint novo deve ser tagueado.
- **Tokens**: refresh tokens são persistidos e invalidados no backend; guardar o novo par sempre que o refresh for renovado.
- **Onboarding**: estado incremental salvo em `onboarding_session.state` (JSONB), com autosave por passo.
- **Invites**: tokens e expiração gerenciados pelo backend (`/invites/:id/resend` regenera o token).
- **Observabilidade**: logs Pino no formato do projeto, health checks leves e métricas Prometheus (`/metrics`).

## Próximos passos

- Incluir workers (pgboss) para fluxos assíncronos.
- Completar testes de integração com banco real.
- Planejar migração para Fastify v5 (elimina avisos deprecatórios sobre `routeConfig`).
