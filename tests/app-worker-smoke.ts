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
  for (const path of ['/app', '/app/sessions', '/app/messages', '/app/activity', '/app/webhooks', '/app/settings', '/app/api']) {
    const response = await mf.dispatchFetch(`http://local${path}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, `${path}: ${await response.text()}`);
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const created = await mf.dispatchFetch('http://local/api/sessions', { method: 'POST', headers, body: '{"name":"Unified Worker"}' });
  assert.equal(created.status, 201);
  const session = await created.json() as { id: string };
  const status = await mf.dispatchFetch(`http://local/api/sessions/${session.id}/status`, { headers });
  assert.equal(status.status, 200);
  assert.equal((await status.json() as { state: string }).state, 'new');
  assert.equal((await mf.dispatchFetch('http://local/api/auth/api-keys', { method: 'POST', headers, body: '{"name":"test"}' })).status, 201);
  const forged = await mf.dispatchFetch('http://local/app/settings?/key', { method: 'POST', headers: { Origin: 'https://other.example', Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=forged' });
  assert.equal(forged.status, 403);
  const scheduled = await (await mf.getWorker()).scheduled({ cron: '*/5 * * * *' });
  assert.equal(scheduled.outcome, 'ok');
  console.log('Unified Worker dashboard, assets, login, API, D1, DO, and CSRF smoke passed.');
} finally { await mf.dispose(); }
