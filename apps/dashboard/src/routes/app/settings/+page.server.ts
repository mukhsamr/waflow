import { fail } from '@sveltejs/kit';
import { api } from '#lib/server/api.js';
import type { Actions, PageServerLoad } from './$types';

type ApiKey = { id: string; name: string; created_at: number };

export const load: PageServerLoad = async ({ cookies }) => {
	const token = cookies.get('wg_session');
	const keys = await api('/auth/api-keys', {}, token);
	if (!keys.ok) return { keys: [], loadError: 'Data pengaturan belum dapat dimuat.' };
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
		return { message: 'API key dibuat. Salin sekarang; nilainya tidak akan ditampilkan lagi.', token };
	},
	revoke: async ({ request, cookies }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const response = await api(`/auth/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' }, cookies.get('wg_session'));
		if (!response.ok) return fail(response.status, { message: (await response.json() as { error: string }).error });
		return { message: 'API key dicabut.' };
	}
};
