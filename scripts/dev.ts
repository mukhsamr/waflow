import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function ensureLocalSecret(path: string) {
  const vars = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (!/^SESSION_SECRET=(?:"[^"\r\n]{32,}"|'[^'\r\n]{32,}'|[^"'\r\n]{32,})\s*$/m.test(vars)) {
    appendFileSync(path, `\nSESSION_SECRET=${randomBytes(32).toString('hex')}\n`);
  }
}
if (import.meta.main) {
  ensureLocalSecret('.dev.vars');
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  config.main = resolve(config.main);
  config.assets.directory = resolve(config.assets.directory);
  config.alias.ws = resolve(config.alias.ws);
  for (const database of config.d1_databases) database.migrations_dir = resolve(database.migrations_dir);
  delete config.secrets;
  mkdirSync('.wrangler', { recursive: true });
  writeFileSync('.wrangler/dev.json', JSON.stringify(config));
  const child = Bun.spawn([process.execPath, 'run', 'wrangler', 'dev', '--config', '.wrangler/dev.json', '--env-file', resolve('.dev.vars'), '--persist-to', resolve('.wrangler/state'), '--port', process.argv[3] ?? '8787'], {
    stdin: 'inherit', stdout: 'inherit', stderr: 'inherit'
  });
  process.exit(await child.exited);
}
