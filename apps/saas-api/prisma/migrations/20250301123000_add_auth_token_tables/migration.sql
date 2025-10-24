-- Add supporting tables for signup and session tokens

CREATE TABLE email_verification_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_email_verification_hash
  ON email_verification_token (token_hash);

CREATE INDEX ix_email_verification_expires
  ON email_verification_token (expires_at);

CREATE TABLE password_reset_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_password_token_hash
  ON password_reset_token (token_hash);

CREATE INDEX ix_password_expires
  ON password_reset_token (expires_at);

CREATE TABLE refresh_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_refresh_token_hash
  ON refresh_token (token_hash);

CREATE INDEX ix_refresh_user
  ON refresh_token (user_id);

CREATE INDEX ix_refresh_expires
  ON refresh_token (expires_at);
