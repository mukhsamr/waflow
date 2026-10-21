import { fail } from '@sveltejs/kit';
import { api } from '#lib/server/api.js';
import type { Actions, PageServerLoad } from './$types';
type Log = { id: string; session_name: string; jid: string; status: string; error: string | null; wa_ack: number; created_at: number };
export const load: PageServerLoad = async ({ cookies, url }) => {
  const sessionId = url.searchParams.get('sessionId') ?? '';
  const filters = new URLSearchParams(url.searchParams);
  filters.set('direction', 'outgoing');
  const [history, sessionList] = await Promise.allSettled([
    api(`/messages/logs?${filters}`, {}, cookies.get('wg_session')),
    api('/sessions', {}, cookies.get('wg_session'))
  ]);
  let logs: Log[] = [], next: { before: number; beforeId: string } | null = null, logError = '';
  try {
    if (history.status === 'rejected') throw history.reason;
    const response = history.value;
    if (!response.ok) throw new Error();
    ({ logs, next } = await response.json() as { logs: Log[]; next: { before: number; beforeId: string } | null });
  } catch { logError = 'Riwayat pesan belum dapat dimuat.'; }
  try {
    if (sessionList.status === 'rejected') throw sessionList.reason;
    const response = sessionList.value;
    if (!response.ok) throw new Error();
    const { sessions } = await response.json() as { sessions: { id: string; name: string; status: { state: string } }[] };
    return { sessions, sessionId, idempotencyKey: crypto.randomUUID(), error: '', logs, next, logError };
  } catch { return { sessions: [], sessionId, idempotencyKey: crypto.randomUUID(), error: 'Sesi belum dapat dimuat.', logs, next, logError }; }
};
export const actions: Actions = {
  send: async ({ request, cookies }) => {
    const form = await request.formData();
    const values = { sessionId: String(form.get('sessionId') ?? ''), mode: String(form.get('mode') ?? 'single'), recipient: String(form.get('recipient') ?? ''), recipients: String(form.get('recipients') ?? ''), delaySeconds: String(form.get('delaySeconds') ?? ''), text: String(form.get('text') ?? ''), idempotencyKey: String(form.get('idempotencyKey') ?? '') };
    try {
      const response = await api(values.mode === 'multiple' ? '/messages/multiple' : '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, delaySeconds: values.delaySeconds ? Number(values.delaySeconds) : null }) }, cookies.get('wg_session'));
      const result = await response.json() as { error?: string; count?: number; message?: { id: string; status: string } };
      if (!response.ok) return fail(response.status, { ...values, error: result.error ?? 'Permintaan gagal. Periksa log sebelum mengirim ulang.' });
      return { accepted: true, count: result.count ?? 1 };
    } catch { return fail(503, { ...values, error: 'Respons API tidak tersedia. Ulangi formulir ini dengan ID permintaan yang sama.' }); }
  }
};
