import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { resolve4, resolve6 } from 'node:dns/promises';
import { sessionUserFromToken } from './auth';
import type { MessagingEnv, MessageRow } from './messaging';
import { webhookEvents, type GatewayEvent } from './gateway-events';

export function publicAddress(ip: string): boolean {
  if (ip.includes(':')) return /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(db8|0|10|20):/i.test(ip) && !/^2002:/i.test(ip);
  const p = ip.split('.').map(Number);
  return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
    ![0, 10, 127].includes(p[0]) && p[0] < 224 && !(p[0] === 100 && p[1] >= 64 && p[1] <= 127) &&
    !(p[0] === 169 && p[1] === 254) && !(p[0] === 172 && p[1] >= 16 && p[1] <= 31) &&
    !(p[0] === 192 && (p[1] === 168 || p[1] === 0 || p[1] === 2)) &&
    !(p[0] === 198 && [18, 19, 51].includes(p[1])) && !(p[0] === 203 && p[1] === 0);
}
export async function safeEndpoint(value: string): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || url.search || value.length > 2048) throw new Error('unsafe');
  const host = url.hostname;
  if (!/^[a-z0-9.-]+$/i.test(host) || !host.includes('.') || /\.(localhost|local|internal|test|invalid|example)$/i.test(host)) throw new Error('unsafe');
  if (/^[\d.]+$/.test(host)) { if (!publicAddress(host)) throw new Error('unsafe'); }
  else {
    const addresses = (await Promise.allSettled([resolve4(host), resolve6(host)])).flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!addresses.length || addresses.some(ip => !publicAddress(ip))) throw new Error('unsafe');
  }
  return url;
}
const encoder = new TextEncoder();
export async function signature(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)))].map(n => n.toString(16).padStart(2, '0')).join('');
}
async function secretKey(env: MessagingEnv) {
  if (!env.SESSION_SECRET) throw new Error('Missing secret');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(env.SESSION_SECRET)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(secret: string, env: MessagingEnv) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await secretKey(env), encoder.encode(secret)));
  return btoa(String.fromCharCode(...iv, ...encrypted));
}
async function decrypt(value: string, env: MessagingEnv) {
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await secretKey(env), bytes.slice(12)));
}
const webhooks = new Hono<{ Bindings: MessagingEnv }>();
webhooks.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (!(await sessionUserFromToken(c.env, c.req.header('Authorization')))) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});
webhooks.use('*', bodyLimit({ maxSize: 4096 }));
webhooks.get('/', async c => {
  const configs = await c.env.DB.prepare('SELECT w.session_id, s.name AS session_name, w.url, w.enabled, w.events FROM webhooks w JOIN wa_sessions s ON s.id = w.session_id').all<{ events: string }>();
  const deliveries = await c.env.DB.prepare('SELECT d.id,d.session_id,d.event,d.status,d.attempts,d.http_status,d.error,d.updated_at,s.name AS session_name FROM webhook_deliveries d JOIN wa_sessions s ON s.id = d.session_id ORDER BY d.updated_at DESC, d.id DESC LIMIT 50').all();
  return c.json({ configs: configs.results.map(row => ({ ...row, events: JSON.parse(row.events) })), deliveries: deliveries.results });
});
webhooks.put('/:sessionId', async c => {
  const id = c.req.param('sessionId');
  if (!(await c.env.DB.prepare('SELECT id FROM wa_sessions WHERE id = ?').bind(id).first())) return c.json({ error: 'Sesi tidak ditemukan.' }, 404);
  const body = await c.req.json().catch(() => null);
  const events = body?.events ?? [...webhookEvents];
  const enabled = body?.enabled ?? true;
  if (typeof enabled !== 'boolean' || !Array.isArray(events) || !events.length || events.length > webhookEvents.length || events.some(e => !webhookEvents.includes(e)) || new Set(events).size !== events.length) return c.json({ error: 'Pilih event webhook yang valid.' }, 400);
  let url: URL;
  try { url = await safeEndpoint(typeof body?.url === 'string' ? body.url.trim() : ''); }
  catch { return c.json({ error: 'Gunakan URL HTTPS publik tanpa query, kredensial, atau redirect.' }, 400); }
  const secret = crypto.randomUUID() + crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE webhook_deliveries SET status = 'cancelled', updated_at = ? WHERE session_id = ? AND status = 'pending'").bind(Date.now(), id),
    c.env.DB.prepare('INSERT INTO webhooks (session_id, url, secret, revision, enabled, events) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET url = excluded.url, secret = excluded.secret, revision = excluded.revision, enabled = excluded.enabled, events = excluded.events').bind(id, url.href, await encrypt(secret, c.env), crypto.randomUUID(), Number(enabled), JSON.stringify(events))
  ]);
  return c.json({ secret });
});
webhooks.delete('/:sessionId', async c => {
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE webhook_deliveries SET status = 'cancelled', updated_at = ? WHERE session_id = ? AND status = 'pending'").bind(Date.now(), c.req.param('sessionId')),
    c.env.DB.prepare('DELETE FROM webhooks WHERE session_id = ?').bind(c.req.param('sessionId'))
  ]);
  return c.json({ ok: true });
});
export async function enqueueWebhook(env: MessagingEnv, m: MessageRow) {
  await enqueueGatewayEvent(env, { id: m.id, sessionId: m.session_id, event: 'MESSAGES_UPSERT', occurredAt: m.created_at, data: { id: m.id, jid: m.jid, text: m.text } });
}
export async function enqueueGatewayEvent(env: MessagingEnv, event: GatewayEvent) {
  const body = JSON.stringify({ version: 2, eventId: event.id, event: event.event, sessionId: event.sessionId, occurredAt: new Date(event.occurredAt).toISOString(), data: event.data });
  const result = await env.DB.prepare("INSERT OR IGNORE INTO webhook_deliveries (id,session_id,revision,next_at,updated_at,event,payload) SELECT ?,session_id,revision,?,?,?,? FROM webhooks WHERE session_id = ? AND enabled = 1 AND EXISTS (SELECT 1 FROM json_each(events) WHERE value = ?)").bind(event.id, Date.now(), Date.now(), event.event, body, event.sessionId, event.event).run();
  if (result.meta.changes) await env.INCOMING_QUEUE.send({ kind: 'webhook', id: event.id, sessionId: event.sessionId });
}
export async function deliverWebhook(env: MessagingEnv, id: string) {
  const d = await env.DB.prepare("SELECT d.*, w.url, w.secret FROM webhook_deliveries d JOIN webhooks w ON w.session_id = d.session_id AND w.revision = d.revision WHERE d.id = ? AND w.enabled = 1 AND d.status = 'pending' AND d.attempts < 3 AND d.next_at <= ?").bind(id, Date.now()).first<{ session_id: string; attempts: number; url: string; secret: string; payload: string | null }>();
  if (!d) return;
  const now = Date.now();
  const claim = await env.DB.prepare("UPDATE webhook_deliveries SET attempts = attempts + 1, next_at = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND attempts = ? AND next_at <= ?").bind(now + 300_000, now, id, d.attempts, now).run();
  if (!claim.meta.changes) return;
  let httpStatus: number | null = null, error: string | null = null;
  let success = false, permanent = false;
  try {
    const url = await safeEndpoint(d.url);
    let body = d.payload;
    if (!body) {
      // Deliver queued events from before migration with their original contract.
      const m = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<MessageRow>();
      if (!m) throw new Error('missing');
      body = JSON.stringify({ version: 1, eventId: id, eventType: 'message.received', sessionId: m.session_id, occurredAt: new Date(m.created_at).toISOString(), data: { jid: m.jid, text: m.text } });
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/json', 'X-Waflow-Timestamp': timestamp, 'X-Waflow-Signature': `sha256=${await signature(await decrypt(d.secret, env), timestamp, body)}`, 'X-Waflow-Event-Id': id }, body });
    httpStatus = response.status;
    success = response.ok;
    permanent = response.status >= 300 && response.status < 500 && ![408, 429].includes(response.status);
    if (!success) error = `HTTP ${response.status}`;
    await response.body?.cancel();
  } catch { error = 'Endpoint tidak tersedia atau tidak aman.'; }
  await env.DB.prepare('UPDATE webhook_deliveries SET status = ?, http_status = ?, error = ?, next_at = ?, updated_at = ? WHERE id = ? AND status = ?').bind(success ? 'delivered' : permanent || d.attempts + 1 >= 3 ? 'failed' : 'pending', httpStatus, error, Date.now() + 60_000 * (d.attempts + 1), Date.now(), id, 'pending').run();
}
export async function recoverWebhooks(env: MessagingEnv) {
  await env.DB.prepare("UPDATE webhook_deliveries SET status = 'failed', error = 'Batas percobaan tercapai.', updated_at = ? WHERE status = 'pending' AND attempts >= 3 AND next_at <= ?").bind(Date.now(), Date.now()).run();
  const { results } = await env.DB.prepare("SELECT id, session_id FROM webhook_deliveries WHERE status = 'pending' AND next_at <= ? AND attempts < 3 LIMIT 100").bind(Date.now()).all<{ id: string; session_id: string }>();
  for (const d of results) await env.INCOMING_QUEUE.send({ kind: 'webhook', id: d.id, sessionId: d.session_id });
}
export default webhooks;

