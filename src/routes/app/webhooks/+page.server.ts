import { fail } from '@sveltejs/kit';
import { api } from '#lib/server/api.js';
import type { Actions, PageServerLoad } from './$types';
type Config = { session_id: string; session_name: string; url: string; enabled: number; events: string[] };
type Delivery = { id: string; event: string; session_name: string; status: string; attempts: number; http_status: number | null; error: string | null; updated_at: number };
export const load: PageServerLoad = async ({ cookies }) => {
  try {
    const [s, w] = await Promise.all([api('/sessions', {}, cookies.get('wg_session')), api('/webhooks', {}, cookies.get('wg_session'))]);
    if (!s.ok || !w.ok) throw new Error();
    return { sessions: (await s.json() as { sessions: { id: string; name: string }[] }).sessions, ...await w.json() as { configs: Config[]; deliveries: Delivery[] }, error: '' };
  } catch { return { sessions: [], configs: [], deliveries: [], error: 'Webhook belum dapat dimuat. Coba lagi.' }; }
};
export const actions: Actions = {
  save: async ({ cookies, request }) => {
    const values = await request.formData();
    try {
      const response = await api(`/webhooks/${encodeURIComponent(String(values.get('sessionId')))}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: values.get('url'), enabled: values.get('enabled') === 'on', events: values.getAll('events') }) }, cookies.get('wg_session'));
      const result = await response.json() as { secret?: string; error?: string };
      if (!response.ok) return fail(response.status, { error: result.error ?? 'Gagal menyimpan webhook.' });
      return { secret: result.secret };
    } catch { return fail(503, { error: 'Respons API tidak tersedia. Periksa konfigurasi sebelum mencoba lagi.' }); }
  },
  remove: async ({ cookies, request }) => {
    const values = await request.formData();
    try {
      const response = await api(`/webhooks/${encodeURIComponent(String(values.get('sessionId')))}`, { method: 'DELETE' }, cookies.get('wg_session'));
      if (!response.ok) return fail(response.status, { error: 'Gagal mencabut webhook.' });
      return { removed: true };
    } catch { return fail(503, { error: 'API tidak tersedia.' }); }
  }
};
