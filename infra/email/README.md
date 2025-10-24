# Templates de E-mail — Onboarding com Link Mágico

Os arquivos desta pasta centralizam o conteúdo HTML utilizado pela infraestrutura
de e-mail para o novo fluxo de signup assíncrono do DataInova Connect.

- `signup-magic-link.html`: mensagem enviada no primeiro pedido de acesso.
- `signup-magic-link-resent.html`: variação para reenvio manual solicitado pelo usuário.
- `signup-magic-link-expired.html`: instruções para tokens expirados com call-to-action para gerar um novo link.

Cada template disponibiliza marcadores `{{chave}}` que devem ser substituídos
pela API antes do envio (ex.: `{{magic_link}}`, `{{expires_at}}`, `{{support_contact}}`).

> Observação: os templates utilizam a tipografia e o tom de voz definidos em
> `Docs/frontend/Diretrizes de Marca.docx`, mantendo contraste AA e estilo
> minimalista alinhado ao produto.
