import { fail, redirect } from '@sveltejs/kit';
import { api, currentUser } from '#lib/server/api.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	if (await currentUser(cookies.get('wg_session'))) redirect(303, '/app');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!email || !password) return fail(400, { email, message: 'Isi email dan password.' });
		let response: Response;
		try {
			response = await api('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
		} catch {
			return fail(503, { email, message: 'Login belum tersedia. Coba lagi.' });
		}
		if (!response.ok) {
			const body = await response.json() as { error?: string };
			return fail(response.status, { email, message: body.error ?? 'Login gagal.' });
		}
		const { token, expiresIn } = await response.json() as { token: string; expiresIn: number };
		cookies.set('wg_session', token, { path: '/', httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', maxAge: expiresIn });
		redirect(303, '/app');
	}
};
