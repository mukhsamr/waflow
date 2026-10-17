import { redirect } from '@sveltejs/kit';
import { api } from '#lib/server/api.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('wg_session');
	if (token) await api('/auth/logout', { method: 'POST' }, token).catch(() => undefined);
	cookies.delete('wg_session', { path: '/' });
	redirect(303, '/login');
};
