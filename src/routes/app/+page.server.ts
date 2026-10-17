import { api } from '#lib/server/api.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
  const [response, messageResponse] = await Promise.all([api('/sessions', {}, cookies.get('wg_session')), api('/messages/stats', {}, cookies.get('wg_session'))]);
  const stats = messageResponse.ok ? await messageResponse.json() as { today: number; pending: number } : null;
  if (!response.ok) return { activeSessions: null, stats };
	const { sessions } = await response.json() as { sessions: { status: { state: string } }[] };
  return { activeSessions: sessions.filter((session) => session.status.state === 'connected').length, stats };
};
