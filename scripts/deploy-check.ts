import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const config = JSON.parse(read('wrangler.jsonc'));
const pkg = JSON.parse(read('package.json'));
const apiPackage = JSON.parse(read('apps/api/package.json'));
const dashboard = JSON.parse(read('apps/dashboard/wrangler.jsonc'));

assert.equal(config.account_id, undefined, 'Installer must use the installing account');
assert.equal(config.d1_databases[0].database_id, '00000000-0000-0000-0000-000000000000');
for (const path of [config.main, config.alias.ws, config.d1_databases[0].migrations_dir]) {
  assert.ok(existsSync(resolve(root, path)), `Missing installer path: ${path}`);
}
assert.ok(readdirSync(resolve(root, config.d1_databases[0].migrations_dir)).includes('0008_gateway_events.sql'));
assert.equal(config.durable_objects.bindings[0].class_name, 'WaSession');
assert.ok(config.migrations[0].new_sqlite_classes.includes('WaSession'));
assert.deepEqual(config.queues.producers.map((entry: { queue: string }) => entry.queue).sort(),
  config.queues.consumers.map((entry: { queue: string }) => entry.queue).sort());
assert.equal(new Set(config.queues.consumers.map((entry: { dead_letter_queue: string }) => entry.dead_letter_queue)).size, 2);
for (const path of ['wrangler.jsonc', 'apps/api/wrangler.jsonc', 'apps/api/wrangler.example.jsonc']) {
  const api = JSON.parse(read(path));
  assert.equal(api.name, 'waflow-api', path);
  assert.equal(api.d1_databases[0].database_name, 'waflow-db', path);
  for (const bucket of api.r2_buckets ?? []) assert.equal(bucket.bucket_name, 'waflow-media', path);
  const { queues } = api;
  assert.deepEqual(queues.producers.map((entry: { queue: string }) => entry.queue).sort(),
    ['waflow-incoming', 'waflow-outgoing'], path);
  assert.deepEqual(queues.consumers.map((entry: { queue: string }) => entry.queue).sort(),
    ['waflow-incoming', 'waflow-outgoing'], path);
  assert.deepEqual(queues.consumers.map((entry: { dead_letter_queue: string }) => entry.dead_letter_queue).sort(),
    ['waflow-incoming-failed', 'waflow-outgoing-failed'], path);
}
assert.equal(pkg.scripts.deploy, 'bun run --cwd apps/api deploy:install');
assert.equal(apiPackage.scripts['deploy:install'], 'bun ../../scripts/deploy-api.ts');
assert.equal(config.vars.ADMIN_EMAIL, '');
assert.equal(config.vars.ADMIN_NAME, 'Operator');
assert.deepEqual(config.secrets.required, ['ADMIN_PASSWORD']);
assert.equal(pkg.cloudflare, undefined);
assert.deepEqual(read('.dev.vars.example').trim().split(/\r?\n/).map((line) => line.split('=')),
  config.secrets.required.map((name: string) => [name, '']));
assert.equal(dashboard.account_id, undefined);
assert.equal(dashboard.name, 'waflow-dashboard');
assert.equal(JSON.parse(read('apps/dashboard/wrangler.example.jsonc')).name, dashboard.name);
assert.ok(Object.hasOwn(dashboard.vars, 'API_URL'));
assert.ok(read('.gitignore').split(/\r?\n/).includes('.dev.vars'));

const readme = read('README.md');
const badge = readme.match(/\[!\[Deploy to Cloudflare\]\(https:\/\/deploy\.workers\.cloudflare\.com\/button\)\]\(([^)]+)\)/);
assert.ok(badge, 'README must include the official deploy button');
const url = new URL(badge[1]);
assert.equal(url.origin, 'https://deploy.workers.cloudflare.com');
assert.equal(url.searchParams.get('url'), 'https://github.com/mukhsamr/waflow');
assert.ok(readme.includes('repository harus **public**'));
assert.ok(readme.includes('bun run deploy:dashboard'));
console.log('Deploy configuration, migrations, secrets, and README button checks passed.');
