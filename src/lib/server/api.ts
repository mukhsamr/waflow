import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { env } from 'cloudflare:workers';
import gateway from './gateway';

export type User = { id: string; email: string; name: string; role: 'owner' | 'operator' };

export async function api(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
	const event = getRequestEvent();
	const headers = new Headers(init.headers);
	if (token) headers.set('Authorization', `Bearer ${token}`);
	const address = event.request.headers.get('CF-Connecting-IP');
	if (address) headers.set('CF-Connecting-IP', address);
	return gateway.fetch(new Request(new URL(path, event.url), { ...init, headers }), env);
}

export async function currentUser(token: string | undefined): Promise<User | null> {
	if (!token) return null;
	let response: Response;
	try {
		response = await api('/auth/me', {}, token);
	} catch {
		error(503, 'Autentikasi belum tersedia. Coba lagi.');
	}
	if (response.status === 401) return null;
	if (!response.ok) error(503, 'API autentikasi sedang bermasalah.');
	return (await response.json() as { user: User }).user;
}
