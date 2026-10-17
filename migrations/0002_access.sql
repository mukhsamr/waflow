ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('owner', 'operator'));
UPDATE users SET role = 'owner' WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX api_keys_created_by_idx ON api_keys(created_by);
