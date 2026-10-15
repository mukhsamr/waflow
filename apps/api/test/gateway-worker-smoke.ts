import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
if ('Bun' in globalThis) { const child = spawnSync('node', [import.meta.filename], { stdio: 'inherit' }); process.exit(child.status ?? 1); }
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac, createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(require.resolve('miniflare', { paths: [require.resolve('wrangler/package.json')] })).href);
let secret = '';
const received: { event: string; eventId: string; data: Record<string,unknown> }[] = [];
const mf = new Miniflare(convertV4MiniflareOptions({
 unsafeInspectDurableObjects: true, name: 'conversation-test', modules: true, scriptPath: new URL('../dist/index.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
 compatibilityDate: '2026-10-02', compatibilityFlags: ['nodejs_compat'],
 bindings: { ADMIN_EMAIL: 'test@example.test', ADMIN_PASSWORD: 'local-test', SESSION_SECRET: 'local-conversation-test-secret'.repeat(3) },
 d1Databases: { DB: 'conversation-test' }, durableObjects: { WA_SESSIONS: { className: 'WaSession', useSQLite: true } },
 queueProducers: { INCOMING_QUEUE: 'incoming-test', OUTGOING_QUEUE: 'outgoing-test' },
 queueConsumers: { 'incoming-test': { maxBatchSize: 1, maxBatchTimeout: 0 }, 'outgoing-test': { maxBatchSize: 1, maxBatchTimeout: 0 } },
 outboundService: async (request: Request) => {
  assert.equal(request.url,'https://93.184.216.34/hook','Unexpected external request, WhatsApp must never be contacted');
  const body = await request.text(), timestamp = request.headers.get('X-Waflow-Timestamp');
  assert.equal(request.headers.get('X-Waflow-Signature'),`sha256=${createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')}`);
  received.push(JSON.parse(body)); return new Response(null,{status:204});
 }
}));
try {
 const db = await mf.getD1Database('DB');
 await db.exec('CREATE TABLE wa_sessions (id TEXT PRIMARY KEY, name TEXT, created_by TEXT, created_at INTEGER)');
 for (const file of ['0005_messages.sql', '0006_webhooks.sql', '0007_conversations.sql', '0008_gateway_events.sql']) {
  for (const statement of (await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).split(';').filter(x => x.trim())) await db.prepare(statement).run();
 }
 await db.exec("INSERT INTO wa_sessions VALUES ('test', 'Test', 'env-owner', 0), ('other', 'Other', 'env-owner', 0)");
 const payload = `${Date.now() + 60_000}:test@example.test`;
 const token = `${payload}.${createHmac('sha256', 'local-conversation-test-secret'.repeat(3)).update(payload).digest('base64url')}`;
 const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
 const response = await mf.dispatchFetch('http://local/sessions', { headers });
 assert.equal(response.status, 200); await response.json();
 const config = await mf.dispatchFetch('http://local/webhooks/test',{method:'PUT',headers,body:JSON.stringify({url:'https://93.184.216.34/hook'})});
 assert.equal(config.status,200); secret=(await config.json() as {secret:string}).secret;
 const storage = await mf.unsafeGetDurableObjectStorage('conversation-test', 'WaSession', { name: 'test' });
 const pn = '628123456789@s.whatsapp.net', lid = '123456789012345@lid', otherPeer = '628999999999@s.whatsapp.net';
 await storage.exec('INSERT INTO auth VALUES (?, ?)', 'lid-mapping:628123456789', JSON.stringify('123456789012345'));
 await storage.exec('INSERT INTO auth VALUES (?, ?)', 'lid-mapping:123456789012345_reverse', JSON.stringify('628123456789'));
 const waId = createHash('sha256').update('out:test:test-out').digest('hex').slice(0, 32).toUpperCase();
 for (const [id, sid, peer, direction, nativeId] of [['in-1', 'test', lid, 'incoming', null], ['out:test:test-out', 'test', pn, 'outgoing', waId], ['different-contact', 'test', otherPeer, 'incoming', null], ['different-session', 'other', pn, 'incoming', null]]) {
  await db.prepare('INSERT INTO messages (id, session_id, jid, direction, text, status, created_at, updated_at, wa_id) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)').bind(id, sid, peer, direction, 'Controlled test', direction === 'incoming' ? 'received' : 'sent', nativeId).run();
 }
 const removed = await mf.dispatchFetch('http://local/messages/conversations?sessionId=test',{headers});
 assert.equal(removed.status,404);
 const logs = await (await mf.dispatchFetch('http://local/messages/logs?sessionId=test&status=sent',{headers})).json() as {logs: {id:string;wa_ack:number;text?:string}[]};
 assert.equal(logs.logs.length,1); assert.equal(logs.logs[0].wa_ack,0); assert.ok(!('text' in logs.logs[0]));
 const queue = await mf.getQueueProducer('INCOMING_QUEUE');
 let expectedAck = 0;
 for (const ack of [2, 3, 4, 3]) {
  expectedAck = Math.max(expectedAck, ack);
  await storage.exec('INSERT INTO receipt_outbox (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value', waId, JSON.stringify({ waId, ack, jid: lid }));
  await queue.send({ kind: 'receipt', sessionId: 'test', id: waId });
  let done = false;
  for (let i = 0; i < 100; i++) {
   if (!(await storage.exec('SELECT id FROM receipt_outbox WHERE id=?', waId)).length) { done = true; break; }
   await sleep(50);
  }
  assert.ok(done, 'Receipt must be consumed and acknowledged');
  const row = await db.prepare('SELECT wa_ack FROM messages WHERE wa_id=?').bind(waId).first();
  assert.equal(row.wa_ack, expectedAck);
 }
 assert.equal((await db.prepare('SELECT wa_ack FROM messages WHERE wa_id=?').bind(waId).first()).wa_ack, 4);
 const incoming = {id:'incoming-worker',session_id:'test',direction:'incoming',jid:pn,text:'Controlled inbound',status:'received',created_at:1,updated_at:1};
 await storage.exec('INSERT INTO incoming_outbox (id,value) VALUES (?,?)',incoming.id,JSON.stringify(incoming));
 await queue.send({kind:'incoming',sessionId:'test',id:incoming.id});
 const outgoing = await mf.getQueueProducer('OUTGOING_QUEUE');
 // Terminal row: exercises outgoing consumer publication without calling sendMessage.
 await outgoing.send({kind:'outgoing',sessionId:'test',id:'out:test:test-out'});
 assert.equal((await mf.dispatchFetch('http://local/sessions/test/logout',{method:'POST',headers})).status,200);
 for(let i=0;i<100 && received.length<6;i++) await sleep(50);
 assert.equal(received.filter(e=>e.event==='MESSAGES_UPDATE').length,3);
 assert.equal(received.filter(e=>e.event==='MESSAGES_UPSERT').length,1);
 assert.equal(received.filter(e=>e.event==='SEND_MESSAGE').length,1);
 const connection = received.find(e=>e.event==='CONNECTION_UPDATE');
 assert.equal(connection?.data.state,'logged-out');
 assert.ok(!JSON.stringify(connection).includes('qr'));
 const history = await (await mf.dispatchFetch('http://local/webhooks',{headers})).json() as {deliveries: Record<string,unknown>[]};
 assert.equal(history.deliveries.length,6);
 assert.ok(history.deliveries.every(d=>!('payload' in d)));
 const blocked = await mf.dispatchFetch('http://local/messages', { method: 'POST', headers, body: JSON.stringify({ sessionId: 'test', recipient: "628123456789", text: 'Must never send', idempotencyKey: 'test-no-send' }) });
 assert.equal(blocked.status, 409);
 console.log('Worker gateway smoke passed: metadata logs, removed chats, four signed webhook event types through D1/DO/Queues, monotonic receipts, disconnected send blocked. No WhatsApp sent.');
} finally { await mf.dispose(); }

