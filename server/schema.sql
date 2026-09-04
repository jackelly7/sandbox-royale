CREATE TABLE IF NOT EXISTS lastlight_rooms (
  code varchar(6) PRIMARY KEY,
  state jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS lastlight_rooms_expiry ON lastlight_rooms(expires_at);
CREATE TABLE IF NOT EXISTS lastlight_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL
);
ALTER TABLE lastlight_rooms ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE lastlight_rooms ADD COLUMN IF NOT EXISTS lease_until timestamptz NOT NULL DEFAULT '1970-01-01', ADD COLUMN IF NOT EXISTS lease_token text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS lastlight_commands (
  id bigserial PRIMARY KEY,
  code varchar(6) NOT NULL REFERENCES lastlight_rooms(code) ON DELETE CASCADE,
  player_id text NOT NULL,
  seq bigint NOT NULL,
  command jsonb NOT NULL,
  seen_at bigint NOT NULL,
  UNIQUE(code,player_id,seq)
);
CREATE INDEX IF NOT EXISTS lastlight_commands_room_id ON lastlight_commands(code,id);
