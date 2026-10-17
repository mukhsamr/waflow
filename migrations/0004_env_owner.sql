CREATE TABLE api_keys_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
INSERT INTO api_keys_new SELECT * FROM api_keys;
DROP TABLE api_keys;
ALTER TABLE api_keys_new RENAME TO api_keys;

CREATE TABLE wa_sessions_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO wa_sessions_new SELECT * FROM wa_sessions;
DROP TABLE wa_sessions;
ALTER TABLE wa_sessions_new RENAME TO wa_sessions;

DROP TABLE auth_sessions;
DROP TABLE login_attempts;
DROP TABLE users;
