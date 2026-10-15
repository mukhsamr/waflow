import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import webhooks, { publicAddress, safeEndpoint, signature, enqueueWebhook, enqueueGatewayEvent, deliverWebhook, recoverWebhooks } from '../src/webhooks';
const db = new Database(':memory:');
db.exec('CREATE TABLE wa_sessions (id TEXT PRIMARY KEY, name TEXT)');
db.exec("INSERT INTO wa_sessions VALUES ('test', 'Test')");
for (const file of ['0005_messages.sql', '0006_webhooks.sql', '0007_conversations.sql']) db.exec(await Bun.file(new URL(`../migrations/${file}`, import.meta.url)).text());
db.exec("INSERT INTO messages (id,session_id,direction,jid,text,status,created_at,updated_at) VALUES ('legacy','test','incoming','sender','Old message','received',1,1)");
db.exec("INSERT INTO webhooks VALUES ('test','https://93.184.216.34/hook','encrypted','old-revision')");
db.exec("INSERT INTO webhook_deliveries VALUES ('legacy','test','old-revision','pending',2,503,'Receiver error',10,20)");
db.exec(await Bun.file(new URL('../migrations/0008_gateway_events.sql', import.meta.url)).text());
assert.deepEqual(db.query('SELECT * FROM webhook_deliveries').get(), {id:'legacy',session_id:'test',revision:'old-revision',status:'pending',attempts:2,http_status:503,error:'Receiver error',next_at:10,updated_at:20,event:'MESSAGES_UPSERT',payload:null});
assert.deepEqual(db.query('SELECT enabled,events FROM webhooks').get(), {enabled:1,events:'["MESSAGES_UPSERT"]'});
db.exec("DELETE FROM webhook_deliveries; DELETE FROM webhooks; DELETE FROM messages");
const jobs: unknown[] = [];
const env = { ADMIN_EMAIL: 'test@example.test', ADMIN_PASSWORD: 'test', SESSION_SECRET: 'secret'.repeat(8), DB: {
 prepare(sql: string) {
  let values: unknown[] = [];
  const s = { bind(...v: unknown[]) { values = v; return s; }, async first() { return db.prepare(sql).get(...values as never[]); }, async all() { return { results: db.prepare(sql).all(...values as never[]) }; }, async run() { return { meta: { changes: db.prepare(sql).run(...values as never[]).changes } }; } };
  return s;
 }, async batch(statements: { run(): Promise<unknown> }[]) { for (const s of statements) await s.run(); }
}, INCOMING_QUEUE: { async send(job: unknown) { jobs.push(job); } } };
const payload = `${Date.now() + 60_000}:${env.ADMIN_EMAIL}`;
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const mac = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))).toString('base64url');
const headers = { Authorization: `Bearer ${payload}.${mac}`, 'Content-Type': 'application/json' };
assert.equal((await webhooks.request('http://test/', {}, env as never)).status, 401);
for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.0.1', '192.168.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1']) assert.equal(publicAddress(ip), false, ip);
for (const url of ['http://93.184.216.34/', 'https://127.0.0.1/', 'https://0x7f000001/', 'https://localhost/', 'https://foo.internal/', 'https://user:pass@93.184.216.34/', 'https://93.184.216.34/?token=secret', 'https://[::1]/']) await assert.rejects(safeEndpoint(url));
const configure = async () => {
 const r = await webhooks.request('http://test/test', { method: 'PUT', headers, body: JSON.stringify({ url: 'https://93.184.216.34/hook' }) }, env as never);
 assert.equal(r.status, 200);
 return (await r.json() as { secret: string }).secret;
};
const secret = await configure();
assert.ok(!(JSON.stringify(await (await webhooks.request('http://test/', { headers }, env as never)).json())).includes(secret));
assert.notEqual(db.query('SELECT secret FROM webhooks').get()?.secret, secret);
const m = { id: 'event-1', session_id: 'test', direction: 'incoming', jid: 'sender', text: 'Webhook test', status: 'received', created_at: Date.now(), updated_at: Date.now() };
db.prepare('INSERT INTO messages (id,session_id,direction,jid,text,status,error,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(m.id, m.session_id, m.direction, m.jid, m.text, m.status, m.created_at, m.updated_at);
await enqueueWebhook(env as never, m as never); await enqueueWebhook(env as never, m as never);
assert.equal(jobs.length, 1);
const nativeFetch = globalThis.fetch;
let code = 503;
const ids: string[] = [];
globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
 const h = new Headers(init.headers), body = String(init.body), timestamp = h.get('X-Waflow-Timestamp')!;
 assert.equal(h.get('X-Waflow-Signature'), `sha256=${await signature(secret, timestamp, body)}`);
 const event = JSON.parse(body); assert.equal(event.version, 2); assert.equal(event.event,"MESSAGES_UPSERT"); assert.equal(event.data.text, m.text);
 ids.push(event.eventId);
 assert.equal(init.redirect, 'manual');
 return new Response('', { status: code });
}) as typeof fetch;
try {
 await Promise.all([deliverWebhook(env as never, m.id), deliverWebhook(env as never, m.id)]);
 assert.equal(db.query('SELECT status FROM webhook_deliveries').get()?.status, 'pending');
 db.exec('UPDATE webhook_deliveries SET next_at = 0');
 code = 200;
 await deliverWebhook(env as never, m.id);
 await deliverWebhook(env as never, m.id);
 assert.deepEqual(ids, [m.id, m.id]);
 assert.equal(db.query('SELECT status FROM webhook_deliveries').get()?.status, 'delivered');
 db.exec("UPDATE webhook_deliveries SET status='pending', attempts=0, next_at=0");
 code = 302; await deliverWebhook(env as never, m.id);
 assert.equal(db.query('SELECT status FROM webhook_deliveries').get()?.status, 'failed');
 db.exec("UPDATE webhook_deliveries SET status='pending', attempts=0, next_at=0");
 code = 503;
 for (let i = 0; i < 3; i++) { db.exec('UPDATE webhook_deliveries SET next_at=0'); await deliverWebhook(env as never, m.id); }
 assert.equal(db.query('SELECT attempts FROM webhook_deliveries').get()?.attempts, 3);
 assert.equal(db.query('SELECT status FROM webhook_deliveries').get()?.status, 'failed');
 db.exec("UPDATE webhook_deliveries SET status='pending', attempts=0, next_at=0");
 await configure();
 assert.equal(db.query('SELECT status FROM webhook_deliveries').get()?.status, 'cancelled');
 const bad = await webhooks.request('http://test/test',{method:'PUT',headers,body:JSON.stringify({url:'https://93.184.216.34/hook',events:['CHATS_SET']})},env as never);
 assert.equal(bad.status,400);
 const onlyConnection = await webhooks.request('http://test/test',{method:'PUT',headers,body:JSON.stringify({url:'https://93.184.216.34/hook',events:['CONNECTION_UPDATE'],enabled:true})},env as never);
 assert.equal(onlyConnection.status,200);
 const connection = {id:'connection-test',sessionId:'test',event:'CONNECTION_UPDATE',occurredAt:1,data:{state:'connected'}};
 await enqueueGatewayEvent(env as never,{...connection,id:'filtered-out',event:'SEND_MESSAGE'} as never);
 assert.equal(db.query("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE id='filtered-out'").get()?.n,0);
 await enqueueGatewayEvent(env as never,connection as never);
 await enqueueGatewayEvent(env as never,connection as never);
 assert.equal(db.query("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE id='connection-test'").get()?.n,1);
 assert.ok(!JSON.stringify(await (await webhooks.request('http://test/',{headers},env as never)).json()).includes('payload'));
 await webhooks.request('http://test/test',{method:'PUT',headers,body:JSON.stringify({url:'https://93.184.216.34/hook',events:['CONNECTION_UPDATE'],enabled:false})},env as never);
 await enqueueGatewayEvent(env as never,{...connection,id:'disabled-event'} as never);
 assert.equal(db.query("SELECT COUNT(*) AS n FROM webhook_deliveries WHERE id='disabled-event'").get()?.n,0);
 await recoverWebhooks(env as never);
 assert.equal(jobs.length, 2);
 await webhooks.request('http://test/test', { method: 'DELETE', headers }, env as never);
 assert.equal(db.query('SELECT COUNT(*) AS n FROM webhooks').get()?.n, 0);
} finally { globalThis.fetch = nativeFetch; db.close(); }
console.log('Webhook checks passed: auth, URL validation, encrypted secret, signature, stable retries, attempt limit, redirect rejection, cancellation.');


