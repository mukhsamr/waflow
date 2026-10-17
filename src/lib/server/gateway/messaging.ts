import { enqueueWebhook, enqueueGatewayEvent, deliverWebhook, recoverWebhooks } from './webhooks';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { userFromToken } from './auth';
import type { WaSession } from './session';
import { whatsappMessageId } from './message-identity';

export type MessageRow = { id: string; session_id: string; direction: 'incoming' | 'outgoing'; jid: string; text: string; status: string; error: string | null; created_at: number; updated_at: number; wa_ack?: number };
export type MessageJob = { kind: 'outgoing' | 'incoming' | 'webhook' | 'receipt' | 'session-event'; id: string; sessionId: string };
export type MessagingEnv = { DB: D1Database; WA_SESSIONS: DurableObjectNamespace<WaSession>; OUTGOING_QUEUE: Queue<MessageJob>; INCOMING_QUEUE: Queue<MessageJob>; LOGIN_RATE_LIMIT: RateLimit; ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string; SESSION_SECRET?: string; ADMIN_NAME?: string };
const messaging = new Hono<{ Bindings: MessagingEnv }>();
messaging.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (!(await userFromToken(c.env, c.req.header('Authorization')))) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});
messaging.use('*', bodyLimit({ maxSize: 24 * 1024, onError: (c) => c.json({ error: 'Permintaan pesan terlalu besar.' }, 413) }));
messaging.get('/stats', async (c) => {
  const start = Math.floor((Date.now() + 7 * 60 * 60_000) / 86_400_000) * 86_400_000 - 7 * 60 * 60_000;
  const stats = await c.env.DB.prepare("SELECT COUNT(CASE WHEN created_at >= ? THEN 1 END) AS today, COUNT(CASE WHEN status IN ('queued', 'sending') THEN 1 END) AS pending, COUNT(CASE WHEN status IN ('failed', 'unknown') THEN 1 END) AS attention, COUNT(CASE WHEN direction = 'incoming' AND created_at >= ? THEN 1 END) AS incoming, COUNT(CASE WHEN direction = 'outgoing' AND status = 'sent' THEN 1 END) AS outgoing_success, COUNT(CASE WHEN direction = 'outgoing' AND status = 'failed' THEN 1 END) AS outgoing_failed, COUNT(CASE WHEN direction = 'incoming' AND status = 'received' THEN 1 END) AS incoming_success, COUNT(CASE WHEN direction = 'incoming' AND status = 'failed' THEN 1 END) AS incoming_failed FROM messages").bind(start, start).first();
  return c.json(stats);
});
messaging.get('/logs', async c => {
  const sessionId = c.req.query('sessionId') ?? '';
  const status = c.req.query('status') ?? '';
  const direction = c.req.query('direction') ?? '';
  if (direction && !['incoming', 'outgoing'].includes(direction)) return c.json({ error: 'Arah pesan tidak valid.' }, 400);
  if (status && !['queued','sending','sent','received','failed','unknown'].includes(status)) return c.json({ error: 'Status tidak valid.' }, 400);
  const before = Number(c.req.query('before') || Date.now() + 1), beforeId = c.req.query('beforeId') ?? '';
  if (!Number.isSafeInteger(before) || before < 0) return c.json({ error: 'Cursor tidak valid.' }, 400);
  const { results } = await c.env.DB.prepare(`SELECT m.id,m.session_id,s.name AS session_name,m.direction,m.jid,m.status,m.error,m.wa_id,m.wa_ack,m.created_at,m.updated_at FROM messages m JOIN wa_sessions s ON s.id=m.session_id WHERE (m.created_at < ? OR (m.created_at = ? AND m.id < ?)) ${sessionId ? 'AND m.session_id = ?' : ''} ${status ? 'AND m.status = ?' : ''} ${direction ? 'AND m.direction = ?' : ''} ORDER BY m.created_at DESC,m.id DESC LIMIT 51`).bind(before,before,beforeId,...(sessionId ? [sessionId] : []),...(status ? [status] : []),...(direction ? [direction] : [])).all<MessageRow>();
  return c.json({ logs: results.slice(0,50), next: results.length > 50 ? { before: results[49].created_at, beforeId: results[49].id } : null });
});
messaging.get('/', async (c) => {
  const sessionId = c.req.query('sessionId');
  const before = Number(c.req.query('before') || Date.now() + 1);
  const beforeId = c.req.query('beforeId') || '';
  if (!Number.isSafeInteger(before) || before < 0) return c.json({ error: 'Cursor tidak valid.' }, 400);
  const bindings = [before, before, beforeId, ...(sessionId ? [sessionId] : [])];
  const { results } = await c.env.DB.prepare(`SELECT messages.*, wa_sessions.name AS session_name FROM messages JOIN wa_sessions ON wa_sessions.id = messages.session_id WHERE (messages.created_at < ? OR (messages.created_at = ? AND messages.id < ?)) ${sessionId ? 'AND session_id = ?' : ''} ORDER BY messages.created_at DESC, messages.id DESC LIMIT 51`).bind(...bindings).all<MessageRow>();
  return c.json({ messages: results.slice(0, 50), next: results.length > 50 ? { before: results[49].created_at, beforeId: results[49].id } : null });
});
messaging.post('/', async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  const recipient = typeof body?.recipient === 'string' ? body.recipient : '';
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const key = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey : '';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId) || !/^[1-9]\d{7,14}$/.test(recipient) || !text || text.length > 4096 || !/^[a-zA-Z0-9_-]{8,64}$/.test(key)) return c.json({ error: 'Sesi, penerima, teks (maksimal 4096 karakter), atau idempotencyKey tidak valid.' }, 400);
  if (!(await c.env.DB.prepare('SELECT id FROM wa_sessions WHERE id = ?').bind(sessionId).first())) return c.json({ error: 'Sesi tidak ditemukan.' }, 404);
  const id = `out:${sessionId}:${key}`;
  const jid = `${recipient}@s.whatsapp.net`;
  const previous = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<MessageRow>();
  if (previous) {
    if (previous.jid !== jid || previous.text !== text) return c.json({ error: 'idempotencyKey telah digunakan untuk pesan lain.' }, 409);
    return c.json({ message: previous }, previous.status === 'failed' ? 503 : 200);
  }
  const stub = c.env.WA_SESSIONS.get(c.env.WA_SESSIONS.idFromName(sessionId));
  if ((await stub.status()).state !== 'connected') return c.json({ error: 'Sesi belum terhubung.' }, 409);
  const now = Date.now();
  const inserted = await c.env.DB.prepare("INSERT OR IGNORE INTO messages (id, session_id, direction, jid, text, status, created_at, updated_at, wa_id) VALUES (?, ?, 'outgoing', ?, ?, 'queued', ?, ?, ?)").bind(id, sessionId, jid, text, now, now, await whatsappMessageId(id)).run();
  if (inserted.meta.changes) {
    try { await c.env.OUTGOING_QUEUE.send({ kind: 'outgoing', id, sessionId }); }
    catch { await c.env.DB.prepare("UPDATE messages SET status = 'failed', error = 'Gagal memasukkan pesan ke antrean.', updated_at = ? WHERE id = ?").bind(Date.now(), id).run(); }
  }
  const message = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<MessageRow>();
  if (message?.jid !== jid || message.text !== text) return c.json({ error: 'idempotencyKey telah digunakan untuk pesan lain.' }, 409);
  return c.json({ message }, message.status === 'failed' ? 503 : 202);
});

export async function consumeMessages(batch: MessageBatch<MessageJob>, env: MessagingEnv): Promise<void> {
  for (const item of batch.messages) {
    try {
      const job = item.body;
      if (job.kind === 'webhook') {
        await deliverWebhook(env, job.id);
      } else if (job.kind === 'session-event') {
        const stub = env.WA_SESSIONS.get(env.WA_SESSIONS.idFromName(job.sessionId));
        const event = await stub.gatewayEvent(job.id);
        if (event) { await enqueueGatewayEvent(env,event); await stub.ackGatewayEvent(job.id); }
      } else if (job.kind === 'receipt') {
        const stub = env.WA_SESSIONS.get(env.WA_SESSIONS.idFromName(job.sessionId));
        const receipt = await stub.receipt(job.id);
        if (receipt) {
          const aliases = (await stub.peers([receipt.jid]))[receipt.jid] ?? [receipt.jid];
          if (receipt.ack === -1) {
            await env.DB.prepare(`UPDATE messages SET wa_ack = -1, status = 'failed', error = 'WhatsApp menolak pesan.', updated_at = ? WHERE session_id = ? AND wa_id = ? AND direction = 'outgoing' AND wa_ack < 3 AND jid IN (${aliases.map(() => '?').join(',')})`).bind(Date.now(), job.sessionId, receipt.waId, ...aliases).run();
          } else {
            await env.DB.prepare(`UPDATE messages SET wa_ack = MAX(wa_ack, ?), status = 'sent', error = NULL, updated_at = ? WHERE session_id = ? AND wa_id = ? AND direction = 'outgoing' AND (wa_ack != -1 OR ? >= 3) AND jid IN (${aliases.map(() => '?').join(',')})`).bind(receipt.ack, Date.now(), job.sessionId, receipt.waId, receipt.ack, ...aliases).run();
          }
          const row = await env.DB.prepare('SELECT * FROM messages WHERE session_id = ? AND wa_id = ? AND direction = ?').bind(job.sessionId, receipt.waId, 'outgoing').first<MessageRow>();
          if (row && row.wa_ack === receipt.ack) await enqueueGatewayEvent(env,{ id: `receipt:${row.id}:${receipt.ack}`, sessionId: row.session_id, event: 'MESSAGES_UPDATE', occurredAt: row.updated_at, data: { id: row.id, waId: receipt.waId, jid: row.jid, status: row.status, ack: row.wa_ack, error: row.error } });
          await stub.ackReceipt(job.id, receipt.ack);
        }
      } else if (job.kind === 'incoming') {
        const stub = env.WA_SESSIONS.get(env.WA_SESSIONS.idFromName(job.sessionId));
        const m = await stub.incomingMessage(job.id);
        if (m) {
          await env.DB.prepare('INSERT OR IGNORE INTO messages (id, session_id, direction, jid, text, status, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM wa_sessions WHERE id = ?)').bind(m.id, m.session_id, m.direction, m.jid, m.text, m.status, m.created_at, m.updated_at, m.session_id).run();
          await enqueueWebhook(env, m);
          await stub.ackIncoming(job.id);
        }
      } else {
        const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(job.id).first<MessageRow>();
        if (row && ['queued', 'sending'].includes(row.status)) {
          const stub = env.WA_SESSIONS.get(env.WA_SESSIONS.idFromName(job.sessionId));
          await env.DB.prepare("UPDATE messages SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'queued'").bind(Date.now(), row.id).run();
          const result = await stub.sendText(row.id, row.jid, row.text);
          if (result.status === 'retry' && item.attempts < 4) { item.retry({ delaySeconds: 30 * item.attempts }); continue; }
          await env.DB.prepare("UPDATE messages SET status = CASE WHEN wa_ack >= 2 THEN 'sent' WHEN wa_ack = -1 THEN 'failed' ELSE ? END, error = CASE WHEN wa_ack >= 2 THEN NULL WHEN wa_ack = -1 THEN 'WhatsApp menolak pesan.' ELSE ? END, updated_at = ? WHERE id = ?").bind(result.status === 'retry' ? 'failed' : result.status, result.error ?? null, Date.now(), row.id).run();
        }
        if (row) {
          const current = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(row.id).first<MessageRow>();
          if (current && !['queued','sending'].includes(current.status)) await enqueueGatewayEvent(env,{ id: `send:${row.id}`, sessionId: row.session_id, event: 'SEND_MESSAGE', occurredAt: current.updated_at, data: { id: row.id, jid: row.jid, status: current.status, error: current.error } });
        }
      }
      item.ack();
    } catch {
      if (item.body.kind === 'outgoing' && item.attempts >= 4) {
        try {
          await env.DB.prepare("UPDATE messages SET status = 'unknown', error = 'Pemrosesan terputus. Periksa WhatsApp sebelum mengirim lagi.', updated_at = ? WHERE id = ? AND status IN ('queued', 'sending')").bind(Date.now(), item.body.id).run();
          const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(item.body.id).first<MessageRow>();
          if (row) await enqueueGatewayEvent(env,{ id: `send:${row.id}`, sessionId: row.session_id, event: 'SEND_MESSAGE', occurredAt: row.updated_at, data: { id: row.id, jid: row.jid, status: row.status, error: row.error } });
          item.ack();
          continue;
        } catch { /* Queue retains the job through retries and the dead-letter queue. */ }
      }
      item.retry({ delaySeconds: 30 });
    }
  }
}

export async function recoverMessages(_event: ScheduledController, env: MessagingEnv): Promise<void> {
  const legacy = await env.DB.prepare("SELECT id FROM messages WHERE direction = 'outgoing' AND wa_id IS NULL LIMIT 100").all<{ id: string }>();
  for (const row of legacy.results) await env.DB.prepare('UPDATE messages SET wa_id = ? WHERE id = ? AND wa_id IS NULL').bind(await whatsappMessageId(row.id), row.id).run();
  await recoverWebhooks(env);
  const { results } = await env.DB.prepare("SELECT id, session_id FROM messages WHERE status IN ('queued', 'sending') AND updated_at < ? LIMIT 100").bind(Date.now() - 5 * 60_000).all<{ id: string; session_id: string }>();
  for (const row of results) await env.OUTGOING_QUEUE.send({ kind: 'outgoing', id: row.id, sessionId: row.session_id });
}
export default messaging;

