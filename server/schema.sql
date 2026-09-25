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

-- Account IDs come only from a verified Neon Auth token. No email is stored here.
CREATE TABLE IF NOT EXISTS lastlight_accounts (
  id text PRIMARY KEY,
  name varchar(18) NOT NULL,
  preferences jsonb
);
CREATE TABLE IF NOT EXISTS lastlight_results (
  match_id uuid NOT NULL,
  account_id text NOT NULL REFERENCES lastlight_accounts(id) ON DELETE CASCADE,
  mode text NOT NULL,
  wins integer NOT NULL CHECK (wins BETWEEN 0 AND 1),
  kills integer NOT NULL CHECK (kills >= 0),
  deaths integer NOT NULL CHECK (deaths >= 0),
  completed_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, account_id)
);
CREATE INDEX IF NOT EXISTS lastlight_results_account ON lastlight_results(account_id);
-- Keep results atomic with the room update, including the legacy HTTP transport.
-- The trigger only runs when the model emits a completed round; retries cannot double count.
CREATE OR REPLACE FUNCTION lastlight_record_results() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO lastlight_results(match_id,account_id,mode,wins,kills,deaths)
  SELECT (r->>'matchId')::uuid,r->>'accountId',r->>'mode',
    (r->>'wins')::int,(r->>'kills')::int,(r->>'deaths')::int
  FROM jsonb_array_elements(COALESCE(NEW.state->'accountResults','[]'::jsonb)) r
  ON CONFLICT (match_id,account_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER lastlight_completed_round
AFTER UPDATE OF state ON lastlight_rooms
FOR EACH ROW WHEN (OLD.state->'accountResults' IS DISTINCT FROM NEW.state->'accountResults')
EXECUTE FUNCTION lastlight_record_results();
