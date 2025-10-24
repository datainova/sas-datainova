# Ambiente de Dados — DataInova Connect

Este documento consolida a interpretação do papel do **Arquiteto de Dados**, as decisões aplicadas no repositório e um checklist operacional para o time de backend iniciar o desenvolvimento.

## Papel do Arquiteto de Dados
- **Missão:** modelar dados agregados (OKRs/KPIs), garantir qualidade, governança e performance num PostgreSQL multitenant com RLS.
- **Responsabilidades principais:**
  - Modelagem de séries temporais e segmentação canônica (`segment_key` + `segment_hash`).
  - Garantir RLS obrigatória em todas as tabelas com `organization_id`, com GUC `app.organization_id`.
  - Implementar idempotência e linhagem via `ingest_batch` / `ingest_item`, `batch_id`, `checksum` e versionamento.
  - Definir métricas de qualidade (staleness, completude, unicidade) e mecanismos de reconciliação/backfill seguros.
  - Manter catálogo/glossário, políticas de retenção/anonimização (LGPD) e acessos segregados por tenant.
  - Entregar scripts de migração (Prisma + SQL) e ADRs sobre RLS/particionamento.

## Artefatos criados
- `apps/saas-api/prisma/schema.prisma` — modelo Prisma alinhado ao ERD (`organization`, `objective`, `indicator_*`, ingestão, auditoria e alertas).
- `apps/saas-api/prisma/migrations/20241022120000_init/migration.sql` — tipos enum, funções `app.*`, criação das tabelas, partições de `indicator_value`, políticas RLS e gatilhos.
- `apps/saas-api/prisma/seed.ts` — popula tenant demo com objetivo, indicador MRR, lote ingerido, valor versionado e violação de DQ.
- `apps/saas-api/.env.example` — variáveis recomendadas para desenvolvimento.
- `apps/saas-api/README.md` — guia de uso dos scripts (`db:generate`, `db:migrate`, `db:seed`) e pontos de atenção.

## Como executar localmente
1. Suba o banco com `docker compose -f infra/compose/docker-compose.dev.yml up -d`.
2. Instale dependências com `pnpm install`.
3. Gere o client e aplique a migration: `pnpm --filter saas-api db:generate && pnpm --filter saas-api db:migrate`.
4. Popule dados demo com `pnpm --filter saas-api db:seed`.
5. Use `pnpm --filter saas-api db:studio` para inspecionar dados e validar RLS (requer `SET LOCAL app.organization_id` para queries manuais).

## Checklist de Governança e Qualidade
- Policies RLS habilitadas e `FORCE ROW LEVEL SECURITY` nos objetos multitenant.
- Trigger `app.fail_if_no_tenant` ativo nas tabelas críticas (ingestão, indicadores, DQ, alertas).
- Partições de `indicator_value` geradas para -1 e +12 meses, com índices BRIN/GIN previstos.
- Linhagem ligada (`indicator_value.lineage_batch_id` → `ingest_batch.batch_id`).
- Seeds criam cenário de referência para testes automatizados (worker de ingestão, dashboards, alertas).

## Próximas evoluções sugeridas
- Automatizar a criação mensal de partições (cron job ou worker) usando função derivada do script atual.
- Adicionar validações de qualidade adicionais (ex.: tabela `dq_rule` e métricas de completude/staleness).
- Documentar os indicadores no catálogo de dados (nomenclatura, periodicidade padrão, unidade).
- Implementar testes automatizados de RLS (`pnpm test` futura suite) e backfills controlados (`ingest_batch.status`).
