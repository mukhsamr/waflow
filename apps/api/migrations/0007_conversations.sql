ALTER TABLE messages ADD COLUMN wa_id TEXT;
ALTER TABLE messages ADD COLUMN wa_ack INTEGER NOT NULL DEFAULT 0;
CREATE INDEX messages_wa_receipt ON messages(session_id, wa_id);
CREATE INDEX messages_conversation ON messages(session_id, jid, created_at DESC, id DESC);
