import { error, fail } from '@sveltejs/kit';
import { api } from '#lib/server/api.js';
import type { Actions, PageServerLoad } from './$types';

type ApiKey = { id: string; name: string; token_preview: string | null; created_at: number };

export const load: PageServerLoad = async ({ cookies, parent }) => {
	if ((await parent()).user.role !== 'owner') error(403, 'Akses ditolak.');
	const token = cookies.get('wg_session');
	const keys = await api('/auth/api-keys', {}, token);
	if (!keys.ok) return { keys: [], loadError: 'API key belum dapat dimuat.' };
	return {
		keys: (await keys.json() as { keys: ApiKey[] }).keys
	};
};

export const actions: Actions = {
	key: async ({ request, cookies }) => {
		const form = await request.formData();
		const response = await api('/auth/api-keys', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name') })
		}, cookies.get('wg_session'));
		if (!response.ok) return fail(response.status, { message: (await response.json() as { error: string }).error });
		const { token } = await response.json() as { token: string };
		return { token };
	},
	edit: async ({ request, cookies }) => {
		const form = await request.formData();
		const response = await api(`/auth/api-keys/${encodeURIComponent(String(form.get('id') ?? ''))}`, {
			method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name') })
		}, cookies.get('wg_session'));
		if (!response.ok) return fail(response.status, { message: (await response.json() as { error: string }).error });
		return { saved: true };
	},
	rotate: async ({ request, cookies }) => {
		const form = await request.formData();
		const response = await api(`/auth/api-keys/${encodeURIComponent(String(form.get('id') ?? ''))}/rotate`, { method: 'POST' }, cookies.get('wg_session'));
		if (!response.ok) return fail(response.status, { message: (await response.json() as { error: string }).error });
		return { token: (await response.json() as { token: string }).token };
	},
	revoke: async ({ request, cookies }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const response = await api(`/auth/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }, cookies.get('wg_session'));
		if (!response.ok) return fail(response.status, { message: (await response.json() as { error: string }).error });
		return { removed: true };
	}
};
