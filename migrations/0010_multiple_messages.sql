ALTER TABLE messages ADD COLUMN previous_id TEXT;
ALTER TABLE messages ADD COLUMN delay_seconds INTEGER NOT NULL DEFAULT 0;
CREATE INDEX messages_previous ON messages(previous_id);
CREATE TABLE message_batches (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES wa_sessions(id) ON DELETE CASCADE, payload TEXT NOT NULL);
