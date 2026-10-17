import assert from 'node:assert/strict';
import { plugin } from 'bun';
import { Database } from 'bun:sqlite';

// Run with Bun; production continues to use the real Worker and DO bindings.
plugin({ name: 'worker-test', setup(builder) {
  builder.module('cloudflare:workers', () => ({ contents: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }', loader: 'js' }));
} });
const { WaSession } = await import('../src/lib/server/gateway/session');
const { proto } = await import('@whiskeysockets/baileys');
const bufferPrototype = Buffer.prototype as unknown as { utf8Write: (value: string, offset: number, length?: number) => number };
const nativeUtf8Write = bufferPrototype.utf8Write;
bufferPrototype.utf8Write = function (value, offset, length) {
  if (length === undefined) throw new RangeError('Worker requires an explicit UTF-8 write length');
  return nativeUtf8Write.call(this, value, offset, length);
};
try {
  const text = 'Uji pesan panjang dan Unicode: 😀 العربية Indonesia '.repeat(3);
  assert.equal(proto.Message.decode(proto.Message.encode({ conversation: text }).finish()).conversation, text);
} finally { bufferPrototype.utf8Write = nativeUtf8Write; }
const db = new Database(':memory:');
let alarmAt: number | null = null;
const ctx = {
  id: { toString: () => 'test-object' },
  storage: {
    sql: { exec: (sql: string, ...values: (string | number)[]) => {
      const statement = db.prepare(sql);
      return { toArray: () => statement.all(...values) };
    } },
    transactionSync: (operation: () => void) => db.transaction(operation)(),
    setAlarm: async (at: number) => { alarmAt = at; }, deleteAlarm: async () => { alarmAt = null; }
  },
  waitUntil: (promise: Promise<unknown>) => { void promise; }
};
// Match SQL exec's immediate execution semantics, including statements without toArray().
ctx.storage.sql.exec = (sql: string, ...values: (string | number)[]) => {
  const statement = db.prepare(sql);
  if (/^SELECT/i.test(sql)) return { toArray: () => statement.all(...values) };
  statement.run(...values);
  return { toArray: () => [] };
};
let queued = 0;
let publishFailed = false;
const session = new WaSession(ctx as unknown as DurableObjectState, { INCOMING_QUEUE: { send: async () => {
  if (publishFailed) throw new Error('Queue temporarily unavailable');
  queued++;
} } as unknown as Queue });
const state = session as unknown as { socket: unknown; setState: (value: string) => void; flushIncoming: () => Promise<void>; stopConnectionAlarm: () => Promise<void> };
const logged: unknown[] = [];
const originalInfo = console.info;
try {
  console.info = (entry) => { logged.push(entry); };
  (session as unknown as { logConnection: (event: string, details: Record<string, unknown>) => void }).logConnection('connection-update', { disconnectCode: 401, registered: false });
  assert.deepEqual(logged, [{ component: 'wa-session', objectId: 'test-object', event: 'connection-update', generation: 0, disconnectCode: 401, registered: false }]);
} finally { console.info = originalInfo; }
state.setState('connected');
let sent = 0;
state.socket = { sendMessage: async () => { sent++; await Promise.resolve(); } };
const [first, duplicate] = await Promise.all([session.sendText('same-message', '628123456789@s.whatsapp.net', 'test'), session.sendText('same-message', '628123456789@s.whatsapp.net', 'test')]);
assert.equal(sent, 1);
assert.equal(first.status, 'sent');
assert.equal(duplicate.status, 'sent');
assert.equal((await session.sendText('same-message', '628123456789@s.whatsapp.net', 'test')).status, 'sent');
assert.equal(sent, 1);
state.socket = { sendMessage: async () => { sent++; throw new Error('Transport interrupted'); } };
assert.equal((await session.sendText('uncertain', '628123456789@s.whatsapp.net', 'test')).status, 'unknown');
assert.equal((await session.sendText('uncertain', '628123456789@s.whatsapp.net', 'test')).status, 'unknown');
assert.equal(sent, 2);
ctx.storage.sql.exec("INSERT INTO sent_messages (id, status) VALUES ('interrupted', 'sending')");
assert.equal((await session.sendText('interrupted', '628123456789@s.whatsapp.net', 'test')).status, 'unknown');
assert.equal(sent, 2);
ctx.storage.sql.exec('INSERT INTO incoming_outbox (id, value) VALUES (?, ?)', 'in-test', JSON.stringify({ id: 'in-test', session_id: 'test-session' }));
publishFailed = true;
await assert.rejects(state.flushIncoming());
assert.equal((await session.incomingMessage('in-test'))?.id, 'in-test');
publishFailed = false;
await state.flushIncoming();
assert.equal(queued, 1);
assert.equal(db.query('SELECT COUNT(*) AS count FROM incoming_outbox').get()?.count, 1);
await state.stopConnectionAlarm();
assert.ok(alarmAt !== null && alarmAt > Date.now());
await state.flushIncoming();
assert.equal(queued, 1);
await session.ackIncoming('in-test');
assert.equal(await session.incomingMessage('in-test'), null);
await state.stopConnectionAlarm();
assert.equal(alarmAt, null);
console.log('Messaging check passed: concurrent dedup, persisted outcomes, interrupted sends, incoming outbox.');

const { default: messaging, consumeMessages } = await import('../src/lib/server/gateway/messaging');
db.exec('CREATE TABLE wa_sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
db.exec("INSERT INTO wa_sessions VALUES ('test-session', 'Test')");
db.exec(await Bun.file(new URL('../migrations/0005_messages.sql', import.meta.url)).text());
db.exec(await Bun.file(new URL('../migrations/0006_webhooks.sql', import.meta.url)).text());
db.exec(await Bun.file(new URL('../migrations/0007_conversations.sql', import.meta.url)).text());
db.exec(await Bun.file(new URL('../migrations/0008_gateway_events.sql', import.meta.url)).text());
const env = {
  ADMIN_EMAIL: 'test@example.test', ADMIN_PASSWORD: 'local', SESSION_SECRET: 'test-secret-'.repeat(4),
  DB: { prepare: (sql: string) => {
    let bindings: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => { bindings = values; return statement; },
      first: async () => db.prepare(sql).get(...bindings as never[]),
      all: async () => ({ results: db.prepare(sql).all(...bindings as never[]) }),
      run: async () => ({ meta: { changes: db.prepare(sql).run(...bindings as never[]).changes } })
    };
    return statement;
  } }
};
const payload = `${Date.now() + 60_000}:${env.ADMIN_EMAIL}`;
const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const signature = Buffer.from(await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(payload))).toString('base64url');
const headers = { Authorization: `Bearer ${payload}.${signature}`, 'Content-Type': 'application/json' };
assert.equal((await messaging.request('http://test/', {}, env)).status, 401);
assert.equal((await messaging.request('http://test/', { method: 'POST', headers, body: '{}' }, env)).status, 400);
const incoming = { id: 'in:test', session_id: 'test-session', direction: 'incoming', jid: '628123456789@s.whatsapp.net', text: 'inbound', status: 'received', created_at: 1234, updated_at: 1234 };
let acked = 0;
const item = { body: { kind: 'incoming', id: incoming.id, sessionId: incoming.session_id }, ack: () => { acked++; }, retry: () => { throw new Error('Unexpected retry'); } };
let saved = false;
const incomingEnv = { ...env, WA_SESSIONS: { idFromName: (id: string) => id, get: () => ({ incomingMessage: async () => incoming, ackIncoming: async () => {
  assert.equal((db.query('SELECT COUNT(*) AS count FROM messages').get() as { count: number }).count, 1);
  saved = true;
} }) } };
let retried = false;
await consumeMessages({ messages: [{ ...item, retry: () => { retried = true; } }] } as never, { ...incomingEnv, DB: { prepare: () => { throw new Error('D1 temporarily unavailable'); } } } as never);
assert.equal(retried, true);
assert.equal(saved, false);
assert.equal(acked, 0);
await consumeMessages({ messages: [item, item] } as never, incomingEnv as never);
assert.equal(saved, true);
assert.equal(acked, 2);
assert.equal((db.query('SELECT COUNT(*) AS count FROM messages').get() as { count: number }).count, 1);
for (let i = 0; i < 55; i++) db.prepare("INSERT INTO messages (id, session_id, direction, jid, text, status, created_at, updated_at) VALUES (?, 'test-session', 'incoming', 'test', 'test', 'received', 1234, 1234)").run(`tie:${String(i).padStart(2, '0')}`);
const page1 = await (await messaging.request('http://test/', { headers }, env)).json();
const page2 = await (await messaging.request(`http://test/?before=${page1.next.before}&beforeId=${encodeURIComponent(page1.next.beforeId)}`, { headers }, env)).json();
assert.equal(new Set([...page1.messages, ...page2.messages].map((message: { id: string }) => message.id)).size, 56);
console.log('API check passed: authorization, validation, incoming dedup, pagination with equal timestamps.');
// Conversation isolation, proven PN/LID aliases, and monotonic native receipts.
const { whatsappMessageId } = await import('../src/lib/server/gateway/message-identity');
const pn = '628123456789@s.whatsapp.net', lid = '123456789012345@lid';
ctx.storage.sql.exec('INSERT INTO auth VALUES (?, ?)', 'lid-mapping:628123456789', JSON.stringify('123456789012345'));
ctx.storage.sql.exec('INSERT INTO auth VALUES (?, ?)', 'lid-mapping:123456789012345_reverse', JSON.stringify('628123456789'));
assert.deepEqual((await session.peers([pn, lid]))[lid], [pn, lid]);
assert.deepEqual((await session.peers(['55555555555555@lid']))['55555555555555@lid'], ['55555555555555@lid']);
const waId = await whatsappMessageId('out:test-session:receipt-test');
db.prepare("INSERT INTO messages (id, session_id, direction, jid, text, status, created_at, updated_at, wa_id) VALUES ('out:test-session:receipt-test', 'test-session', 'outgoing', ?, 'reply', 'unknown', 1234, 1234, ?)").run(pn, waId);
db.prepare("INSERT INTO messages (id, session_id, direction, jid, text, status, created_at, updated_at) VALUES ('lid-in', 'test-session', 'incoming', ?, 'same contact', 'received', 1234, 1234)").run(lid);
db.exec("INSERT INTO wa_sessions VALUES ('other-session', 'Other')");
db.prepare("INSERT INTO messages (id, session_id, direction, jid, text, status, created_at, updated_at) VALUES ('other-session-in', 'other-session', 'incoming', ?, 'not this session', 'received', 1234, 1234)").run(pn);
const peerEnv = { ...env, WA_SESSIONS: { idFromName: (id: string) => id, get: () => session } };
const logResponse = await messaging.request('http://test/logs?sessionId=test-session&status=unknown', { headers }, peerEnv as never);
const logBody = await logResponse.json();
assert.equal(logResponse.status,200);
assert.equal(logBody.logs.length,1);
assert.equal(logBody.logs[0].id,'out:test-session:receipt-test');
assert.ok(!('text' in logBody.logs[0]));
assert.equal((await messaging.request('http://test/conversations?sessionId=test-session',{headers},peerEnv as never)).status,404);
await session.identify('test-session');
ctx.storage.sql.exec('INSERT INTO receipt_outbox VALUES (?, ?)', waId, JSON.stringify({ waId, jid: lid, ack: 4 }));
const receiptItem = { body: { kind: 'receipt', sessionId: 'test-session', id: waId }, ack: () => {}, retry: () => { throw new Error('Receipt failed'); } };
await consumeMessages({ messages: [receiptItem] } as never, peerEnv as never);
assert.equal(db.query("SELECT wa_ack FROM messages WHERE id='out:test-session:receipt-test'").get()?.wa_ack, 4);
assert.equal(await session.receipt(waId), null);
ctx.storage.sql.exec('INSERT INTO receipt_outbox VALUES (?, ?)', waId, JSON.stringify({ waId, jid: lid, ack: 3 }));
await consumeMessages({ messages: [receiptItem] } as never, peerEnv as never);
assert.equal(db.query("SELECT wa_ack FROM messages WHERE id='out:test-session:receipt-test'").get()?.wa_ack, 4);
ctx.storage.sql.exec('INSERT INTO receipt_outbox VALUES (?, ?)', waId, JSON.stringify({ waId, jid: lid, ack: 4 }));
await session.ackReceipt(waId, 3);
assert.equal((await session.receipt(waId))?.ack, 4);
let receiptRetry = false;
await consumeMessages({ messages: [{ ...receiptItem, retry: () => { receiptRetry = true; } }] } as never, { ...peerEnv, DB: { prepare: () => { throw new Error('D1 interrupted'); } } } as never);
assert.equal(receiptRetry, true);
assert.equal((await session.receipt(waId))?.ack, 4);
await session.ackReceipt(waId, 4);
ctx.storage.sql.exec('INSERT INTO receipt_outbox VALUES (?, ?)', waId, JSON.stringify({ waId, jid: lid, ack: -1 }));
await session.ackReceipt(waId, 2);
assert.equal((await session.receipt(waId))?.ack, -1);
await consumeMessages({ messages: [receiptItem] } as never, peerEnv as never);
assert.equal(db.query("SELECT wa_ack FROM messages WHERE id='out:test-session:receipt-test'").get()?.wa_ack, 4); // A late NACK never undoes delivered/read evidence.
db.exec("UPDATE messages SET wa_ack = 2 WHERE id='out:test-session:receipt-test'");
ctx.storage.sql.exec('INSERT INTO receipt_outbox VALUES (?, ?)', waId, JSON.stringify({ waId, jid: lid, ack: -1 }));
await consumeMessages({ messages: [receiptItem] } as never, peerEnv as never);
assert.equal(db.query("SELECT status FROM messages WHERE id='out:test-session:receipt-test'").get()?.status, 'failed');
ctx.storage.sql.exec('INSERT INTO receipt_outbox VALUES (?, ?)', waId, JSON.stringify({ waId, jid: lid, ack: 2 }));
await consumeMessages({ messages: [receiptItem] } as never, peerEnv as never);
assert.equal(db.query("SELECT wa_ack FROM messages WHERE id='out:test-session:receipt-test'").get()?.wa_ack, -1);
console.log('Gateway check passed: filtered metadata logs, removed conversations, receipt identity and persistence, no read-status downgrade.');
db.close();



