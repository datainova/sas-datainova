# Ambiente de Dados do Agente — DataInova Connect

Resumo da implementação inicial do banco local do Agente, baseada na “Arquitetura de Dados do Agente (onprem)” e no diagrama `datainova_agent_db_diagram.json`.

## Decisões incorporadas
- **Single tenant**: nenhuma política de RLS; isolamento por instalação.
- **Idempotência forte**: `outbox_batch` com `(batch_id, checksum)` e estados `publish_state`.
- **Versionamento de Query Code**: `querycode` com `version`, `checksum`, `mapping` e vínculo com `connector`.
- **Observabilidade**: `connector_health`, `run.stats`, `validation_issue` e `audit_local`.
- **Particionamento temporal**: tabelas `run`, `run_result` e `outbox_batch` particionadas por mês (parent tables + criação automática de partições de -1 a +6 meses).

## Artefatos criados
- `apps/agent-api/prisma/schema.prisma` — modelo Prisma completo (config, conectores, sync cache, scheduler, outbox, auditoria, KV).
- `apps/agent-api/prisma/migrations/20241022130000_init/migration.sql` — enums, tabelas, índices, triggers de `updated_at` e partições provisórias.
- `apps/agent-api/prisma/seed.ts` — dataset demo: agente configurado, conector Postgres saudável, query code MRR, run concluído, lote publicado, issue de DQ e KV de sync.
- `apps/agent-api/.env.example` — variáveis padrão para execução local do Agente.
- `apps/agent-api/README.md` — guia de bootstrapping e explicação das entidades.

## Como usar
1. Suba `agent-db` com `docker compose -f infra/compose/docker-compose.dev.yml up -d agent-db`.
2. `pnpm install`.
3. `pnpm --filter agent-api db:generate && pnpm --filter agent-api db:migrate`.
4. `pnpm --filter agent-api db:seed` para popular cenário demo.
5. Inspecione dados com `pnpm --filter agent-api db:studio` ou psql.

## Próximas etapas recomendadas
- Automatizar retenção (cleanup de runs/outbox/audit) e criação contínua de partições.
- Registrar regras de DQ no próprio banco (`validation_issue.rule` → tabela de catálogo).
- Implementar workers NestJS para scheduler, sync com SaaS e publisher usando este schema.
- Criar testes de integração que confirmem idempotência (`batch_id`, `checksum`) e retries do outbox.
