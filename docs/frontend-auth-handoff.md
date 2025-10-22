# Repasse Backend → Frontend: Autenticação DataInova

Este documento resume o que o frontend precisa saber para integrar com o backend de autenticação implementado conforme _Login.docx_.

## Cookies e tokens
- `refreshToken`: emitido como cookie HttpOnly, `SameSite=Lax`. TTL configurável (default 30 dias). Em dev o cookie não é `Secure`, em demais ambientes sim.
- `csrfToken`: cookie não-HttpOnly contendo token de dupla submissão. O frontend **sempre** deve enviar `x-csrf-token` com o valor deste cookie em requisições que dependem do refresh token (`POST /auth/token`, logout opcional).
- `accessToken`: retornado no corpo das rotas de login/signup/reset/refresh. Deve ser armazenado apenas em memória (ex.: Redux store in-memory).

## Endpoints expostos

### POST `/auth/login`
Request body `{ email, password }`.
Response `200`:
```json
{
  "accessToken": "…" | null,
  "user": { "id": "uuid", "email": "…", "status": "ACTIVE|BLOCKED" },
  "orgs": [
    { "id": "uuid", "name": "…", "role": "ORG_OWNER|MANAGER|…", "tenantId": "uuid|null", "plan": "FREE|PRO|ENTERPRISE|null" }
  ],
  "activeOrgId": "uuid",
  "requiresOrgSetup": true|false
}
```
Notas:
- Mensagens de erro são genéricas (`401` invalid, `429` rate limit, `403` bloqueado).
- Quando `requiresOrgSetup=true`, nenhum token/cookie é emitido. Frontend deve enviar usuário ao Onboarding Wizard anônimo.
- Multi-org: `orgs` lista todas as organizações; por padrão usamos a primeira como ativa. Para trocar, use `/auth/token` com `orgId` (abaixo).

### POST `/auth/token`
- Usa cookie `refreshToken` + header `x-csrf-token`.
- Body opcional `{ refreshToken?, orgId? }`. `refreshToken` só necessário para fallback em clientes sem cookie. `orgId` permite alternar organização ativa sem refazer login.
- Response: `{ "accessToken": "…" }` e novos cookies (refresh + csrf rotacionados).
- Erros principais: `401` (token inválido/expirado), `403` (CSRF ausente ou org inválida).

### POST `/auth/logout`
- Aceita refresh token via cookie ou body.
- Sempre limpa cookies (`204`). Frontend pode ignorar corpo.

### POST `/auth/signup`
- Body `{ email }`. Resposta `202` com mensagem genérica.
- Backend envia email (remetente exibido configurável, ex.: `onboarding@datainova.com.br`) com link `GET /auth/signup/confirm?token=…` (usado pelo frontend) e job assíncrono registrado.

### GET `/auth/signup/confirm`
- Query `token`. Response `200 { email }`, ou `400/410` (inválido/expirado).

### POST `/auth/signup/complete`
- Body `{ token, password }`.
- Response `201` igual ao login: quando usuário já pertence a uma org, tokens/cookies emitidos; caso contrário `accessToken=null` e `requiresOrgSetup=true`.

### POST `/auth/password/forgot`
- Body `{ email }`, resposta `202` genérica.
- Backend envia email (remetente exibido configurável, ex.: `recovery@datainova.com.br`) com link para redefinição.

### GET `/auth/password/validate`
- Query `token`. Response `200 { email }` ou `400/410`.

### POST `/auth/password/reset`
- Body `{ token, newPassword }`.
- Response `{ "accessToken": "…" }` (ou `null` + `requiresOrgSetup=true`). Sempre rotaciona refresh token.

### GET `/auth/oidc/google/init`
- Redireciona diretamente ao Google (code flow + PKCE). Frontend deve abrir em nova janela/tab.

### GET `/auth/oidc/google/callback`
- Endpoint configurado como redirect URI no Google.
- Ao concluir, emite cookies/`accessToken` e retorna HTML com `window.opener.postMessage({ type: 'oidc-result', data }, origin)`.
- `data` exemplos:
  - `{ status: 'success', accessToken, orgId }`
  - `{ status: 'requires_org_setup' }`
  - `{ status: 'error' }` (erros genéricos)
- Frontend deve observar `message` event, capturar `accessToken` e fechar janela pop-up.

## Comportamentos esperados no Frontend
1. **Login form**: enviar `POST /auth/login`. Exibir mensagens genéricas em falha. Caso `requiresOrgSetup`, redirecionar para onboarding sem tentar `auth/token`.
2. **Seleção de organização**: após login, se `orgs.length > 1`, apresentar selector. Ao escolher, chamar `POST /auth/token` com `orgId` e atualizar `accessToken` em memória.
3. **Guarda de sessão**:
   - Armazenar `accessToken` em memória curta (e.g. React context).
   - Renovar via `/auth/token` sempre que receber `401` da API ou timer (antes de expirar). Lembrar do `x-csrf-token`.
4. **Logout**: chamar `/auth/logout`, limpar caches locais.
5. **Signup/Reset**: fluxos em duas etapas; reutilizar `GET /auth/...` para validar token antes de exibir formulário. Mensagens de expiração devem oferecer botão para reenviar (`POST /auth/signup` ou `/auth/password/forgot`).
6. **OIDC Google**: abrir popup para `/auth/oidc/google/init`; aguardar `postMessage`. Validar `event.origin` contra `FRONTEND_URL`. Em sucesso, armazenar `accessToken`; caso contrário, mostrar erro genérico.
7. **Headers com access token**: usar `Authorization: Bearer <accessToken>`. `refreshToken` nunca deve ser enviado manualmente (salvo fallback explicitado).

## Mensagens & UX
- Erro genérico para login/reset/signup: “Não foi possível entrar agora. Tente novamente.”
- Em credenciais inválidas: “Credenciais inválidas. Verifique seu email e senha.”
- Em links expirados: mostrar CTA “Solicitar novo link”.
- Loading states: spinner no submit; disable botões durante requests.
- Acessibilidade: manter foco no container de erro; aria-live para feedback.

## Telemetria
Backend registra automaticamente eventos (`login_success`, `login_failed`, `signup_link_sent`, `signup_completed`, `reset_link_sent`, `password_reset_completed`, `token_refreshed`, `logout`, `login_requires_org_setup`). Frontend pode complementar com eventos UI se desejar, mas não é obrigatório para analytics básicos.

## Variáveis de ambiente relevantes (frontend awareness)
- `FRONTEND_URL`: utilizado pelo backend para gerar links e validar `postMessage`. Deve ser o mesmo origin do app.
- `GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI`: necessários para habilitar botão “Entrar com Google”. Caso ausentes, backend retorna `503` em rotas OIDC.
- `EMAIL_FROM_SIGNUP / EMAIL_FROM_RECOVERY`: definem o endereço exibido nos emails transacionais; se ausentes, o backend usa `EMAIL_FROM_ACCOUNT`.

## Resumo
- Fluxos suportados: e-mail/senha, signup com link, reset por magic link, Google OIDC.
- Sessão é `accessToken` (body) + `refreshToken` (cookie HttpOnly). Refresh sempre exige header `x-csrf-token` com valor do cookie `csrfToken`.
- Multi-org resolvido via `POST /auth/token` com `orgId`.
- Onboarding continua público; backend indica `requiresOrgSetup` para novos usuários.

Qualquer nova necessidade do frontend (ex.: reenvio automático de links, suporte a MFA) deve ser alinhada antes de alterar a API.
