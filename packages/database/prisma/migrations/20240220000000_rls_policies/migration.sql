-- Enable Row Level Security and define tenant isolation policies.

-- Organizations (root scope)
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_isolate_org
  ON "Organization"
  USING (id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);

-- Tenants
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolate_org
  ON "Tenant"
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Objectives
ALTER TABLE "Objective" ENABLE ROW LEVEL SECURITY;
CREATE POLICY objective_isolate_org
  ON "Objective"
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Indicator definitions
ALTER TABLE "IndicatorDefinition" ENABLE ROW LEVEL SECURITY;
CREATE POLICY indicator_isolate_org
  ON "IndicatorDefinition"
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Indicator values
ALTER TABLE "IndicatorValue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY indicator_value_isolate_org
  ON "IndicatorValue"
  USING (
    EXISTS (
      SELECT 1
      FROM "IndicatorDefinition" i
      WHERE i.id = "IndicatorValue".indicator_id
        AND i.org_id = current_setting('app.current_org_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "IndicatorDefinition" i
      WHERE i.id = "IndicatorValue".indicator_id
        AND i.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

-- Agents
ALTER TABLE "Agent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_isolate_org
  ON "Agent"
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Agent jobs
ALTER TABLE "AgentJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_job_isolate_org
  ON "AgentJob"
  USING (
    EXISTS (
      SELECT 1
      FROM "Agent" a
      WHERE a.id = "AgentJob".agent_id
        AND a.org_id = current_setting('app.current_org_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "Agent" a
      WHERE a.id = "AgentJob".agent_id
        AND a.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

-- Data transfer batches
ALTER TABLE "DataTransferBatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_transfer_batch_isolate_org
  ON "DataTransferBatch"
  USING (
    EXISTS (
      SELECT 1
      FROM "Agent" a
      WHERE a.id = "DataTransferBatch".agent_id
        AND a.org_id = current_setting('app.current_org_id', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "Agent" a
      WHERE a.id = "DataTransferBatch".agent_id
        AND a.org_id = current_setting('app.current_org_id', true)::uuid
    )
  );

-- Checkins
ALTER TABLE "Checkin" ENABLE ROW LEVEL SECURITY;
CREATE POLICY checkin_isolate_org
  ON "Checkin"
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Alerts
ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
CREATE POLICY alert_isolate_org
  ON "Alert"
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Audit logs
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_isolate_org
  ON "AuditLog"
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- MCP logs
ALTER TABLE "McpToolInvocationLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_log_isolate_org
  ON "McpToolInvocationLog"
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- Leads
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_isolate_org
  ON "Lead"
  USING (
    (metadata ->> 'organizationId')::uuid = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.current_org_id', true) IS NULL
  )
  WITH CHECK (true);

-- Webhooks / Telemetry events
ALTER TABLE "TelemetryEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY telemetry_isolate_org
  ON "TelemetryEvent"
  USING (
    org_id IS NULL
    OR org_id = current_setting('app.current_org_id', true)::uuid
  )
  WITH CHECK (
    org_id IS NULL
    OR org_id = current_setting('app.current_org_id', true)::uuid
  );

-- Ensure default privileges revoked from public role to enforce RLS
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
