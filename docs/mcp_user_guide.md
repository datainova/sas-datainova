# Guia do MCP para Usuários Finais

Este documento apresenta, em linguagem voltada a operadores e integradores, como consumir o **Model Context Protocol (MCP)** da DataInova. A partir daqui você aprenderá como autenticar, descobrir ferramentas (`tools`), acessar recursos (`resources`), usar prompts e interpretar respostas/erros.

---

## 1. Visão Geral

O MCP expõe as mesmas capacidades da API REST da plataforma para clientes de IA/assistentes compatíveis com JSON-RPC 2.0. Ele está disponível em:

- **Produção (HTTP):** `POST /mcp`
- **Desenvolvimento (stdio):** processo Node que lê requisições no `stdin` e devolve respostas no `stdout`

Todos os mecanismos de segurança, limites de plano e auditoria são compartilhados com o backend principal. Você sempre opera em nome de uma organização específica (org/tenant) e suas credenciais definem quais ferramentas e recursos aparecerão.

---

## 2. Pré-requisitos

1. **Token MCP válido** (JWT de curta duração) com claims:
   - `org_id` (obrigatório), `tenant_id` (opcional), `sub` (usuário/app), `roles[]`, `plan`, `scopes[]`
2. **Cabeçalhos mínimos** (quando não vierem do token):
   - `Authorization: Bearer <token>`
   - `X-Org-Id` (caso o token não traga `org_id`)
   - `X-Roles` e `X-Plan` (opcionais, apenas quando necessário forçar o contexto)
3. **Permissões de plano** compatíveis com a ferramenta desejada:
   - Ferramentas de ingestão (`agent.batch.ingest`) exigem **Enterprise** e feature `agent` habilitada

---

## 3. Transportes

| Ambiente     | Protocolo                 | Observações                                                                 |
|--------------|--------------------------|------------------------------------------------------------------------------|
| Produção     | HTTP/JSON-RPC 2.0        | Suporta `transfer-encoding: chunked` para streaming de progresso            |
| Desenvolvimento | stdio (processo local) | Inicie com `yarn mcp:dev` e utilize um inspector MCP para enviar JSON-RPC   |

Exemplo de chamada HTTP:

```bash
curl -X POST https://api.datainova.com/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

---

## 4. Fluxo Básico

1. **Listar ferramentas** (`tools/list`) para descobrir quais operações estão habilitadas.
2. **Invocar uma tool** (`tools/call`) fornecendo `name`, `arguments` e, quando aplicável, `idempotencyKey`.
3. **Listar resources** (`resources/list`) para obter URIs da organização.
4. **Ler resource específico** (`resources/read`) usando a URI retornada.
5. **Explorar prompts** (`prompts/list` / `prompts/get`) para templates de assistência guiada.

Cada resposta segue o padrão JSON-RPC:

- Sucesso: `{"jsonrpc":"2.0","id":"<id>","result":{ ... }}`
- Erro: `{"jsonrpc":"2.0","id":"<id>","error":{"code":<código>,"message":"<texto>","data":{...}}}`

---

## 5. Catálogo de Ferramentas

As tools respeitam plano e roles mínimos. Abaixo, tabela resumida:

| Tool                     | Planos                 | Roles mínimas                | Descrição                                      |
|--------------------------|------------------------|------------------------------|------------------------------------------------|
| `objective.create`       | FREE/PRO/ENTERPRISE    | ORG_OWNER, MANAGER           | Cria objetivo estratégico                      |
| `objective.segment`      | FREE/PRO/ENTERPRISE    | ORG_OWNER, MANAGER           | Atualiza segmentos                             |
| `objective.complete`     | FREE/PRO/ENTERPRISE    | ORG_OWNER, MANAGER           | Reativa/finaliza objetivo                      |
| `kr.create`              | FREE/PRO/ENTERPRISE    | ORG_OWNER, MANAGER           | Adiciona Key Result                            |
| `kpi.create`             | FREE/PRO/ENTERPRISE    | ORG_OWNER, MANAGER           | Adiciona KPI independente                      |
| `indicator.targets.upsert` | FREE/PRO/ENTERPRISE  | ORG_OWNER, MANAGER           | Substitui metas                                |
| `indicator.values.list`  | FREE/PRO/ENTERPRISE    | ORG_OWNER/MANAGER/CONTRIBUTOR/VIEWER | Lista séries históricas             |
| `agent.batch.ingest`     | ENTERPRISE             | ORG_OWNER                    | Ingestão via Agent                             |
| `plan.upgrade.preview`   | FREE/PRO/ENTERPRISE    | ORG_OWNER                    | Simula upgrade de plano                        |

### 5.1 `tools/list`

Pedido:

```json
{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}
```

Resposta (trecho):

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "tools": [
      {
        "name": "objective.create",
        "description": "Cria um novo objetivo estratégico.",
        "plans": ["FREE","PRO","ENTERPRISE"],
        "roles": ["ORG_OWNER","MANAGER"],
        "inputSchema": { ... },
        "outputSchema": { ... }
      }
    ]
  }
}
```

### 5.2 `tools/call` – exemplos principais

**Criar objetivo (`objective.create`)**

```json
{
  "jsonrpc":"2.0",
  "id":"2",
  "method":"tools/call",
  "params":{
    "name":"objective.create",
    "arguments":{
      "title":"Expandir receita no canal parceiro",
      "description":"Crescer a receita anual em novos canais.",
      "cadence":"QUARTERLY",
      "startDate":"2026-01-01",
      "endDate":"2026-12-31",
      "segments":[{"axis":"Regional","values":["Sudeste","Sul"]}]
    }
  }
}
```

Resposta:

```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "result": {
    "ok": true,
    "data": {
      "objectiveId": "9b9c6f29-0b6f-4c6a-b996-e68d7bb6a458",
      "status": "ACTIVE"
    }
  }
}
```

**Ingestão via Agent (`agent.batch.ingest`)**

```json
{
  "jsonrpc":"2.0",
  "id":"14",
  "method":"tools/call",
  "params":{
    "name":"agent.batch.ingest",
    "arguments":{
      "indicatorId":"8821f09b-1dbe-4c28-8f91-49d987cfb911",
      "period":"2026-01",
      "value":12345.67,
      "segmentKey":{"Estado":"SP"},
      "checksum":"9f1e4ef2c5",
      "batchId":"f1d3ff84-55a9-4f22-8d29-5fa03269dc83"
    }
  }
}
```

Resposta:

```json
{
  "jsonrpc":"2.0",
  "id":"14",
  "result":{
    "ok":true,
    "data":{
      "status":"accepted",
      "batchId":"f1d3ff84-55a9-4f22-8d29-5fa03269dc83",
      "indicatorValueId":"6e9d608a-2cc9-4ce7-8b6d-93a36db9a1f3",
      "version":2
    }
  }
}
```

#### Idempotência

- Tools mutativas aceitam `idempotencyKey` em `params`.
- Repetições com a mesma chave retornam o mesmo resultado (código 409 em conflitos reais).
- `agent.batch.ingest` usa o `batchId` do payload — mesmo lote gera resposta `duplicate`.

---

## 6. Resources

### 6.1 `resources/list`

Entrega URIs recentes da organização (objetivos e indicadores).

```json
{
  "jsonrpc":"2.0",
  "id":"3",
  "method":"resources/list",
  "params":{}
}
```

Resposta (exemplo):

```json
{
  "jsonrpc":"2.0",
  "id":"3",
  "result":{
    "resources":[
      {"uri":"objective://9b9c6f29-0b6f-4c6a-b996-e68d7bb6a458","description":"Expandir receita"},
      {"uri":"indicator://8821f09b-1dbe-4c28-8f91-49d987cfb911","description":"MRR Canal Parceiro"},
      {"uri":"indicator://8821f09b-1dbe-4c28-8f91-49d987cfb911/values","description":"MRR Canal Parceiro valores"}
    ]
  }
}
```

### 6.2 `resources/read`

Recebe a URI e devolve dados JSON. Para valores de indicador você pode passar query string:

```json
{
  "jsonrpc":"2.0",
  "id":"4",
  "method":"resources/read",
  "params":{
    "uri":"indicator://8821f09b-1dbe-4c28-8f91-49d987cfb911/values?range=2026-01..2026-06&segment=Estado:SP"
  }
}
```

---

## 7. Prompts

Use prompts em fluxos assistidos:

1. `prompts/list` → retorna nomes/descrições
2. `prompts/get` → retorna o template com placeholders

Prompts disponíveis atualmente:

- `draft-objective-from-mission`: gera rascunhos a partir de missão/visão.
- `segment-suggestions`: sugere eixos de segmentação com base em contexto textual.

---

## 8. Erros e Resolução de Problemas

| Código | Mensagem            | Quando ocorre                                              |
|--------|--------------------|------------------------------------------------------------|
| 40001  | `ValidationError`  | Payload fora do schema esperado                            |
| 40100  | `Unauthorized`     | Token ausente/inválido                                     |
| 40300  | `Forbidden`        | Plano/role/feature não habilitados                         |
| 40400  | `NotFound`         | Tool/resource inexistente para o contexto                  |
| 40900  | `Conflict`         | Idempotência (ex.: `batchId` duplicado com checksum distinto) |
| 42900  | `RateLimited`      | Limites de quota excedidos                                 |
| 50000  | `InternalError`    | Erro inesperado                                             |

Inclua sempre o campo `id` igual ao request original para correlacionar respostas.

---

## 9. Limites, Auditoria e Observabilidade

- **Quotas**: definidas por plano (ex.: `objective.create` limitado por `objectives` restantes).
- **Logs de invocação**: cada chamada gera um registro em `McpToolInvocationLog` com `tool`, `payload` (sanitizado), `durationMs`, `success` e mensagem de erro (quando aplicável).
- **Auditoria**: operações mutativas disparam entradas no `AuditLog`.
- **Tracing/Métricas**: disponíveis internamente para acompanhamento de latência e taxas de erro.

Em caso de limitação, a mensagem do erro 403/429 informará qual feature ou quota foi atingida.

---

## 10. Boas Práticas

1. **Renove tokens MCP** frequentemente (duram 15–60 minutos).
2. **Use `idempotencyKey`** em operações de escrita para evitar duplicidades.
3. **Paginação manual**: a maioria das tools retorna listas pequenas; em caso de grandes volumes, combine filtros (`range`, `latestVersion`) ou recursos.
4. **Sensibilidade de dados**: não armazene dados do MCP fora de ambientes protegidos.
5. **Teste em stdio** antes de publicar integrações que chamam o endpoint HTTP público.

---

## 11. Guia Rápido de Integração

1. Obtenha um token MCP via painel administrativo.
2. Execute `tools/list` para confirmar acesso.
3. Crie objetivos/KRs com `tools/call`.
4. Leia indicadores via `resources/read`.
5. Ajuste limites de indicadores com `indicator.targets.upsert`.
6. Em Enterprise, ingira dados pelo `agent.batch.ingest` (o agente deve estar registrado e ativo).
7. Use `plan.upgrade.preview` para exibir pricing em assistentes que orientam upgrades.

---

## 12. Suporte

Em caso de dúvidas, abra um chamado pelo portal de suporte ou entre em contato com o time Customer Success, informando o `X-Request-Id` (quando fornecido) ou o `id` da requisição JSON-RPC que apresentou problema.

---

Com este guia você está pronto para integrar assistentes MCP à DataInova com segurança e paridade funcional em relação à API REST. Boas integrações!
