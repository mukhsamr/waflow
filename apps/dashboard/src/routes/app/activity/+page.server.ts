import { api } from '#lib/server/api.js';
import type { PageServerLoad } from './$types';
type Log = { id: string; session_name: string; direction: string; jid: string; status: string; error: string | null; wa_ack: number; created_at: number };
export const load: PageServerLoad = async ({ cookies, url }) => {
 const filters = { sessionId: url.searchParams.get('sessionId') ?? '', status: url.searchParams.get('status') ?? '' };
 try {
  const [s,l,stats] = await Promise.all([api('/sessions',{},cookies.get('wg_session')),api(`/messages/logs?${url.searchParams}`,{},cookies.get('wg_session')),api('/messages/stats',{},cookies.get('wg_session'))]);
  if (!s.ok || !l.ok || !stats.ok) throw new Error();
  return { ...filters, sessions: (await s.json() as { sessions: { id: string; name: string }[] }).sessions, ...await l.json() as { logs: Log[]; next: { before: number; beforeId: string } | null }, stats: await stats.json() as { pending: number; incoming: number; attention: number }, error: '' };
 } catch { return { ...filters,sessions:[],logs:[],next:null,stats:null,error:'Log aktivitas belum dapat dimuat.' }; }
};
