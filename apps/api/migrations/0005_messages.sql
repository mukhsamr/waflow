CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES wa_sessions(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
  jid TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX messages_history ON messages(created_at DESC, id DESC);
CREATE INDEX messages_session_history ON messages(session_id, created_at DESC, id DESC);
