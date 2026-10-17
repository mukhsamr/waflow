import webhooks from './webhooks';
import { Hono } from 'hono';
import auth, { userFromToken } from './auth';
import messaging, { type MessagingEnv } from './messaging';

type Env = MessagingEnv;
type SessionRow = { id: string; name: string; created_at: number };

const app = new Hono<{ Bindings: Env }>();
app.onError((_error, c) => c.json({ error: 'Operasi gateway gagal. Periksa status sesi lalu coba lagi.' }, 503));
app.use('/sessions/*', async (c, next) => { await next(); c.header('Cache-Control', 'no-store'); });
const validId = (id: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(id);
const sessionStub = (env: Env, id: string) => env.WA_SESSIONS.get(env.WA_SESSIONS.idFromName(id));

app.get('/health', (c) => c.json({ ok: true, service: 'waflow' }));
app.route('/auth', auth);
app.route('/messages', messaging);
app.route('/webhooks', webhooks);

app.get('/sessions', async (c) => {
  if (!(await userFromToken(c.env, c.req.header('Authorization')))) return c.json({ error: 'Unauthorized' }, 401);
  const { results } = await c.env.DB.prepare('SELECT id, name, created_at FROM wa_sessions ORDER BY created_at DESC').all<SessionRow>();
  const sessions = await Promise.all(results.map(async (row) => {
    try {
      const { qr: _qr, ...status } = await sessionStub(c.env, row.id).status(row.id);
      return { ...row, status };
    } catch {
      return { ...row, status: { state: 'disconnected', updatedAt: Date.now(), error: 'Status sementara tidak tersedia. Mencoba lagi otomatis.' } };
    }
  }));
  return c.json({ sessions });
});

app.post('/sessions', async (c) => {
  const user = await userFromToken(c.env, c.req.header('Authorization'));
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const id = crypto.randomUUID();
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) return c.json({ error: 'Nama sesi tidak valid.' }, 400);
  try {
    await c.env.DB.prepare('INSERT INTO wa_sessions (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').bind(id, name, user.id, Date.now()).run();
    return c.json({ id, name, status: await sessionStub(c.env, id).status(id) }, 201);
  } catch (error) {
    throw error;
  }
});

app.use('/sessions/:id/*', async (c, next) => {
  if (!(await userFromToken(c.env, c.req.header('Authorization')))) return c.json({ error: 'Unauthorized' }, 401);
  const id = c.req.param('id');
  if (!validId(id)) return c.json({ error: 'Invalid session ID' }, 400);
  const exists = await c.env.DB.prepare('SELECT 1 FROM wa_sessions WHERE id = ?').bind(id).first();
  if (!exists) return c.json({ error: 'Sesi tidak ditemukan.' }, 404);
  await sessionStub(c.env, id).identify(id);
  await next();
});

app.get('/sessions/:id/status', async (c) => c.json(await sessionStub(c.env, c.req.param('id')).status()));
app.patch('/sessions/:id/name', async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) return c.json({ error: 'Nama sesi tidak valid.' }, 400);
  await c.env.DB.prepare('UPDATE wa_sessions SET name = ? WHERE id = ?').bind(name, c.req.param('id')).run();
  return c.json({ id: c.req.param('id'), name });
});
app.post('/sessions/:id/start', async (c) => c.json(await sessionStub(c.env, c.req.param('id')).start()));
app.post('/sessions/:id/reconnect', async (c) => c.json(await sessionStub(c.env, c.req.param('id')).reconnect()));
app.post('/sessions/:id/relink', async (c) => c.json(await sessionStub(c.env, c.req.param('id')).relink()));
app.post('/sessions/:id/logout', async (c) => c.json(await sessionStub(c.env, c.req.param('id')).logout()));
app.post('/sessions/:id/remove', async (c) => {
  const id = c.req.param('id');
  await sessionStub(c.env, id).remove();
  await c.env.DB.prepare('DELETE FROM messages WHERE session_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM wa_sessions WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});
export default app;

