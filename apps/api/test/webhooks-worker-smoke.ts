import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
// Miniflare's Undici dispatcher requires its Node tooling runtime, as Wrangler does.
if ('Bun' in globalThis) { const child = spawnSync('node', [import.meta.filename], { stdio: 'inherit' }); process.exit(child.status ?? 1); }
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(require.resolve('miniflare', { paths: [require.resolve('wrangler/package.json')] })).href);
let secret = '', responseCode = 503;
const events: string[] = [];
const mf = new Miniflare(convertV4MiniflareOptions({
 modules: true, scriptPath: new URL('../dist/index.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
 compatibilityDate: '2026-10-02', compatibilityFlags: ['nodejs_compat'],
 bindings: { ADMIN_EMAIL: 'test@example.test', ADMIN_PASSWORD: 'local-test', SESSION_SECRET: 'local-webhook-test-secret'.repeat(3) },
 d1Databases: { DB: 'webhook-test' },
 durableObjects: { WA_SESSIONS: { className: 'WaSession', useSQLite: true } },
 queueProducers: { INCOMING_QUEUE: 'incoming-test', OUTGOING_QUEUE: 'outgoing-test' },
 queueConsumers: { 'incoming-test': { maxBatchSize: 1, maxBatchTimeout: 0 }, 'outgoing-test': { maxBatchSize: 1, maxBatchTimeout: 0 } },
 outboundService: async (request: Request) => {
  assert.equal(request.url, 'https://93.184.216.34/hook');
  const body = await request.text(), timestamp = request.headers.get('X-Waflow-Timestamp')!;
  assert.equal(request.headers.get('X-Waflow-Signature'), `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`);
  events.push(JSON.parse(body).eventId);
  return new Response(null, { status: responseCode });
 }
}));
try {
 const db = await mf.getD1Database('DB');
 await db.exec('CREATE TABLE wa_sessions (id TEXT PRIMARY KEY, name TEXT, created_by TEXT, created_at INTEGER)');
 for (const file of ['0005_messages.sql', '0006_webhooks.sql', '0007_conversations.sql', '0008_gateway_events.sql']) {
  const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const statement of sql.split(';').filter(x => x.trim())) await db.prepare(statement).run();
 }
 await db.prepare("INSERT INTO wa_sessions VALUES ('test', 'Test', 'env-owner', 0)").run();
 // Login uses a real rate-limit binding in production; authenticate this isolated harness with the same HMAC format.
 const payload = `${Date.now() + 60_000}:test@example.test`;
 const token = `${payload}.${createHmac('sha256', 'local-webhook-test-secret'.repeat(3)).update(payload).digest('base64url')}`;
 const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
 assert.equal((await mf.dispatchFetch('http://local/webhooks')).status, 401);
 assert.equal((await mf.dispatchFetch('http://local/webhooks/test', { method: 'PUT', headers, body: '{"url":"https://127.0.0.1/"}' })).status, 400);
 const configured = await mf.dispatchFetch('http://local/webhooks/test', { method: 'PUT', headers, body: '{"url":"https://93.184.216.34/hook"}' });
 assert.equal(configured.status, 200);
 secret = (await configured.json() as { secret: string }).secret;
 await db.prepare("INSERT INTO messages (id,session_id,direction,jid,text,status,error,created_at,updated_at) VALUES ('worker-event', 'test', 'incoming', 'test-sender', 'Controlled webhook test', 'received', NULL, 1, 1)").run();
 await db.prepare("INSERT INTO webhook_deliveries (id, session_id, revision, next_at, updated_at,event) SELECT 'worker-event', session_id, revision, 0, 0,'MESSAGES_UPSERT' FROM webhooks").run();
 const queue = await mf.getQueueProducer('INCOMING_QUEUE');
 const send = () => queue.send({ kind: 'webhook', id: 'worker-event', sessionId: 'test' });
 async function waitAttempts(n: number) {
  for (let i = 0; i < 100; i++) {
   const row = await db.prepare('SELECT * FROM webhook_deliveries').first();
   if (row?.attempts === n && (row?.status === 'delivered' || (row?.error && Number(row.next_at) < Date.now() + 240_000))) return row;
   await sleep(100);
  }
  throw new Error('Delivery did not finish');
 }
 await send();
 assert.equal((await waitAttempts(1)).status, 'pending');
 await db.prepare('UPDATE webhook_deliveries SET next_at = 0').run();
 responseCode = 204; await send();
 assert.equal((await waitAttempts(2)).status, 'delivered');
 assert.deepEqual(events, ['worker-event', 'worker-event']);
 const history = await mf.dispatchFetch('http://local/webhooks', { headers });
 const result = await history.json() as { deliveries: { status: string }[] };
 assert.equal(result.deliveries[0].status, 'delivered');
 assert.ok(!JSON.stringify(result).includes(secret));
 assert.equal((await mf.dispatchFetch('http://local/webhooks/test', { method: 'DELETE', headers })).status, 200);
 console.log('Worker webhook smoke passed: D1 configuration, Queue delivery, HMAC verified by receiver, 503 retry, stable event ID, 204 success, history, revoke.');
} finally { await mf.dispose(); }




