# DataInova Agent — Ambiente de Dados Local

Este diretório traz o esquema inicial do banco local do Agente, alinhado com a arquitetura descrita em `docs/Dados/Arquitetura de Dados do Agente`. O stack utiliza **PostgreSQL 16 + Prisma**, sem RLS (instalação single-tenant), com ênfase em idempotência e observabilidade.

## Pré-requisitos
- Node.js 20
- pnpm 9
- PostgreSQL 16 (use `infra/compose/docker-compose.dev.yml`, serviço `agent-db`)

## Primeiros passos
```bash
pnpm install
pnpm --filter agent-api db:generate   # gera Prisma Client
pnpm --filter agent-api db:migrate    # cria o schema local
pnpm --filter agent-api db:seed       # dados demo (conector, query code, outbox)
```

> A migration inicial cria enums locais, tabela de configuração (`agent_config`), conectores/health-check, cache de sync (`sync_*`), scheduler (`run`, `run_result`), outbox e auditoria. Funções de `updated_at` e partições mensais para `run`, `run_result` e `outbox_batch` também são provisionadas.

## Estrutura chave
- `agent_config`: identifica tenant/agent, base URL do SaaS e fuso horário.
- `connector` + `connector_health`: fontes de dados autorizadas e telemetria de health.
- `querycode`: SQL versionado por indicador com checksum e metadados (mapping, vcs_ref).
- `sync_indicator/target/segment_rule`: cache dos metadados do SaaS (indicadores, metas, segmentação).
- `run` / `run_result`: execução agendada de queries, incluindo stats e resultados normalizados.
- `outbox_batch` / `outbox_item`: publicação idempotente para o SaaS com controle de retries.
- `validation_issue`, `audit_local`, `kv_store`: qualidade, auditoria e KV utilitário (ETags, feature flags).

## Seeds
O script `prisma/seed.ts` instala:
- Configuração base (`agent_config`) alinhada aos IDs do seed do SaaS.
- Conector Postgres (`connector`) com health record válido.
- Query code (MRR) versão 1 + cache de indicador/meta.
- Run bem-sucedido com resultado agregado, lote de outbox publicado e alertas de DQ.
- KV de sincronização (`sync.indicators/etag`).

IDs são determinísticos para permitir reexecuções idempotentes.

## Próximos passos sugeridos
- Adicionar rotinas de retenção para `run_result`, `outbox_*` e `audit_local`.
- Estender seeds com múltiplos conectores (SQL Server) e cenários de erro (`publish_state=ERROR`).
- Integrar workers NestJS para popular este banco (scheduler, sync, publisher) usando as mesmas entidades.
