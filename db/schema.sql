CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  picture_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Unknown device',
  platform TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id);
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  grid_style TEXT NOT NULL DEFAULT 'dots',
  camera JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS boards_user_updated_idx ON boards(user_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS board_elements (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  payload JSONB,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (board_id, element_id)
);
CREATE INDEX IF NOT EXISTS board_elements_board_live_idx ON board_elements(board_id, element_id) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS board_operations (
  sequence BIGSERIAL PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  board_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('board', 'element')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upsert', 'delete')),
  payload JSONB,
  client_sequence BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS board_operations_user_sequence_idx ON board_operations(user_id, sequence);
CREATE TABLE IF NOT EXISTS device_sync_cursors (
  device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_sequence BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS board_snapshots (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, sequence)
);
