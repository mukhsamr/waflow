import { Hono } from 'hono';

type Env = { DB: D1Database; LOGIN_RATE_LIMIT: RateLimit; ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string; SESSION_SECRET?: string; ADMIN_NAME?: string };
type PublicUser = { id: string; email: string; name: string; role: 'owner' };
const encoder = new TextEncoder();
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const newToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const owner = (env: Env): PublicUser => ({ id: 'env-owner', email: env.ADMIN_EMAIL!.trim().toLowerCase(), name: env.ADMIN_NAME?.trim() || 'Operator', role: 'owner' });
const configured = (env: Env) => Boolean(env.ADMIN_EMAIL && env.ADMIN_PASSWORD && env.SESSION_SECRET && env.SESSION_SECRET.length >= 32);
async function digest(value: string): Promise<Uint8Array> { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function equal(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
async function signature(env: Env, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload))));
}
async function sha256(value: string): Promise<string> {
  return Array.from(await digest(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function sessionUserFromToken(env: Env, authorization?: string): Promise<PublicUser | null> {
  if (!configured(env)) return null;
  const token = authorization?.match(/^Bearer (\d{13}:[^\s]+\.[A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return null;
  const separator = token.lastIndexOf('.');
  const payload = token.slice(0, separator);
  const mac = token.slice(separator + 1);
  const [expires, email] = payload.split(':');
  if (!/^\d{13}$/.test(expires) || Number(expires) <= Date.now() || email !== env.ADMIN_EMAIL!.trim().toLowerCase()) return null;
  return await equal(mac, await signature(env, payload)) ? owner(env) : null;
}
export async function userFromToken(env: Env, authorization?: string): Promise<PublicUser | null> {
  if (!configured(env)) return null;
  const session = await sessionUserFromToken(env, authorization);
  if (session) return session;
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return null;
  const key = await env.DB.prepare('SELECT id FROM api_keys WHERE token_hash = ? AND revoked_at IS NULL').bind(await sha256(token)).first();
  return key ? owner(env) : null;
}
const auth = new Hono<{ Bindings: Env }>();
auth.use('*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });
auth.post('/login', async (c) => {
  if (!configured(c.env)) return c.json({ error: 'ADMIN_EMAIL, ADMIN_PASSWORD, atau SESSION_SECRET belum dikonfigurasi.' }, 503);
  const { success } = await c.env.LOGIN_RATE_LIMIT.limit({ key: c.req.header('CF-Connecting-IP') ?? 'local' });
  if (!success) return c.json({ error: 'Terlalu banyak percobaan. Coba lagi sebentar.' }, 429);
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (email.length > 254 || password.length > 128 || !(await equal(email, owner(c.env).email)) || !(await equal(password, c.env.ADMIN_PASSWORD!))) return c.json({ error: 'Email atau password salah.' }, 401);
  const payload = `${Date.now() + SESSION_SECONDS * 1000}:${owner(c.env).email}`;
  return c.json({ token: `${payload}.${await signature(c.env, payload)}`, user: owner(c.env), expiresIn: SESSION_SECONDS });
});
auth.get('/me', async (c) => {
  const user = await sessionUserFromToken(c.env, c.req.header('Authorization'));
  return user ? c.json({ user }) : c.json({ error: 'Unauthorized' }, 401);
});
auth.post('/logout', (c) => c.json({ ok: true }));
auth.get('/api-keys', async (c) => {
  if (!(await sessionUserFromToken(c.env, c.req.header('Authorization')))) return c.json({ error: 'Forbidden' }, 403);
  const { results } = await c.env.DB.prepare('SELECT id, name, created_at, last_used_at FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC').all();
  return c.json({ keys: results });
});
auth.post('/api-keys', async (c) => {
  if (!(await sessionUserFromToken(c.env, c.req.header('Authorization')))) return c.json({ error: 'Forbidden' }, 403);
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) return c.json({ error: 'Nama API key tidak valid.' }, 400);
  const token = newToken();
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO api_keys (id, name, token_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, name, await sha256(token), 'env-owner', Date.now()).run();
  return c.json({ id, token }, 201);
});
auth.delete('/api-keys/:id', async (c) => {
  if (!(await sessionUserFromToken(c.env, c.req.header('Authorization')))) return c.json({ error: 'Forbidden' }, 403);
  const result = await c.env.DB.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(Date.now(), c.req.param('id')).run();
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'API key tidak ditemukan.' }, 404);
});
export default auth;
