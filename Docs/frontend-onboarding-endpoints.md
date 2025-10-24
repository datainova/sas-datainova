# Guia de Onboarding — DataInova Connect (Frontend)

Este documento resume como o frontend deve consumir os endpoints de onboarding do SaaS e como manter o estado da jornada inicial (wizard) até a conclusão. Todos os endpoints ficam sob `/v1`, exigem autenticação (`Authorization: Bearer <accessToken>`) e retornam JSON.

## Visão Geral

| Endpoint | Método | Objetivo | Status HTTP |
| --- | --- | --- | --- |
| `/onboarding/sessions` | `POST` | Cria uma nova sessão de onboarding para o usuário logado | 201 |
| `/onboarding/sessions/:id/step` | `PATCH` | Persiste o passo atual e estado parcial (autosave) | 200 |
| `/onboarding/sessions/:id/complete` | `POST` | Marca o onboarding como concluído e aplica ajustes finais na organização | 200 |

### Estrutura base das respostas
Todas as respostas de sessão seguem o shape:
```json
{
  "id": "<uuid-da-sessao>",
  "step": "<identificador-do-passo>",
  "status": "ACTIVE|COMPLETED",
  "state": { ... },
  "updatedAt": "2025-10-22T21:20:11.321Z"
}
```

## Fluxo detalhado

### 1. Criar sessão de onboarding
`POST /onboarding/sessions`

**Body (opcional)**
```json
{
  "step": "welcome",
  "state": {
    "companyName": "DataInova"
  }
}
```
- `step`: string livre que identifica o passo inicial. Defaults para `welcome` se omitido.
- `state`: objeto JSON arbitrário armazenando respostas do wizard.

**Response 201**
```json
{
  "id": "2b2a2c25-69fd-4aa1-8f26-5d54a9a8d2c3",
  "step": "welcome",
  "status": "ACTIVE",
  "state": {
    "companyName": "DataInova"
  },
  "updatedAt": "2025-10-22T21:20:11.321Z"
}
```

> Crie a sessão assim que o usuário autenticado entrar no fluxo. Você pode reaproveitar sessões ativas (ver nota abaixo) para permitir retomar o wizard.

### 2. Autosave de passo
`PATCH /onboarding/sessions/:id/step`

**Body**
```json
{
  "step": "team",
  "payload": {
    "members": [
      { "email": "owner@datainova.com", "role": "OWNER" },
      { "email": "manager@datainova.com", "role": "ADMIN" }
    ]
  }
}
```
- `step`: passo atual (string).
- `payload`: objeto JSON com dados desse passo. O backend mescla o payload com o `state` existente (`state = { ...stateAnterior, ...payload }`).

**Response 200**
```json
{
  "id": "2b2a2c25-69fd-4aa1-8f26-5d54a9a8d2c3",
  "step": "team",
  "status": "ACTIVE",
  "state": {
    "companyName": "DataInova",
    "members": [
      { "email": "owner@datainova.com", "role": "OWNER" },
      { "email": "manager@datainova.com", "role": "ADMIN" }
    ]
  },
  "updatedAt": "2025-10-22T21:24:55.001Z"
}
```

> Recomenda-se chamar este endpoint após cada ação relevante (autosave) e também antes de navegações que poderiam descartar dados locais.

### 3. Concluir onboarding
`POST /onboarding/sessions/:id/complete`

**Body (opcional)**
```json
{
  "organization": {
    "name": "DataInova Connect",
    "tz": "America/Sao_Paulo",
    "currency": "BRL",
    "locale": "pt-BR"
  }
}
```
- `organization`: alterações finais aplicadas à organização do usuário (todas opcionais; apenas as informadas são atualizadas).

**Response 200**
```json
{ "ok": true }
```

Após a conclusão:
- O status da sessão muda para `COMPLETED`.
- Os campos enviados em `organization` são persistidos.
- Você pode redirecionar para o dashboard principal.

## Boas práticas no frontend

1. **Gerenciamento de sessão**
   - Antes de criar uma nova sessão, consulte se o usuário já possui uma `ACTIVE`. Embora não haja endpoint de listagem dedicado, o backend rejeita atualizações com `404` se o ID não pertencer ao usuário. Recomenda-se armazenar o `sessionId` no estado global/local storage assim que for criado.

2. **Recuperação após refresh**
   - Caso perca o `sessionId`, basta criar uma nova sessão e regravar o estado a partir dos dados locais do wizard.

3. **Tratamento de erros**
   - As respostas de erro seguem o formato problem+json (RFC 7807). Principais `code` possíveis:
     - `E_ONBOARDING_NOT_FOUND` (404) — sessão inexistente ou de outro usuário.
   - Em todos os casos, o payload inclui `correlation.request_id` e `correlation.trace_id` para rastreabilidade.

4. **Persistência incremental**
   - Ao salvar cada passo, envie apenas os campos que sofreram alteração. Eles serão mesclados com o estado existente.
   - O frontend pode consolidar os dados para exibição usando o campo `state` devolvido pelo backend.

5. **Finalização idempotente**
   - `POST /complete` é idempotente. Chamadas repetidas com o mesmo `id` apenas retornarão `{ "ok": true }` após o primeiro sucesso.

## Exemplos de sequência

### Onboarding completo com três etapas
1. `POST /onboarding/sessions` → guarda `sessionId`.
2. A cada passo, `PATCH /onboarding/sessions/:id/step` com os dados coletados.
3. Ao finalizar, `POST /onboarding/sessions/:id/complete` (opcionalmente com ajustes de organização).
4. Redireciona para a aplicação normal.

### Recuperação após refresh do navegador
1. Obter `sessionId` salvo localmente.
2. (Opcional) `PATCH /onboarding/sessions/:id/step` com `payload` vazio para forçar o backend a devolver o estado consolidado.
3. Reidratar o wizard com `state` retornado.

## Referências
- OpenAPI/Swagger disponível em `/docs`.
- Detalhes adicionais sobre fluxo e permissões: `Docs/Arquitetura SaaS/backend/Especificação de Endpoints.docx` e `Docs/Arquitetura SaaS/Casos de Uso SaaS.docx`.

Para dúvidas ou integrações adicionais, procure o time de backend.
