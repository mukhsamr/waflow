export function requestExample(origin: string, sessionId: string, recipient: string, text: string, idempotencyKey: string) {
 const url = `${origin}/api/messages`;
 const body = JSON.stringify({ sessionId, recipient, text: text.trim(), idempotencyKey }, null, 2);
 const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;
 return { url, body, curl: `curl ${quote(url)} \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  --data-raw ${quote(body)}` };
}
