# Atualização de Login — Suporte a `organizationNickname`

Este documento orienta o time de frontend sobre as mudanças necessárias para aproveitar o novo fluxo de seleção de organização sem exigir o UUID bruto no login (`POST /v1/auth/login`).

## 1. Resumo da mudança no backend
- O endpoint agora aceita **UUID (`organizationId`) ou apelido amigável (`organizationNickname`)** no payload; pelo menos um deve ser enviado.
- As respostas de login/signup/refresh incluem `organization.nickname`.
- Novos códigos de erro relevantes:  
  - `E_AUTH_ORGANIZATION_NOT_FOUND` (404) — apelido inexistente.  
  - `E_AUTH_ORGANIZATION_MISMATCH` (400) — UUID e apelido apontam para registros diferentes.  
  - `E_AUTH_ORGANIZATION_REQUIRED` (400) — nenhum identificador enviado.
- Organizações podem definir/alterar apelido via `PATCH /v1/organization`.

## 2. Ajustes esperados no frontend SaaS

### 2.1 Interface de login
- Substituir o campo “ID da organização” por um seletor amigável:
  - Opção A: campo de texto “Apelido da organização” com autocomplete.  
  - Opção B: dropdown preenchido com a lista de organizações do usuário (ver seção 2.2) e fallback para inserir apelido manualmente.
- Manter compatibilidade para quem ainda utiliza UUID (ex.: permitir colagem do valor no mesmo campo; backend aceita ambos).
- Validar client-side: impedir submissão quando o campo estiver vazio.

### 2.2 Recuperação da lista de organizações
- Após autenticação inicial (ex.: signup concluído ou sessão armazenada), chamar `GET /v1/organization` para obter o apelido atual do tenant logado.
- Se implementarmos “lembrar organizações recentes”, persistir `{ id, name, nickname }` no storage seguro para preencher o seletor rapidamente.
- Caso tenhamos fluxo multi-org para um mesmo usuário, criar endpoint dedicado (ou usar contratos futuros) para listar todas as organizações disponíveis; até lá, podemos manter input livre e confiar na validação do backend.

### 2.3 Payload enviado ao backend
- Priorizar envio de `organizationNickname` quando disponível.  
  ```ts
  interface LoginPayload {
    email: string;
    password: string;
    organizationNickname?: string;
    organizationId?: string; // opcional, apenas para compatibilidade
  }
  ```
- Em cenários de fallback (ex.: apelido removido), permitir que o usuário cole o UUID e envie somente `organizationId`.

### 2.4 Tratamento das respostas
- Atualizar tipos/interfaces para incluir `organization.nickname: string | null`.
- Exibir o apelido em áreas de profile/contexto (ex.: header, troca rápida de organização) e ajustar caches.
- Ao persistir dados em storage, guardar `{ id, name, nickname, tz, currency, locale }`.

### 2.5 Tratamento de erros
- Mapear novos códigos e apresentar mensagens adequadas:
  - `E_AUTH_ORGANIZATION_NOT_FOUND`: “Não encontramos a organização para esse apelido. Confira ou peça acesso ao administrador.”
  - `E_AUTH_ORGANIZATION_MISMATCH`: “UUID e apelido apontam para organizações diferentes. Ajuste seus dados e tente novamente.”
  - `E_AUTH_ORGANIZATION_REQUIRED`: “Informe o apelido ou selecione uma organização antes de continuar.”
- Manter mensagens existentes para `E_AUTH_INVALID_CREDENTIALS` e demais erros de sessão.

## 3. Atualizações em outros fluxos
- **Signup**: adicionar campo opcional para definir o apelido já no wizard inicial (caso o backend habilite via payload `organization.nickname`). Validar disponibilidade antes de concluir (erro 409 padrão do backend).
- **Gerenciamento de organização** (`/settings`): incluir seção para visualizar e editar o apelido (chamada `PATCH /v1/organization` com `{ nickname: string | null }`).
- **Redirecionamentos/onboarding**: se houver deep link que carregue `organizationId`, aceitar também `organizationNickname` como parâmetro de rota/query.

## 4. Testes recomendados
1. Login com apelido válido → sucesso, tokens armazenados, apelido exibido.
2. Login com apelido inexistente → mensagem de erro (`E_AUTH_ORGANIZATION_NOT_FOUND`).
3. Login colando UUID antigo → fluxo continua funcionando.
4. Signup → definir apelido e validar que aparece no header após login automático.
5. Troca de apelido via settings → saída e novo login utilizando o apelido atualizado.
6. Cenário offline/lembrar preferências → apelido recuperado do storage e autopreenchido.

## 5. Checklist para merge
- [ ] Integração com API atualizada (`organizationNickname` no payload).
- [ ] Ajustes nos estados/armazenamento local incluindo o novo campo no objeto `organization`.
- [ ] UI revisada (placeholder, labels, mensagens).
- [ ] Traduções/i18n atualizadas (caso o projeto suporte múltiplos idiomas).
- [ ] Suíte de testes (unitários + E2E) cobrindo cenários positivos/negativos listados.
- [ ] Documentação interna e notas de release atualizadas para o time de suporte.

Em caso de dúvida, consultar a especificação atualizada em `/docs` (Swagger) ou procurar o time backend para validar fluxos específicos.
