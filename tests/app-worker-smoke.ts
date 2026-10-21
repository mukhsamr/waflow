import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
if ('Bun' in globalThis) { const child = spawnSync('node', [import.meta.filename], { stdio: 'inherit' }); process.exit(child.status ?? 1); }
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = await import(pathToFileURL(require.resolve('miniflare', { paths: [require.resolve('wrangler/package.json')] })).href);
const root = new URL('../', import.meta.url);
const mf = new Miniflare(convertV4MiniflareOptions({
  name: 'waflow-app-test', modules: true,
  scriptPath: fileURLToPath(new URL('dist/_worker.js', root)),
  compatibilityDate: '2026-10-02', compatibilityFlags: ['nodejs_compat'],
  bindings: { ADMIN_EMAIL: 'test@example.test', ADMIN_PASSWORD: 'local-test', SESSION_SECRET: 'app-test-secret'.repeat(4), ADMIN_NAME: 'Test Operator' },
  assets: { directory: fileURLToPath(new URL('.svelte-kit/cloudflare', root)), binding: 'ASSETS', routerConfig: { has_user_worker: true } },
  d1Databases: { DB: 'app-test' },
  durableObjects: { WA_SESSIONS: { className: 'WaSession', useSQLite: true } },
  ratelimits: { LOGIN_RATE_LIMIT: { namespace_id: '731042', simple: { limit: 10, period: 60 } } },
  queueProducers: { INCOMING_QUEUE: 'incoming-test', OUTGOING_QUEUE: 'outgoing-test' },
  queueConsumers: { 'incoming-test': { maxBatchSize: 1, maxBatchTimeout: 0 }, 'outgoing-test': { maxBatchSize: 1, maxBatchTimeout: 0 } },
  outboundService: () => { throw new Error('Dashboard and API must not make external requests'); }
}));
try {
  const db = await mf.getD1Database('DB');
  for (const file of (await readdir(new URL('migrations/', root))).sort()) {
    for (const statement of (await readFile(new URL(`migrations/${file}`, root), 'utf8')).split(';').filter(sql => sql.trim())) {
      await db.prepare(statement).run();
    }
  }
  assert.deepEqual(await (await mf.dispatchFetch('http://local/api/health')).json(), { ok: true, service: 'waflow' });
  assert.equal((await mf.dispatchFetch('http://local/api/sessions')).status, 401);
  assert.equal((await mf.dispatchFetch('http://local/health')).status, 404);
  const home = await mf.dispatchFetch('http://local/', { redirect: 'manual' });
  assert.equal(home.status, 303);
  const loginPage = await mf.dispatchFetch('http://local/login');
  assert.equal(loginPage.status, 200);
  const html = await loginPage.text();
  assert.ok(html.includes('name="email"') && html.includes('name="password"'));
  assert.ok(!html.includes('Cloudflare native'));
  const asset = html.match(/href="([^"\s]+\.css)"/);
  assert.ok(asset, 'Dashboard must include its CSS');
  assert.equal((await mf.dispatchFetch(new URL(asset[1], 'http://local'))).status, 200);
  for (const path of ['/_worker.js', '/_svelte.js', '/renderer.js', '/src/worker.ts']) {
    assert.equal((await mf.dispatchFetch(`http://local${path}`)).status, 404, 'Server source must not be a public asset');
  }
  const login = await mf.dispatchFetch('http://local/login', {
    method: 'POST', redirect: 'manual', headers: { Origin: 'http://local', Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '192.0.2.1' },
    body: new URLSearchParams({ email: 'test@example.test', password: 'local-test' }).toString()
  });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const token = decodeURIComponent(cookie.slice('wg_session='.length));
  for (const path of ['/app', '/app/sessions', '/app/messages', '/app/activity', '/app/webhooks', '/app/settings', '/app/api-keys', '/app/api']) {
    const response = await mf.dispatchFetch(`http://local${path}`, { headers: { Cookie: cookie } });
    const pageHtml = await response.text();
    assert.equal(response.status, 200, `${path}: ${pageHtml}`);
    assert.ok(pageHtml.includes('Buka navigasi') && pageHtml.includes('mobile-navigation'));
    assert.ok(!pageHtml.includes('Fitur bertahap') && !pageHtml.includes('Control center') && !pageHtml.includes('Notifikasi'));
    if (path === '/app/messages') assert.ok(pageHtml.includes('Single') && pageHtml.includes('Multiple') && pageHtml.includes('Kirim Pesan'));
    if (path === '/app/api-keys') assert.equal((pageHtml.match(/<a[^>]*aria-current="page"/g) ?? []).length, 1);
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const settingsHtml = await (await mf.dispatchFetch('http://local/app/settings', { headers:{Cookie:cookie} })).text();
  assert.ok(!settingsHtml.includes('Nama key') && !settingsHtml.includes('?/key'));
  const formHeaders = { Accept:'text/html', Origin:'http://local', Cookie:cookie, 'Content-Type':'application/x-www-form-urlencoded' };
  const multipleForm = await mf.dispatchFetch('http://local/app/messages?/send', {method:'POST',headers:formHeaders,body:new URLSearchParams({mode:'multiple',sessionId:'test-session',recipients:'invalid',text:'Test',delaySeconds:'5',idempotencyKey:'form-multiple-check'}).toString()});
  assert.equal(multipleForm.status,400);
  const multipleHtml = await multipleForm.text();
  assert.ok(multipleHtml.includes('Jeda antar pesan (detik)') && multipleHtml.includes('invalid') && multipleHtml.includes('1–100 nomor unik'));
  const keyPage = await mf.dispatchFetch('http://local/app/api-keys?/key', { method:'POST', headers:formHeaders, body:'name=Route+test' });
  assert.equal(keyPage.status, 200);
  const keyHtml = await keyPage.text();
  assert.ok(keyHtml.includes('Salin key sekarang'), keyHtml);
  const routeKey = await db.prepare('SELECT id FROM api_keys WHERE name = ?').bind('Route test').first<{id:string}>();
  assert.ok(routeKey);
  assert.equal((await mf.dispatchFetch('http://local/app/api-keys?/edit', {method:'POST',headers:formHeaders,body:new URLSearchParams({id:routeKey.id,name:'Renamed key'}).toString()})).status, 200);
  assert.equal((await db.prepare('SELECT name FROM api_keys WHERE id = ?').bind(routeKey.id).first<{name:string}>())?.name, 'Renamed key');
  assert.equal((await mf.dispatchFetch(`http://local/api/auth/api-keys/${routeKey.id}`, {method:'PATCH',headers,body:'{"name":" "}'})).status, 400);
  const tokenFromCreate = keyHtml.match(/<code[^>]*>([A-Za-z0-9_-]{43})<\/code>/)?.[1];
  assert.ok(tokenFromCreate);
  const rotated = await mf.dispatchFetch(`http://local/api/auth/api-keys/${routeKey.id}/rotate`, {method:'POST',headers});
  assert.equal(rotated.status, 200);
  const replacement = (await rotated.json() as {token:string}).token;
  assert.notEqual(replacement,tokenFromCreate);
  const useKey = (value:string) => mf.dispatchFetch('http://local/api/sessions',{headers:{Authorization:`Bearer ${value}`}});
  assert.equal((await useKey(tokenFromCreate)).status,401);
  assert.equal((await useKey(replacement)).status,200);
  assert.equal((await mf.dispatchFetch(`http://local/api/auth/api-keys/${routeKey.id}/rotate`, {method:'POST',headers:{Authorization:`Bearer ${replacement}`}})).status,403);
  const keyList = await (await mf.dispatchFetch('http://local/api/auth/api-keys',{headers})).text();
  assert.ok(keyList.includes(replacement.slice(-4)) && !keyList.includes(replacement) && !keyList.includes('token_hash'));
  const rotatePage = await mf.dispatchFetch('http://local/app/api-keys?/rotate', {method:'POST',headers:formHeaders,body:new URLSearchParams({id:routeKey.id}).toString()});
  assert.equal(rotatePage.status,200);
  const finalToken = (await rotatePage.text()).match(/<code[^>]*>([A-Za-z0-9_-]{43})<\/code>/)?.[1];
  assert.ok(finalToken);
  assert.equal((await useKey(replacement)).status,401);
  assert.equal((await useKey(finalToken)).status,200);
  assert.equal((await mf.dispatchFetch('http://local/app/api-keys?/revoke', { method:'POST', headers:formHeaders, body:new URLSearchParams({id:routeKey.id}).toString() })).status, 200);
  assert.equal((await useKey(replacement)).status,401);
  assert.equal((await useKey(finalToken)).status,401);
  assert.equal((await mf.dispatchFetch(`http://local/api/auth/api-keys/${routeKey.id}/rotate`,{method:'POST',headers})).status,404);
  const created = await mf.dispatchFetch('http://local/api/sessions', { method: 'POST', headers, body: '{"name":"Unified Worker"}' });
  assert.equal(created.status, 201);
  const session = await created.json() as { id: string };
  const guide = await (await mf.dispatchFetch('http://local/app/api', { headers:{Cookie:cookie} })).text();
  assert.ok(guide.includes('Generator request') && guide.includes('Unified Worker') && guide.includes('/app/api-keys'));
  assert.ok(guide.includes('Hasil request') && !guide.includes('Buat request'));
  assert.ok(guide.includes('Verifikasi signature') && guide.includes('Pengiriman'));
  const status = await mf.dispatchFetch(`http://local/api/sessions/${session.id}/status`, { headers });
  assert.equal(status.status, 200);
  assert.equal((await status.json() as { state: string }).state, 'new');
  for (const [id, direction, recipient, messageStatus] of [
    ['outgoing-history', 'outgoing', '628111111111@s.whatsapp.net', 'sent'],
    ['incoming-history', 'incoming', '628222222222@s.whatsapp.net', 'received']
  ]) {
    await db.prepare('INSERT INTO messages (id,session_id,direction,jid,text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, session.id, direction, recipient, 'Local fixture only', messageStatus, Date.now(), Date.now()).run();
  }
  const outgoing = await mf.dispatchFetch('http://local/api/messages/logs?direction=outgoing', { headers });
  const outgoingLogs = await outgoing.json() as { logs: { id: string }[] };
  assert.deepEqual(outgoingLogs.logs.map(row => row.id), ['outgoing-history']);
  assert.equal((await mf.dispatchFetch('http://local/api/messages/logs?direction=invalid', { headers })).status, 400);
  const historyHtml = await (await mf.dispatchFetch('http://local/app/messages', { headers: { Cookie: cookie } })).text();
  assert.ok(historyHtml.includes('Riwayat pengiriman') && historyHtml.includes('628111111111') && historyHtml.includes('Terkirim'));
  assert.ok(!historyHtml.includes('628222222222') && !historyHtml.includes('Permintaan diterima:'));
  for (const [id, direction, messageStatus] of [['out-failed','outgoing','failed'],['out-pending','outgoing','queued'],['out-unknown','outgoing','unknown'],['in-failed','incoming','failed']]) {
    await db.prepare('INSERT INTO messages (id,session_id,direction,jid,text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id,session.id,direction,'628333333333@s.whatsapp.net','Fixture',messageStatus,Date.now(),Date.now()).run();
  }
  const stats = await (await mf.dispatchFetch('http://local/api/messages/stats', {headers})).json() as Record<string,number>;
  assert.deepEqual([stats.outgoing_success,stats.outgoing_failed,stats.incoming_success,stats.incoming_failed],[1,1,1,1]);
  const activityHtml = await (await mf.dispatchFetch('http://local/app/activity', {headers:{Cookie:cookie}})).text();
  assert.ok(activityHtml.includes('Pesan keluar') && activityHtml.includes('Pesan masuk'));
  assert.ok(!activityHtml.includes('Tampilkan</button>') && !activityHtml.includes('<label'));
  assert.equal((await mf.dispatchFetch('http://local/api/auth/api-keys', { method: 'POST', headers, body: '{"name":"test"}' })).status, 201);
  const forged = await mf.dispatchFetch('http://local/app/api-keys?/key', { method: 'POST', headers: { Origin: 'https://other.example', Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=forged' });
  assert.equal(forged.status, 403);
  const scheduled = await (await mf.getWorker()).scheduled({ cron: '*/5 * * * *' });
  assert.equal(scheduled.outcome, 'ok');
  console.log('Unified Worker dashboard, assets, login, API, D1, DO, and CSRF smoke passed.');
} finally { await mf.dispose(); }
