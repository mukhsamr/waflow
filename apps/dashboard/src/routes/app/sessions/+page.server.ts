import { fail, redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { api } from '#lib/server/api.js';
import type { Actions, PageServerLoad } from './$types';

type Status = { state: string; phone?: string; avatarUrl?: string; updatedAt: number; error?: string; qr?: string };
type Session = { id: string; name: string; created_at: number; status: Status };
const listUrl = '/app/sessions';

export const load: PageServerLoad = async ({ cookies, url }) => {
	const token = cookies.get('wg_session');
	let sessions: Session[] = [];
	let loadError = '';
	try {
		const response = await api('/sessions', {}, token);
		if (response.ok) sessions = (await response.json() as { sessions: Session[] }).sessions;
		else loadError = 'Daftar sesi belum dapat dimuat. Mencoba lagi otomatis.';
	} catch { loadError = 'Daftar sesi belum dapat dimuat. Mencoba lagi otomatis.'; }

	const qrSessionId = url.searchParams.get('qr');
	const qrAt = Number(url.searchParams.get('at'));
	let qrSvg: string | null = null;
	if (qrSessionId && sessions.some((session) => session.id === qrSessionId) && Number.isSafeInteger(qrAt) && qrAt > 0 && Date.now() - qrAt < 30_000) {
		try {
			const response = await api(`/sessions/${encodeURIComponent(qrSessionId)}/status`, {}, token);
			if (response.ok) {
				const status = await response.json() as Status;
				if (status.qr) qrSvg = await QRCode.toString(status.qr, { type: 'svg', margin: 1 });
			}
		} catch { /* The modal retains its retry action. */ }
	}
	return { sessions, loadError, qrSessionId, qrAt, qrSvg };
};

async function submit(request: Request, token: string | undefined, operation: 'start' | 'relink' | 'logout') {
	const id = String((await request.formData()).get('sessionId') ?? '');
	if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return fail(400, { source: operation, message: 'Sesi tidak valid.' });
	let response: Response;
	try { response = await api(`/sessions/${encodeURIComponent(id)}/${operation}`, { method: 'POST' }, token); }
	catch { return fail(503, { source: operation, message: 'Koneksi ke API terputus. Coba lagi.' }); }
	if (!response.ok) return fail(response.status, { source: operation, message: (await response.json() as { error?: string }).error ?? 'Operasi sesi gagal.' });
	redirect(303, operation === 'logout' ? listUrl : `${listUrl}?qr=${encodeURIComponent(id)}&at=${Date.now()}`);
}

export const actions: Actions = {
	create: async ({ request, cookies }) => {
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name || name.length > 80) return fail(400, { source: 'create', message: 'Nama sesi wajib diisi, maksimal 80 karakter.' });
		let response: Response;
		try { response = await api('/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }, cookies.get('wg_session')); }
		catch { return fail(503, { source: 'create', message: 'Koneksi ke API terputus. Coba lagi.' }); }
		if (!response.ok) return fail(response.status, { source: 'create', message: (await response.json() as { error?: string }).error ?? 'Gagal membuat sesi.' });
		redirect(303, listUrl);
	},
	edit: async ({ request, cookies }) => {
		const form = await request.formData();
		const id = String(form.get('sessionId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return fail(400, { source: 'edit', sessionId: id, message: 'Sesi tidak valid.' });
		if (!name || name.length > 80) return fail(400, { source: 'edit', sessionId: id, message: 'Nama sesi wajib diisi, maksimal 80 karakter.' });
		let response: Response;
		try { response = await api(`/sessions/${encodeURIComponent(id)}/name`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }, cookies.get('wg_session')); }
		catch { return fail(503, { source: 'edit', sessionId: id, message: 'Koneksi ke API terputus. Coba lagi.' }); }
		if (!response.ok) return fail(response.status, { source: 'edit', sessionId: id, message: (await response.json() as { error?: string }).error ?? 'Gagal mengubah nama sesi.' });
		redirect(303, listUrl);
	},
	remove: async ({ request, cookies }) => {
		const id = String((await request.formData()).get('sessionId') ?? '');
		if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return fail(400, { source: 'remove', sessionId: id, message: 'Sesi tidak valid.' });
		let response: Response;
		try { response = await api(`/sessions/${encodeURIComponent(id)}/remove`, { method: 'POST' }, cookies.get('wg_session')); }
		catch { return fail(503, { source: 'remove', sessionId: id, message: 'Koneksi ke API terputus. Coba lagi.' }); }
		if (!response.ok) return fail(response.status, { source: 'remove', sessionId: id, message: (await response.json() as { error?: string }).error ?? 'Gagal menghapus sesi.' });
		redirect(303, listUrl);
	},
	start: async ({ request, cookies }) => submit(request, cookies.get('wg_session'), 'start'),
	relink: async ({ request, cookies }) => submit(request, cookies.get('wg_session'), 'relink'),
	logout: async ({ request, cookies }) => submit(request, cookies.get('wg_session'), 'logout')
};
