CREATE TABLE webhooks (
 session_id TEXT PRIMARY KEY REFERENCES wa_sessions(id) ON DELETE CASCADE,
 url TEXT NOT NULL, secret TEXT NOT NULL, revision TEXT NOT NULL
);
CREATE TABLE webhook_deliveries (
 id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES wa_sessions(id) ON DELETE CASCADE,
 revision TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, http_status INTEGER, error TEXT,
 next_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX webhook_pending ON webhook_deliveries(status, next_at);
