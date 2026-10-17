import assert from 'node:assert/strict';
import { requestExample } from '../src/lib/request-example';

const text = 'Halo "NQM"\nO\'Brien $HOME `whoami`';
const result = requestExample('https://waflow.example', 'session-1', '628123456789', text, 'request-123');
assert.equal(result.url, 'https://waflow.example/api/messages');
assert.deepEqual(JSON.parse(result.body), { sessionId:'session-1', recipient:'628123456789', text, idempotencyKey:'request-123' });
assert.ok(result.curl.includes("O'\"'\"'Brien"), 'Apostrophes must not terminate the Bash argument');
assert.ok(result.curl.includes('Authorization: Bearer $API_KEY'));
assert.ok(result.curl.includes('--data-raw'));
assert.ok(!result.curl.includes('\n+'));
console.log('Request example JSON and Bash quoting passed.');
