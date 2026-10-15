import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';

export type User = { id: string; email: string; name: string; role: 'owner' | 'operator' };

export async function api(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
	const platform = getRequestEvent().platform as { env?: { API_URL?: string } } | undefined;
	const base = platform?.env?.API_URL || process.env.API_URL || 'http://127.0.0.1:8787';
	const headers = new Headers(init.headers);
	if (token) headers.set('Authorization', `Bearer ${token}`);
	const url = new URL(path, base);
	for (let attempt = 0; ; attempt++) {
		try { return await fetch(url, { ...init, headers }); }
		catch (error) {
			if ((init.method ?? 'GET').toUpperCase() !== 'GET' || attempt === 2) throw error;
			await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
		}
	}
}

export async function currentUser(token: string | undefined): Promise<User | null> {
	if (!token) return null;
	let response: Response;
	try {
		response = await api('/auth/me', {}, token);
	} catch {
		error(503, 'API autentikasi belum tersedia. Jalankan bun run dev:api.');
	}
	if (response.status === 401) return null;
	if (!response.ok) error(503, 'API autentikasi sedang bermasalah.');
	return (await response.json() as { user: User }).user;
}
