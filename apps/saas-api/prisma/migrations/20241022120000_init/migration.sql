-- DataInova Connect — Initial schema, RLS and supporting functions

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE SCHEMA IF NOT EXISTS app;

-- Tenant context helpers ----------------------------------------------------

CREATE OR REPLACE FUNCTION app.require_tenant() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.organization_id', true)::uuid
$$;

CREATE OR REPLACE FUNCTION app.assert_tenant_set() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.organization_id', true) IS NULL THEN
    RAISE EXCEPTION 'tenant context not set' USING ERRCODE = '28000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.fail_if_no_tenant() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM app.assert_tenant_set();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.truncate_month(value timestamptz) RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('month', value)
$$;

CREATE OR REPLACE FUNCTION app.set_indicator_value_period_month() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.period_month := app.truncate_month(NEW.period_start_utc);
  RETURN NEW;
END;
$$;

-- Enumerations --------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'period_granularity') THEN
    CREATE TYPE period_granularity AS ENUM ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'indicator_direction') THEN
    CREATE TYPE indicator_direction AS ENUM ('UP', 'DOWN', 'RANGE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingest_status') THEN
    CREATE TYPE ingest_status AS ENUM ('RECEIVED', 'VALIDATED', 'MERGED', 'DUPLICATE', 'CONFLICT', 'ERROR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE alert_severity AS ENUM ('INFO', 'WARN', 'CRITICAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_status') THEN
    CREATE TYPE agent_status AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_type') THEN
    CREATE TYPE role_type AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'MEMBER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'webhook_source') THEN
    CREATE TYPE webhook_source AS ENUM ('STRIPE', 'HUBSPOT', 'INTERNAL');
  END IF;
END;
$$;

-- Core tables ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  tz           text NOT NULL,
  currency     text NOT NULL,
  locale       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_organization_created_at ON organization (created_at);

CREATE TABLE IF NOT EXISTS user_account (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  name          text NULL,
  password_hash text NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_user_created_at ON user_account (created_at);

CREATE TABLE IF NOT EXISTS user_identity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  provider   text NOT NULL,
  subject    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_identity_provider_subject UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS ix_identity_user_id ON user_identity(user_id);

CREATE TABLE IF NOT EXISTS organization_member (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  role             role_type NOT NULL DEFAULT 'MEMBER',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_member_org_user UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_member_org_role ON organization_member(organization_id, role);

CREATE TABLE IF NOT EXISTS invite (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email            citext NOT NULL,
  role             role_type NOT NULL DEFAULT 'VIEWER',
  token            text NOT NULL,
  expires_at       timestamptz NOT NULL,
  accepted_at      timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_invite_org_email UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS ix_invite_expires_at ON invite(expires_at);

CREATE TABLE IF NOT EXISTS objective (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text NULL,
  owner_id         uuid NULL REFERENCES user_account(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_objective_org_created ON objective(organization_id, created_at);

CREATE TABLE IF NOT EXISTS indicator_definition (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  objective_id          uuid NULL REFERENCES objective(id) ON DELETE SET NULL,
  code                  text NOT NULL,
  name                  text NOT NULL,
  direction             indicator_direction NOT NULL,
  granularity_default   period_granularity NOT NULL,
  tolerance             numeric(12,6) NULL,
  unit                  text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_indicator_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS ix_indicator_org_obj ON indicator_definition(organization_id, objective_id);

CREATE TABLE IF NOT EXISTS indicator_target (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  indicator_id        uuid NOT NULL REFERENCES indicator_definition(id) ON DELETE CASCADE,
  period_start_utc    timestamptz NOT NULL,
  granularity         period_granularity NOT NULL,
  segment_key         jsonb NULL,
  segment_hash        bytea NULL,
  target_value        numeric(20,6) NOT NULL,
  tolerance_override  numeric(12,6) NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_indicator_target_key UNIQUE (organization_id, indicator_id, period_start_utc, segment_hash)
);

CREATE INDEX IF NOT EXISTS ix_indicator_target_period ON indicator_target(organization_id, period_start_utc);

CREATE TABLE IF NOT EXISTS agent (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name             text NOT NULL,
  status           agent_status NOT NULL DEFAULT 'ACTIVE',
  secret_hash      text NOT NULL,
  metadata         jsonb NULL,
  last_seen_at     timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_org_status ON agent(organization_id, status);

CREATE TABLE IF NOT EXISTS ingest_batch (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  agent_id         uuid NULL REFERENCES agent(id) ON DELETE SET NULL,
  batch_id         text NOT NULL,
  checksum         text NOT NULL,
  status           ingest_status NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  merged_at        timestamptz NULL,
  error_message    text NULL,
  items_count      integer NOT NULL DEFAULT 0,
  CONSTRAINT uq_ingest_batch_id UNIQUE (organization_id, batch_id)
);

CREATE INDEX IF NOT EXISTS ix_ingest_batch_status ON ingest_batch(organization_id, status);

CREATE TABLE IF NOT EXISTS ingest_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingest_batch_id  uuid NOT NULL REFERENCES ingest_batch(id) ON DELETE CASCADE,
  indicator_id     uuid NOT NULL REFERENCES indicator_definition(id) ON DELETE CASCADE,
  period_start_utc timestamptz NOT NULL,
  granularity      period_granularity NOT NULL,
  segment_key      jsonb NOT NULL,
  segment_hash     bytea NOT NULL,
  value            numeric(20,6) NOT NULL,
  validation       jsonb NULL,
  status           ingest_status NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ingest_item_batch ON ingest_item(ingest_batch_id);
CREATE INDEX IF NOT EXISTS ix_ingest_item_indicator_period ON ingest_item(indicator_id, period_start_utc);

CREATE TABLE IF NOT EXISTS indicator_value (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  indicator_id      uuid NOT NULL REFERENCES indicator_definition(id) ON DELETE CASCADE,
  period_start_utc  timestamptz NOT NULL,
  period_month      timestamptz NOT NULL,
  granularity       period_granularity NOT NULL,
  segment_key       jsonb NOT NULL,
  segment_hash      bytea NOT NULL,
  value             numeric(20,6) NOT NULL,
  version           integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  source            text NOT NULL CHECK (source IN ('agent','saas','manual')),
  lineage_batch_id  text NULL,
  lineage_checksum  text NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_indicator_value_version UNIQUE (organization_id, indicator_id, period_start_utc, segment_hash, version)
);

CREATE TRIGGER trig_indicator_value_period_month
  BEFORE INSERT OR UPDATE ON indicator_value
  FOR EACH ROW
  EXECUTE FUNCTION app.set_indicator_value_period_month();

ALTER TABLE indicator_value
  ADD CONSTRAINT fk_indicator_value_ingest
  FOREIGN KEY (organization_id, lineage_batch_id)
  REFERENCES ingest_batch(organization_id, batch_id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  actor            text NOT NULL,
  action           text NOT NULL,
  entity           text NOT NULL,
  entity_id        uuid NULL,
  diff             jsonb NULL,
  request_id       text NULL,
  trace_id         text NULL,
  at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_org_at ON audit_log(organization_id, at);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log(entity, entity_id);

CREATE TABLE IF NOT EXISTS dq_violation (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  indicator_id     uuid NULL REFERENCES indicator_definition(id) ON DELETE SET NULL,
  period_start_utc timestamptz NULL,
  segment_hash     bytea NULL,
  rule             text NOT NULL,
  severity         alert_severity NOT NULL,
  details          jsonb NULL,
  detected_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_dq_org_indicator ON dq_violation(organization_id, indicator_id, detected_at);
CREATE INDEX IF NOT EXISTS ix_dq_rule_severity ON dq_violation(rule, severity);

CREATE TABLE IF NOT EXISTS alert_event (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  indicator_id     uuid NULL REFERENCES indicator_definition(id) ON DELETE SET NULL,
  severity         alert_severity NOT NULL,
  kind             text NOT NULL,
  message          text NOT NULL,
  context          jsonb NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_alert_org_created ON alert_event(organization_id, created_at);

CREATE TABLE IF NOT EXISTS checkin (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  indicator_id     uuid NULL REFERENCES indicator_definition(id) ON DELETE SET NULL,
  note             text NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_checkin_org_created ON checkin(organization_id, created_at);

CREATE TABLE IF NOT EXISTS stripe_customer (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL UNIQUE REFERENCES organization(id) ON DELETE CASCADE,
  customer_id      text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_event (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NULL REFERENCES organization(id) ON DELETE SET NULL,
  source           webhook_source NOT NULL,
  external_id      text NOT NULL,
  payload          jsonb NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz NULL,
  status           text NOT NULL,
  CONSTRAINT uq_webhook_source_external UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS ix_webhook_org_received ON webhook_event(organization_id, received_at);

-- Views --------------------------------------------------------------------

CREATE OR REPLACE VIEW indicator_value_latest AS
SELECT DISTINCT ON (organization_id, indicator_id, period_start_utc, segment_hash)
  organization_id,
  indicator_id,
  period_start_utc,
  granularity,
  segment_key,
  segment_hash,
  value,
  version
FROM indicator_value
ORDER BY organization_id, indicator_id, period_start_utc, segment_hash, version DESC;

-- RLS policies -------------------------------------------------------------

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
CREATE POLICY org_self ON organization
  USING (id = app.require_tenant())
  WITH CHECK (id = app.require_tenant());

ALTER TABLE organization_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_member FORCE ROW LEVEL SECURITY;
CREATE POLICY member_tenant ON organization_member
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite FORCE ROW LEVEL SECURITY;
CREATE POLICY invite_tenant ON invite
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE objective ENABLE ROW LEVEL SECURITY;
ALTER TABLE objective FORCE ROW LEVEL SECURITY;
CREATE POLICY objective_tenant ON objective
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE indicator_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_definition FORCE ROW LEVEL SECURITY;
CREATE POLICY indicator_tenant ON indicator_definition
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE indicator_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_target FORCE ROW LEVEL SECURITY;
CREATE POLICY indicator_target_tenant ON indicator_target
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE indicator_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_value FORCE ROW LEVEL SECURITY;
CREATE POLICY indicator_value_tenant ON indicator_value
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE agent ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_tenant ON agent
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE ingest_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_batch FORCE ROW LEVEL SECURITY;
CREATE POLICY ingest_batch_tenant ON ingest_batch
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE ingest_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_item FORCE ROW LEVEL SECURITY;
CREATE POLICY ingest_item_tenant ON ingest_item
  USING (
    EXISTS (
      SELECT 1
      FROM ingest_batch b
      WHERE b.id = ingest_batch_id
        AND b.organization_id = app.require_tenant()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM ingest_batch b
      WHERE b.id = ingest_batch_id
        AND b.organization_id = app.require_tenant()
    )
  );

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read_tenant ON audit_log
  FOR SELECT
  USING (organization_id = app.require_tenant());
CREATE POLICY audit_write_tenant ON audit_log
  FOR INSERT
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE dq_violation ENABLE ROW LEVEL SECURITY;
ALTER TABLE dq_violation FORCE ROW LEVEL SECURITY;
CREATE POLICY dq_tenant ON dq_violation
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE alert_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_event FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_tenant ON alert_event
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE checkin ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin FORCE ROW LEVEL SECURITY;
CREATE POLICY checkin_tenant ON checkin
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE stripe_customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customer FORCE ROW LEVEL SECURITY;
CREATE POLICY stripe_tenant ON stripe_customer
  USING (organization_id = app.require_tenant())
  WITH CHECK (organization_id = app.require_tenant());

ALTER TABLE webhook_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_event FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_tenant ON webhook_event
  USING (
    organization_id IS NULL
    OR organization_id = app.require_tenant()
  )
  WITH CHECK (
    organization_id IS NULL
    OR organization_id = app.require_tenant()
  );

ALTER VIEW indicator_value_latest OWNER TO CURRENT_USER;

-- Triggers -----------------------------------------------------------------

CREATE TRIGGER trg_organization_touch_updated
  BEFORE UPDATE ON organization
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER trg_user_account_touch_updated
  BEFORE UPDATE ON user_account
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER trg_objective_touch_updated
  BEFORE UPDATE ON objective
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER trg_indicator_definition_touch_updated
  BEFORE UPDATE ON indicator_definition
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER trg_indicator_target_touch_updated
  BEFORE UPDATE ON indicator_target
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER trg_indicator_value_touch_updated
  BEFORE UPDATE ON indicator_value
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Fail-fast guard when tenant context missing
CREATE TRIGGER trg_indicator_value_guard
  BEFORE INSERT OR UPDATE ON indicator_value
  FOR EACH ROW EXECUTE FUNCTION app.fail_if_no_tenant();

CREATE TRIGGER trg_indicator_target_guard
  BEFORE INSERT OR UPDATE ON indicator_target
  FOR EACH ROW EXECUTE FUNCTION app.fail_if_no_tenant();

CREATE TRIGGER trg_ingest_batch_guard
  BEFORE INSERT OR UPDATE ON ingest_batch
  FOR EACH ROW EXECUTE FUNCTION app.fail_if_no_tenant();

CREATE TRIGGER trg_ingest_item_guard
  BEFORE INSERT OR UPDATE ON ingest_item
  FOR EACH ROW EXECUTE FUNCTION app.fail_if_no_tenant();

CREATE TRIGGER trg_alert_event_guard
  BEFORE INSERT OR UPDATE ON alert_event
  FOR EACH ROW EXECUTE FUNCTION app.fail_if_no_tenant();

CREATE TRIGGER trg_dq_violation_guard
  BEFORE INSERT OR UPDATE ON dq_violation
  FOR EACH ROW EXECUTE FUNCTION app.fail_if_no_tenant();
