# DataInova Connect

Plataforma SaaS + Agente on-premises para consolidar OKRs/KPIs e jornadas de gestão de desempenho multi-tenant. Este repositório opera como monorepo pnpm/Turborepo, abrigando as aplicações SaaS, o agente distribuído e pacotes compartilhados (contratos, UI, lint).

## Visão Geral de Arquitetura

- **SaaS (nuvem)**: Fastify/Node 20 + Prisma + PostgreSQL 16 (RLS/partições) com APIs REST e MCP, SPA em React/Vite, workers pgboss e deploy no Render.com integrado ao Aiven PostgreSQL.
- **Agente (on-premises)**: NestJS (sugerido) para API local e workers, UI React/Vite, persistência local Postgres e publicação assinada por HMAC para o SaaS.
- **Monorepo**: `pnpm` workspaces + Turborepo para orquestrar build, lint, test e dev; barreiras de importação garantem a separação SaaS vs Agente.
- **Observabilidade**: logs JSON estruturados via pino, correlação com `x-request-id`/`traceparent`, métricas Prometheus e tracing OpenTelemetry (ver `Docs/Stack e Estrutura de Logs.docx`).

## Estrutura do Repositório

```
/
├─ apps/
│  ├─ saas-api/        # Fastify/Prisma/pgboss (API e workers SaaS)
│  ├─ saas-web/        # SPA SaaS (React/Vite)
│  ├─ agent-api/       # API local/Workers do Agente (NestJS sugerido)
│  └─ agent-ui/        # UI do Agente (React/Vite)
│
├─ packages/
│  ├─ contracts-openapi/ # SDK gerado da OpenAPI do SaaS
│  ├─ contracts-mcp/     # Tipos/cliente das ações MCP
│  ├─ ui-kit/            # Componentes compartilhados (evitar acoplamento)
│  ├─ eslint-config/     # Config central de lint e barreiras de import
│  └─ tsconfig/          # Bases TS para apps/libs
│
├─ infra/
│  ├─ compose/         # docker-compose.* para DEV
│  ├─ docker/          # Dockerfiles (SaaS/Agente)
│  └─ k8s/             # Manifests (quando aplicável)
│
├─ Docs/               # Documentação estratégica (perfis, deploy, logs)
├─ datainova.code-workspace
├─ package.json        # Scripts e dependências raiz
├─ pnpm-workspace.yaml
└─ turbo.json
```

## Principais Referências

- **Perfis Técnicos**: responsabilidades e entregáveis por papel (`Docs/Perfis Técnicos.docx`). O arquiteto(a) de software lidera limites SaaS/Agente, segurança full-stack, operabilidade e custos, entregando diagramas C4, `render.yaml`, playbooks de SRE e SLIs/SLOs.
- **Stack e pastas**: definições de ferramentas, scripts e limites de import (`Docs/Estrutura de Pastas e Stack do Projeto.docx`).
- **Logs e boas práticas**: convenções de código, segurança, observabilidade e taxonomia de erros (`Docs/Stack e Estrutura de Logs.docx`).
- **Guia de Deploy**: fluxo GitHub → Render → Aiven, variáveis de ambiente e rollback (`Docs/Guia de Deploy.docx`).

## Pré-requisitos

- Node.js 20 (sugerido gerenciar via Volta ou nvm)
- pnpm 9.x
- Docker + Docker Compose
- Acesso às ferramentas de observabilidade/logs adotadas pelo time

## Configuração Inicial

1. Instale dependências do monorepo:
   ```bash
   pnpm install
   ```
2. Copie os exemplos de variáveis de ambiente:
   ```bash
   cp apps/saas-api/.env.example apps/saas-api/.env
   cp apps/saas-web/.env.example apps/saas-web/.env
   cp apps/agent-api/.env.example apps/agent-api/.env
   cp apps/agent-ui/.env.example apps/agent-ui/.env
   ```
3. Suba os serviços de suporte locais (Postgres SaaS/Agente + Mailhog):
   ```bash
   docker compose -f infra/compose/docker-compose.dev.yml up -d
   ```
4. Ajuste secrets sensíveis (`AGENT_HMAC_SECRET`, OIDC, SMTP, etc.) antes de iniciar serviços.

## Scripts Principais

- `pnpm dev:saas` – executa pipelines dev das apps SaaS (API + Web).
- `pnpm dev:agent` – executa pipelines dev do agente (API + UI).
- `pnpm dev` – executa todos os processos de desenvolvimento configurados no Turborepo.
- `pnpm build | lint | test` – agregadores Turborepo para construir, lintar e testar todos os projetos.
- `pnpm generate:contracts` – atualiza SDKs OpenAPI/MCP em `packages/`.

Cada app/pacote deve expor scripts individuais (`dev`, `build`, `lint`, `test`) que o Turborepo consome. APIs devem usar `tsx`/`nodemon` para hot reload; SPAs usam `vite` com portas 5173 (SaaS) e 5174 (Agente).

## Qualidade, Segurança e Observabilidade

- TypeScript `strict`, `exactOptionalPropertyTypes` e `noImplicitOverride` já configurados nos `tsconfig` base de `packages/tsconfig`.
- ESLint central (`packages/eslint-config`) impõe import boundaries entre SaaS e Agente; estenda-o nos apps assim que forem criados.
- Prettier é exigido (`editor.formatOnSave` + `prettier.requireConfig`). Adicione `prettier.config.js` conforme a convenção do time.
- Logs seguem padrão JSON line com campos `time`, `ts`, `level`, `component`, `env`, `service`, `request_id`, `trace_id` etc. Consulte o checklist em `Docs/Stack e Estrutura de Logs.docx`.
- Propague `x-request-id` e `traceparent` entre SaaS ↔ Agente e use OpenTelemetry para correlacionar traces/logs/métricas.
- Segurança mínima: OIDC + Magic Link, Argon2id, RLS em todas as tabelas multitenant, assinatura HMAC (Agente ↔ SaaS), ratelimit e redaction de segredos nos logs.

## Deploy (Resumo)

- Repositório GitHub com branches `staging` e `main` alimenta Render.com (Web Service `saas-api`, Worker `saas-workers`, Static Site `saas-web`).
- Banco PostgreSQL gerenciado via Aiven por ambiente; mantenha `sslmode=require`.
- Blueprint `render.yaml` descreve build/start, variables e health checks.
- GitHub Actions podem rodar `prisma migrate deploy` contra Aiven antes de acionar hooks de deploy Render (ver exemplo em `Docs/Guia de Deploy.docx`).

## Próximos Passos

- Popular `apps/` e `packages/` com código base (Fastify, NestJS, React) mantendo limites definidos.
- Acrescentar configs específicas de lint, Jest/Vitest e Prettier em cada projeto.
- Documentar ADRs relevantes (ex.: particionamento, strategies de migração) na pasta `Docs/` ou no repositório de decisões.

---
Para dúvidas sobre responsabilidades, stack ou práticas transversais, consulte os documentos em `Docs/` ou alinhe com o(a) arquiteto(a) de software responsável.



## Personas do Projeto
-Sempre que você for chamado de Luiz, você adotará o pefil tecicno "Arquiteto de Dados" que está descrito em Docs\Perfis Técnicos.docs