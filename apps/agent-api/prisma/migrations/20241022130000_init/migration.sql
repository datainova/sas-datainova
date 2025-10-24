-- DataInova Agent — local datastore schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Helper function for updated_at columns
CREATE OR REPLACE FUNCTION agent_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Enumerations --------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'period_granularity') THEN
    CREATE TYPE period_granularity AS ENUM ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_state') THEN
    CREATE TYPE run_state AS ENUM ('SCHEDULED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'publish_state') THEN
    CREATE TYPE publish_state AS ENUM ('PENDING', 'OK', 'DUPLICATE', 'CONFLICT', 'ERROR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connector_type') THEN
    CREATE TYPE connector_type AS ENUM ('POSTGRES', 'SQLSERVER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity') THEN
    CREATE TYPE severity AS ENUM ('INFO', 'WARN', 'CRITICAL');
  END IF;
END;
$$;

-- Core tables ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  agent_id uuid NOT NULL UNIQUE,
  saas_base_url text NOT NULL,
  org_tz text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_config_updated ON agent_config (updated_at);

CREATE TABLE IF NOT EXISTS connector (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agent_config(id) ON DELETE CASCADE,
  name text NOT NULL,
  type connector_type NOT NULL,
  dsn_ref text NOT NULL,
  allowlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'UNKNOWN',
  last_ok_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_connector_agent_type ON connector(agent_id, type);

CREATE TABLE IF NOT EXISTS connector_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES connector(id) ON DELETE CASCADE,
  status text NOT NULL,
  rtt_ms integer,
  checked_at timestamptz NOT NULL,
  details jsonb
);

CREATE INDEX IF NOT EXISTS ix_connector_health_checked ON connector_health(connector_id, checked_at);

CREATE TABLE IF NOT EXISTS querycode (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  checksum text NOT NULL,
  sql text NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  connector_id uuid NOT NULL REFERENCES connector(id) ON DELETE RESTRICT,
  vcs_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_querycode_indicator_version UNIQUE (indicator_id, version)
);

CREATE INDEX IF NOT EXISTS ix_querycode_indicator_checksum ON querycode(indicator_id, checksum);

CREATE TABLE IF NOT EXISTS sync_indicator (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  direction text NOT NULL,
  granularity_default period_granularity NOT NULL,
  tolerance numeric(12,6),
  etag text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_segment_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES sync_indicator(id) ON DELETE CASCADE,
  allowed_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sync_segment_rule_indicator ON sync_segment_rule(indicator_id);

CREATE TABLE IF NOT EXISTS sync_target (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES sync_indicator(id) ON DELETE CASCADE,
  period_start_utc timestamptz NOT NULL,
  granularity period_granularity NOT NULL,
  segment_hash bytea,
  segment_key jsonb,
  target_value numeric(20,6) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sync_target_indicator_period ON sync_target(indicator_id, period_start_utc);

CREATE TABLE IF NOT EXISTS run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL,
  period_start_utc timestamptz NOT NULL,
  granularity period_granularity NOT NULL,
  state run_state NOT NULL DEFAULT 'SCHEDULED',
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  stats jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  querycode_id uuid REFERENCES querycode(id) ON DELETE SET NULL
) PARTITION BY RANGE (date_trunc('month', period_start_utc));

CREATE INDEX IF NOT EXISTS ix_run_indicator_period ON run(indicator_id, period_start_utc);
CREATE INDEX IF NOT EXISTS ix_run_state ON run(state);

CREATE TABLE IF NOT EXISTS run_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  period_start_utc timestamptz NOT NULL,
  granularity period_granularity NOT NULL,
  segment_key jsonb NOT NULL,
  segment_hash bytea NOT NULL,
  value numeric(20,6) NOT NULL
) PARTITION BY RANGE (date_trunc('month', period_start_utc));

CREATE INDEX IF NOT EXISTS ix_rr_run ON run_result(run_id);
CREATE INDEX IF NOT EXISTS ix_rr_segment_hash ON run_result(segment_hash);
CREATE INDEX IF NOT EXISTS ix_rr_segment_key ON run_result USING gin (segment_key jsonb_path_ops);

CREATE TABLE IF NOT EXISTS outbox_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES run(id) ON DELETE SET NULL,
  batch_id text NOT NULL,
  checksum text NOT NULL,
  state publish_state NOT NULL DEFAULT 'PENDING',
  attempt integer NOT NULL DEFAULT 0,
  last_http_status integer,
  saas_request_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT uq_outbox_batch_id_checksum UNIQUE (batch_id, checksum)
) PARTITION BY RANGE (date_trunc('month', created_at));

CREATE INDEX IF NOT EXISTS ix_outbox_batch_state ON outbox_batch(state);

CREATE TABLE IF NOT EXISTS outbox_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_batch_id uuid NOT NULL REFERENCES outbox_batch(id) ON DELETE CASCADE,
  indicator_id uuid NOT NULL,
  period_start_utc timestamptz NOT NULL,
  granularity period_granularity NOT NULL,
  segment_key jsonb NOT NULL,
  segment_hash bytea NOT NULL,
  value numeric(20,6) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_outbox_item_batch ON outbox_item(outbox_batch_id);
CREATE INDEX IF NOT EXISTS ix_outbox_item_indicator_period ON outbox_item(indicator_id, period_start_utc);

CREATE TABLE IF NOT EXISTS validation_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  rule text NOT NULL,
  severity severity NOT NULL,
  details jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_validation_issue_run ON validation_issue(run_id);

CREATE TABLE IF NOT EXISTS audit_local (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  diff jsonb,
  request_id text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_local_entity ON audit_local(entity, entity_id);

CREATE TABLE IF NOT EXISTS kv_store (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_kv_updated ON kv_store(updated_at);

-- Triggers -----------------------------------------------------------------

CREATE TRIGGER trg_agent_config_touch_updated
  BEFORE UPDATE ON agent_config
  FOR EACH ROW EXECUTE FUNCTION agent_touch_updated_at();

CREATE TRIGGER trg_connector_touch_updated
  BEFORE UPDATE ON connector
  FOR EACH ROW EXECUTE FUNCTION agent_touch_updated_at();

CREATE TRIGGER trg_querycode_touch_updated
  BEFORE UPDATE ON querycode
  FOR EACH ROW EXECUTE FUNCTION agent_touch_updated_at();

CREATE TRIGGER trg_kv_store_touch_updated
  BEFORE UPDATE ON kv_store
  FOR EACH ROW EXECUTE FUNCTION agent_touch_updated_at();

-- Optional partitioning ----------------------------------------------------

DO $$
DECLARE
  start_month date := date_trunc('month', now())::date;
  i integer;
  from_ts timestamptz;
  to_ts timestamptz;
  run_partition text;
  result_partition text;
  outbox_partition text;
BEGIN
  FOR i IN -1..6 LOOP
    from_ts := (start_month + (i * interval '1 month'))::timestamptz;
    to_ts := (start_month + ((i + 1) * interval '1 month'))::timestamptz;

    run_partition := format('run_p%s_%s', to_char(from_ts, 'YYYY'), to_char(from_ts, 'MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF run FOR VALUES FROM (%L) TO (%L);',
      run_partition,
      from_ts,
      to_ts
    );

    result_partition := format('run_result_p%s_%s', to_char(from_ts, 'YYYY'), to_char(from_ts, 'MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF run_result FOR VALUES FROM (%L) TO (%L);',
      result_partition,
      from_ts,
      to_ts
    );

    outbox_partition := format('outbox_batch_p%s_%s', to_char(from_ts, 'YYYY'), to_char(from_ts, 'MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF outbox_batch FOR VALUES FROM (%L) TO (%L);',
      outbox_partition,
      from_ts,
      to_ts
    );
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    -- partitioning optional; ignore if parent table not set for partitioning
    NULL;
END;
$$;
