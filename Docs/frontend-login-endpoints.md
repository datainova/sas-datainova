# Guia de Endpoints de Login — DataInova Connect (Frontend)

Este documento resume como o frontend deve consumir os fluxos de autenticação e recuperação de acesso expostos pela API SaaS. Todos os endpoints ficam sob o prefixo `/v1` e retornam JSON.

## Visão Geral

- **Autenticação principal**: `POST /auth/login` devolve par de tokens (access + refresh).
- **Gerência do ciclo de sessão**: `POST /auth/token` renova tokens; `POST /auth/logout` invalida refresh tokens ativos.
- **Onboarding de usuário**: fluxo de signup com confirmação (`/auth/signup`, `/auth/signup/confirm`, `/auth/signup/complete`).
- **Recuperação de senha**: (`/auth/password/forgot`, `/auth/password/validate`, `/auth/password/reset`).
- **OIDC Google (opcional)**: fornece iniciação PKCE e callback para login social.

Consistência de headers:

| Header | Descrição |
| --- | --- |
| `Content-Type` | sempre `application/json` |
| `Authorization` | obrigatório nos endpoints protegidos (`Bearer <access_token>`) |
| `x-request-id` | opcional; se omitido, o backend gera |

## Fluxo de Login e Sessão

### 1. Login (`POST /auth/login`)

Envie o par usuário/senha e identifique a organização usando **UUID** (fluxo legado) ou o novo **apelido amigável (`organizationNickname`)**.

**Body — usando UUID (compatibilidade)**
```json
{
  "email": "owner@datainova.com",
  "password": "S3nh@Forte",
  "organizationId": "<uuid-da-org>"
}
```

**Body — usando apelido**
```json
{
  "email": "owner@datainova.com",
  "password": "S3nh@Forte",
  "organizationNickname": "data-inova-demo"
}
```

**Response 200**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "email": "...",
    "name": "...",
    "role": "OWNER"
  },
  "organization": {
    "id": "...",
    "nickname": "data-inova-demo",
    "name": "DataInova Demo",
    "tz": "America/Sao_Paulo",
    "currency": "BRL",
    "locale": "pt-BR"
  }
}
```

- `accessToken`: usado em `Authorization` para chamadas subsequentes.
- `refreshToken`: armazene seguro (httpOnly cookie/local secure storage) para renovação.
- `organization.nickname`: apelido amigável escolhido no cadastro ou via `PATCH /organization`.

### 2. Renovação de token (`POST /auth/token`)

**Body**
```json
{
  "refreshToken": "..."
}
```

**Response 200**
```json
{
  "accessToken": "...",
  "refreshToken": "..."
}
```

> Ao renovar, o backend revoga o refresh antigo. Substitua ambos os tokens no cliente.

### 3. Logout (`POST /auth/logout`)

**Body opcional**
```json
{
  "refreshToken": "..."
}
```

Sem `body`, apenas invalida a sessão server-side (stateless). Com `refreshToken`, revoga o token informado.

## Fluxo de Signup + Confirmação

1. **Solicitar acesso** — `POST /auth/signup`
   - Body mínimo:
     ```json
     { "email": "owner@datainova.com" }
     ```
   - Response 202 `{ "ok": true, "verification": { "token": "...", "expiresAt": "..." } }` (o objeto `verification` aparece apenas em ambientes de desenvolvimento). O backend envia o link mágico por e-mail.

2. **Confirmar e-mail** — `GET /auth/signup/confirm?token=<token>`
   - Valida o token e devolve `email` + `expiresAt` para preencher o wizard de conclusão.

3. **Completar cadastro** — `POST /auth/signup/complete`
   ```json
   {
     "token": "<token-da-etapa-anterior>",
     "name": "Líder Demo",
     "password": "SenhaForte123",
     "organization": {
       "name": "DataInova Demo",
       "tz": "America/Sao_Paulo",
       "currency": "BRL",
       "locale": "pt-BR",
       "nickname": "data-inova-demo"
     }
   }
   ```
   - Response 200 devolve tokens + contexto completo (usuário e organização). O usuário passa a ser OWNER ativo.

## Recuperação de Senha

1. **Disparar e-mail** — `POST /auth/password/forgot`
   ```json
   { "email": "owner@datainova.com" }
   ```
   - Response 202 com `resetToken` e `expiresAt` (útil em ambientes de teste).

2. **Validar token** — `GET /auth/password/validate?token=<token>`
   - Response 200 com e-mail e expiração. Se inválido, retorna 400 (problem+json).

3. **Redefinir** — `POST /auth/password/reset`
   ```json
   {
     "token": "...",
     "password": "NovaS3nh@"
   }
   ```
   - Response 200 `{ "ok": true }`. O usuário pode logar imediatamente.

## Login via Google (OIDC)

1. **Init** — `GET /auth/oidc/google/init`
   - Response 200 com `authorizationUrl`, `state`, `codeVerifier`.
   - Frontend redireciona o usuário para `authorizationUrl` e guarda `state`/`codeVerifier` para finalizar.

2. **Callback** — `GET /auth/oidc/google/callback`
   - Expecta query `state`, `code`, `email`, `organizationId`.
   - Response 200 com mesmo payload de `POST /auth/login`.
   - Backend valida `state` (5 min) via storage interno.

## Convenções de Erro

- Todas as falhas seguem RFC 7807 (`application/problem+json`).
- Campos: `type`, `title`, `status`, `detail`, `code`, `correlation` (`request_id`, `trace_id`).
- Códigos principais:
  - `E_AUTH_INVALID_CREDENTIALS` (401)
  - `E_AUTH_INVALID_REFRESH` (401)
  - `E_AUTH_NOT_MEMBER` (403)
  - `E_VERIFICATION_INVALID` / `E_VERIFICATION_CONSUMED` (400/409)
  - `E_PASSWORD_TOKEN_INVALID` (400)

## Sequências recomendadas

### Login regular
1. `POST /auth/login`
2. Guardar tokens.
3. Renovar tokens com `POST /auth/token` antes do expirar (ou quando receber 401/403).
4. `POST /auth/logout` na saída.

### Recuperação de senha
1. `POST /auth/password/forgot`
2. Usuário abre link → frontend chama `GET /auth/password/validate`.
3. Submete nova senha com `POST /auth/password/reset`.
4. Redireciona para tela de login.

### Signup
1. `POST /auth/signup` → exibir instruções.
2. `GET /auth/signup/confirm` ao abrir link do e-mail.
3. `POST /auth/signup/complete` e salvar tokens devolvidos.

### Google OIDC
1. `GET /auth/oidc/google/init` → redirecionar para Google.
2. No retorno, `GET /auth/oidc/google/callback` com os parâmetros informados.

## Observações adicionais

- Os tokens não são armazenados pelo backend; cabe ao frontend preservá-los em storage seguro.
- No login é possível enviar `organizationId` **ou** `organizationNickname`. Armazene pelo menos um identificador por usuário e, se expuser apelidos no produto, sincronize com `GET /organization` ou `PATCH /organization`.
- Erros adicionais relevantes: `E_AUTH_ORGANIZATION_NOT_FOUND` (404) quando o apelido não existe, `E_AUTH_ORGANIZATION_MISMATCH` (400) ao enviar UUID e apelido divergentes e `E_AUTH_ORGANIZATION_REQUIRED` (400) se nenhum identificador for informado.
- No novo signup assíncrono, trate também `E_VERIFICATION_ALREADY_COMPLETED` (409) caso o token já tenha sido consumido e recomece pelo passo de login.
- Para ambientes diferentes (staging/prod), ajuste o servidor na documentação aberta em `/docs`.
- Qualquer dúvida sobre contratos específicos, verifique o Swagger (`/docs`) ou a especificação completa `Docs/Arquitetura SaaS/backend/Especificação de Endpoints.docx`.
