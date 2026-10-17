import assert from 'node:assert/strict';
import { deployApi } from './deploy-api';

const calls: { args: string[]; input?: string }[] = [];
await deployApi(async (args, input) => {
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
await deployApi(async (args, input) => {
  calls.push({ args, input });
  return args[1] === 'list' ? '[{"name":"SESSION_SECRET"}]' : '';
});
assert.ok(!calls.some(call => call.args[1] === 'put'), 'Redeploy must preserve the existing secret');

for (const result of ['null', '{}', '[{}]', 'invalid json']) {
  let count = 0;
  await assert.rejects(deployApi(async () => { count++; return result; }));
  assert.equal(count, 1, 'Invalid secret list must stop deployment');
}
for (const failure of ['list', 'put', 'migrations']) {
  calls.length = 0;
  await assert.rejects(deployApi(async (args, input) => {
    calls.push({ args, input });
    if (args.includes(failure)) throw new Error('Cloudflare request failed');
    return args[1] === 'list' ? '[]' : '';
  }));
  assert.ok(!calls.some(call => call.args[0] === 'deploy'), 'Failed setup must stop deployment');
}
console.log('Secret generation, preservation, and deployment failure checks passed.');
