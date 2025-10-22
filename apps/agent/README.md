# Data Inova Agent (esqueleto)

Placeholder para o agente on-premise (Enterprise). Previsto:

- Conectores locais com credenciais read-only para DW/Data Lake.
- Jobs configuráveis por indicador (janela, filtros, agregações).
- Assinatura HMAC/mTLS com `batch_id` + `checksum` no envio.
- Atualizações seguras (roll-forward/rollback) e health/telemetria.

> Implementação completa deverá incluir CLI, scheduler e integração com pg-boss via API.
