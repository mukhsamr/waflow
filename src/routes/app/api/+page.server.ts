import { api } from '#lib/server/api.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
 try {
  const response = await api('/sessions', {}, cookies.get('wg_session'));
  if (!response.ok) throw new Error();
  return { requestId: crypto.randomUUID(), sessions: (await response.json() as { sessions: { id: string; name: string }[] }).sessions, error: '' };
 } catch { return { requestId: crypto.randomUUID(), sessions: [], error: 'Sesi belum dapat dimuat.' }; }
};
