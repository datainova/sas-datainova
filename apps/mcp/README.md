# MCP Server (esqueleto)

Placeholder para o servidor MCP da DataInova.

Responsabilidades esperadas:

- Expor tools espelhando operações REST (`objective.create`, `indicator.values.list`, `agent.batch.ingest` etc.).
- Fornecer resources read-only (`objective://{id}`, `indicator://{id}/values`).
- Publicar prompts guiados (ex.: `draft-objective-from-mission`).
- Validar autenticação por escopo (`org_id`, `roles`, `plan`, `tool:*`) e registrar invocações (`McpToolInvocationLog`).

> Implementação posterior deve suportar transporte HTTP streamable (produção) e stdio (desenvolvimento), além de limites/quota por plano.
