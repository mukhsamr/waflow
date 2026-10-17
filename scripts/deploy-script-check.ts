import assert from 'node:assert/strict';
import { deployApp } from './deploy';
import { ensureLocalSecret } from './dev';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const calls: { args: string[]; input?: string }[] = [];
await deployApp(async (args, input) => {
  calls.push({ args, input });
  return args[1] === 'list' ? '[{"name":"ADMIN_PASSWORD"}]' : '';
});
assert.deepEqual(calls.map(call => call.args), [
  ['secret', 'list', '--format', 'json'], ['secret', 'put', 'SESSION_SECRET'],
  ['d1', 'migrations', 'apply', 'DB', '--remote'], ['deploy']
]);
assert.match(calls[1].input!, /^[a-f0-9]{64}$/);
assert.equal(calls.filter(call => call.input !== undefined).length, 1);

calls.length = 0;
await deployApp(async (args, input) => {
  calls.push({ args, input });
  return args[1] === 'list' ? '[{"name":"SESSION_SECRET"}]' : '';
});
assert.ok(!calls.some(call => call.args[1] === 'put'), 'Redeploy must preserve the existing secret');

for (const result of ['null', '{}', '[{}]', 'invalid json']) {
  let count = 0;
  await assert.rejects(deployApp(async () => { count++; return result; }));
  assert.equal(count, 1, 'Invalid secret list must stop deployment');
}
for (const failure of ['list', 'put', 'migrations']) {
  calls.length = 0;
  await assert.rejects(deployApp(async (args, input) => {
    calls.push({ args, input });
    if (args.includes(failure)) throw new Error('Cloudflare request failed');
    return args[1] === 'list' ? '[]' : '';
  }));
  assert.ok(!calls.some(call => call.args[0] === 'deploy'), 'Failed setup must stop deployment');
}
console.log('Secret generation, preservation, and deployment failure checks passed.');
const temp = mkdtempSync(join(tmpdir(), 'waflow-local-secret-'));
const varsPath = join(temp, '.dev.vars');
try {
  for (const value of ['', 'SESSION_SECRET=""\n', 'SESSION_SECRET=short\n']) {
    writeFileSync(varsPath, value);
    ensureLocalSecret(varsPath);
    const first = readFileSync(varsPath, 'utf8');
    assert.match(first, /^SESSION_SECRET=[a-f0-9]{64}$/m);
    ensureLocalSecret(varsPath);
    assert.equal(readFileSync(varsPath, 'utf8'), first);
  }
  writeFileSync(varsPath, `SESSION_SECRET="${'a'.repeat(64)}"\n`);
  const existing = readFileSync(varsPath, 'utf8');
  ensureLocalSecret(varsPath);
  assert.equal(readFileSync(varsPath, 'utf8'), existing);
} finally { unlinkSync(varsPath); rmdirSync(temp); }
console.log('Local secret initialization and preservation checks passed.');
