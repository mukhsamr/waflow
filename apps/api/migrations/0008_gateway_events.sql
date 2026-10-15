ALTER TABLE webhooks ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE webhooks ADD COLUMN events TEXT NOT NULL DEFAULT '["MESSAGES_UPSERT"]';

-- Events have their own identity. Connection events do not reference a message.
CREATE TABLE gateway_deliveries (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES wa_sessions(id) ON DELETE CASCADE,
 revision TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, http_status INTEGER, error TEXT,
 next_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 event TEXT NOT NULL, payload TEXT
);
INSERT INTO gateway_deliveries (id,session_id,revision,status,attempts,http_status,error,next_at,updated_at,event)
 SELECT id,session_id,revision,status,attempts,http_status,error,next_at,updated_at,'MESSAGES_UPSERT' FROM webhook_deliveries;
DROP TABLE webhook_deliveries;
ALTER TABLE gateway_deliveries RENAME TO webhook_deliveries;
CREATE INDEX webhook_pending ON webhook_deliveries(status, next_at);
