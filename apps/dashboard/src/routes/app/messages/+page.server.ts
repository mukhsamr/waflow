import { fail } from '@sveltejs/kit';
import { api } from '#lib/server/api.js';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ cookies, url }) => {
  try {
    const response = await api('/sessions', {}, cookies.get('wg_session'));
    if (!response.ok) throw new Error();
    const { sessions } = await response.json() as { sessions: { id: string; name: string; status: { state: string } }[] };
    return { sessions, sessionId: url.searchParams.get('sessionId') ?? '', idempotencyKey: crypto.randomUUID(), error: '' };
  } catch { return { sessions: [], sessionId: '', idempotencyKey: crypto.randomUUID(), error: 'Sesi belum dapat dimuat.' }; }
};
export const actions: Actions = {
  send: async ({ request, cookies }) => {
    const form = await request.formData();
    const values = { sessionId: String(form.get('sessionId') ?? ''), recipient: String(form.get('recipient') ?? ''), text: String(form.get('text') ?? ''), idempotencyKey: String(form.get('idempotencyKey') ?? '') };
    try {
      const response = await api('/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }, cookies.get('wg_session'));
      const result = await response.json() as { error?: string; message?: { id: string; status: string } };
      if (!response.ok) return fail(response.status, { ...values, error: result.error ?? 'Permintaan gagal. Periksa log sebelum mengirim ulang.' });
      return { accepted: true, id: result.message?.id, status: result.message?.status };
    } catch { return fail(503, { ...values, error: 'Respons API tidak tersedia. Ulangi formulir ini dengan ID permintaan yang sama.' }); }
  }
};
