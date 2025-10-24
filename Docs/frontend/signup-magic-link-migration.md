# Signup com Link Mágico — Guia de Adaptação Frontend

O backend agora divide o cadastro em duas etapas: (1) coleta apenas o e-mail, envia um link mágico e (2) finaliza o cadastro após o clique, quando o usuário informa os demais dados. Este documento lista os ajustes necessários no SaaS Web.

## 1. Novo fluxo de telas
1. **Formulário inicial (solicitar acesso)**
   - Campo único: `email`.
   - Chamar `POST /v1/auth/signup` e exibir mensagem de confirmação (“Enviamos um link para seu e-mail”).
2. **Tela de confirmação**
   - Ao abrir o link mágico, o frontend chama `GET /v1/auth/signup/confirm?token=<token>`.
   - Se válido, exibir formulário para concluir cadastro com os campos:
     - Nome completo (`name`)
     - Senha (`password`)
     - Dados da organização (`organization.name`, `organization.tz`, `organization.currency`, `organization.locale`, `organization.nickname?`).
   - Submeter tudo via `POST /v1/auth/signup/complete`.
3. **Pós-cadastro**
   - Salvar os tokens/organização retornados e redirecionar para o onboarding ou dashboard inicial.

## 2. Ajustes de API e validações
- **`POST /v1/auth/signup`**
  - Payload mínimo `{ email }`.
  - Tratar respostas:
    - `202 OK`: exibir mensagem de sucesso.
    - `409 E_AUTH_EMAIL_IN_USE`: usuário já ativo → redirecionar para login.
  - Em dev/staging o backend devolve `verification.token`; usar apenas em ambientes de teste.
- **`GET /v1/auth/signup/confirm`**
  - Em caso de `400 E_VERIFICATION_INVALID`, mostrar alerta e oferecer reenvio do link.
- **`POST /v1/auth/signup/complete`**
  - Payload conforme exemplo acima.
  - Tratar erros:
    - `409 E_VERIFICATION_ALREADY_COMPLETED`: token já usado → levar para login.
    - `400 E_VERIFICATION_INVALID`: token expirado → solicitar novo link.
    - `409` de unicidade (ex.: apelido duplicado) → mostrar mensagem contextual e permitir editar os campos.

## 3. UX recomendada
- Mostre um estado intermediário (“Verificando token…”) ao abrir o link.
- Habilite validações client-side para senha forte e campos da organização.
- Apresente resumo da organização após o POST final para evitar dúvidas.
- Ofereça ação “re-enviar link” reutilizando `POST /v1/auth/signup`.

## 4. Armazenamento e redirecionamento
- Após `signup/complete`, o backend já devolve:
  ```json
  {
    "accessToken": "...",
    "refreshToken": "...",
    "user": { "id": "...", "email": "...", "name": "...", "role": "OWNER" },
    "organization": { "id": "...", "name": "...", "nickname": "...", "tz": "...", "currency": "...", "locale": "..." }
  }
  ```
- Persistir dados normalmente (localStorage/secure storage) e setar contexto do tenant com a organização devolvida.

## 5. Testes sugeridos
1. Solicitar acesso com e-mail novo → link recebido → concluir com sucesso.
2. Abrir link expirado → mensagem de erro e reenvio.
3. Tentar concluir cadastro com apelido já usado → backend retorna 409 → permitir correção.
4. Reusar token consumido → redirecionar para login.
5. Garantir que login tradicional continua funcionando após o cadastro.

## 6. Reforços finais
- Atualize copy/telemetria das telas para refletir o novo fluxo (por exemplo, eventos `signup_link_sent`, `signup_completed`).
- Revise onboarding automatizado: usuários agora chegam à etapa 2 sem tokens prévios.
- Trabalhe junto ao time de marketing/suporte para alinhar e-mails transacionais e scripts de atendimento.
