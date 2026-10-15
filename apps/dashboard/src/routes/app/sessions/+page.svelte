<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { onMount } from 'svelte';
	import { CircleCheck, CircleDashed, Clock3, LoaderCircle, LogOut, Pencil, Plus, QrCode, RotateCcw, Smartphone, Trash2, WifiOff, X } from '@lucide/svelte';
	import { Avatar, Badge, Button, Card, Input, Modal } from '@nqmcreative/ui/matte';
	let { data, form } = $props();
	let showCreate = $state(false);
	let editSessionId = $state<string | null>(null);
	let showQr = $state(false);
	let openedQrAt = $state(0);
	let confirmLogout = $state(false);
	let logoutSessionId = $state<string | null>(null);
	let confirmDelete = $state(false);
	let deleteSessionId = $state<string | null>(null);
	let pendingAction = $state<string | null>(null);
	const withLoading = (key: string): SubmitFunction => () => {
		pendingAction = key;
		return async ({ result, update }) => {
			try {
				await update();
				if (result.type === 'redirect' || result.type === 'success') {
					if (key === 'create') showCreate = false;
					if (key === 'edit') editSessionId = null;
					if (key === 'logout') confirmLogout = false;
					if (key === 'remove') confirmDelete = false;
				}
			} finally { pendingAction = null; }
		};
	};
	let cachedSessions = $state<typeof data.sessions>([]);
	let sessions = $derived(data.loadError ? cachedSessions : data.sessions);
	let qrSession = $derived(sessions.find((session) => session.id === data.qrSessionId));
	$effect(() => { if (!data.loadError) cachedSessions = data.sessions; });
	$effect(() => { if (form?.source === 'create') showCreate = true; });
	$effect(() => { if (form?.source === 'edit') editSessionId = form.sessionId ?? null; });
	$effect(() => { if (form?.source === 'remove') { deleteSessionId = form.sessionId ?? null; confirmDelete = true; } });
	$effect(() => {
		if (data.qrSessionId && data.qrAt > 0 && data.qrAt !== openedQrAt) {
			openedQrAt = data.qrAt;
			showQr = true;
		}
	});
	const labels: Record<string, string> = {
		new: 'Belum terhubung', pairing: 'Menunggu QR', connecting: 'Menghubungkan',
		connected: 'Terhubung', reconnecting: 'Menghubungkan ulang', disconnected: 'Terputus', 'logged-out': 'Keluar'
	};
	let editSession = $derived(sessions.find((session) => session.id === editSessionId));
	let deleteSession = $derived(sessions.find((session) => session.id === deleteSessionId));
	onMount(() => {
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible' && (data.loadError || showQr || sessions.some((session) => !['new', 'logged-out'].includes(session.status.state)))) void invalidateAll();
		}, 5000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>Sesi WhatsApp · waflow</title></svelte:head>

<div class="flex flex-wrap items-start justify-between gap-4">
	<h1 class="font-heading text-3xl font-medium tracking-tight sm:text-4xl">Sesi WhatsApp</h1>
	<Button type="button" variant="primary" onclick={() => showCreate = true}><Plus size={17} aria-hidden="true" /> Tambahkan baru</Button>
</div>

{#if data.loadError}<p class="mt-6 text-sm text-danger" role="alert">{data.loadError}</p>{/if}
{#if form?.message && form.source !== 'create' && form.source !== 'edit' && form.source !== 'remove'}<p class="mt-6 text-sm text-danger" role="alert">{form.message}</p>{/if}

<section class="mt-8" aria-label="Daftar sesi WhatsApp">
	<div class="mb-4 flex items-baseline justify-between"><h2 class="font-heading text-xl font-medium">Daftar akun</h2><span class="font-mono text-xs text-text-muted">{sessions.length} sesi</span></div>
	{#if sessions.length}
		<div class="grid gap-5 xl:grid-cols-2">
			{#each sessions as session (session.id)}
				{@const state = session.status.state}
				<Card>
					<div class="flex flex-wrap items-start gap-4">
						<Avatar src={session.status.avatarUrl} name={session.name} alt={`Foto profil ${session.name}`} size="xl" />
						<div class="min-w-0 flex-1"><h3 class="font-heading text-xl font-medium tracking-tight">{session.name}</h3><p class="mt-1 break-all font-mono text-xs text-text-muted">{session.id}</p></div>
						<Badge tone={state === 'connected' ? 'success' : state === 'disconnected' ? 'danger' : ['pairing', 'connecting', 'reconnecting'].includes(state) ? 'warning' : 'neutral'} size="sm">
							{#snippet icon()}
								{#if state === 'connected'}<CircleCheck aria-hidden="true" />
								{:else if state === 'disconnected'}<WifiOff aria-hidden="true" />
								{:else if ['pairing', 'connecting', 'reconnecting'].includes(state)}<LoaderCircle class="animate-spin" aria-hidden="true" />
								{:else}<CircleDashed aria-hidden="true" />{/if}
							{/snippet}
							{labels[state] ?? state}
						</Badge>
					</div>
					<dl class="mt-5 grid gap-3 border-t border-hairline pt-4 text-sm">
						<div class="flex min-w-0 items-center gap-3"><dt class="flex w-24 shrink-0 items-center gap-2 text-text-muted"><Smartphone size={16} aria-hidden="true" /> Nomor</dt><dd class="truncate font-mono">{session.status.phone ?? 'Belum tersedia'}</dd></div>
						<div class="flex min-w-0 items-center gap-3"><dt class="flex w-24 shrink-0 items-center gap-2 text-text-muted"><Clock3 size={16} aria-hidden="true" /> Diperbarui</dt><dd>{new Date(session.status.updatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })}</dd></div>
					</dl>
					{#if session.status.error}<p class="mt-4 text-sm text-danger" role="alert">{session.status.error}</p>{/if}
					{#snippet footer()}
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div class="flex items-center gap-1">
								<Button type="button" variant="ghost" tone="neutral" size="sm" iconOnly aria-label={`Edit nama ${session.name}`} title="Edit nama" onclick={() => editSessionId = session.id}><Pencil size={16} aria-hidden="true" /></Button>
								<Button type="button" variant="ghost" tone="danger" size="sm" iconOnly aria-label={`Hapus sesi ${session.name}`} title="Hapus sesi" onclick={() => { deleteSessionId = session.id; confirmDelete = true; }}><Trash2 size={16} aria-hidden="true" /></Button>
							</div>
							<div class="flex flex-wrap items-center gap-2">
							{#if state === 'new' || state === 'logged-out' || state === 'pairing' || state === 'connecting'}
								<form method="POST" action="?/start" use:enhance={withLoading(`start:${session.id}`)}><input type="hidden" name="sessionId" value={session.id} /><Button type="submit" variant="primary" size="sm" loading={pendingAction === `start:${session.id}`}>{#snippet icon()}<QrCode size={16} aria-hidden="true" />{/snippet}Tampilkan QR</Button></form>
							{:else if state === 'disconnected'}
								<form method="POST" action="?/relink" use:enhance={withLoading(`relink:${session.id}`)}><input type="hidden" name="sessionId" value={session.id} /><Button type="submit" variant="primary" tone="neutral" size="sm" loading={pendingAction === `relink:${session.id}`}>{#snippet icon()}<QrCode size={16} aria-hidden="true" />{/snippet}Sambung ulang</Button></form>
							{/if}
							{#if state === 'connected' || state === 'disconnected' || state === 'reconnecting'}<Button type="button" variant="primary" tone="danger" size="sm" onclick={() => { logoutSessionId = session.id; confirmLogout = true; }}><LogOut size={16} aria-hidden="true" /> Logout WA</Button>{/if}
							</div>
						</div>
					{/snippet}
				</Card>
			{/each}
		</div>
	{:else if !data.loadError}
		<div class="border border-hairline bg-bg p-8 text-sm text-text-muted">Belum ada sesi.</div>
	{/if}
</section>

<Modal bind:open={showCreate} title="Tambahkan sesi" size="sm">
	<form method="POST" action="?/create" use:enhance={withLoading('create')} class="space-y-5">
		<div><label for="session-name" class="mb-2 block text-sm font-medium">Nama sesi</label><Input id="session-name" name="name" required maxlength={80} placeholder="Nama sesi" /></div>
		{#if form?.source === 'create' && form.message}<p class="text-sm text-danger" role="alert">{form.message}</p>{/if}
		<div class="flex justify-end gap-3"><Button type="button" variant="soft" tone="neutral" disabled={pendingAction === 'create'} onclick={() => showCreate = false}><X size={16} aria-hidden="true" /> Batal</Button><Button type="submit" variant="primary" loading={pendingAction === 'create'}>{#snippet icon()}<Plus size={16} aria-hidden="true" />{/snippet}Buat sesi</Button></div>
	</form>
</Modal>

<Modal bind:open={confirmDelete} title={deleteSession ? `Hapus ${deleteSession.name}?` : 'Hapus sesi?'} description="Sesi dan kredensial akan dihapus. Jika terhubung, perangkat WhatsApp juga akan terputus." size="sm">
	{#if deleteSessionId}
		<form method="POST" action="?/remove" use:enhance={withLoading('remove')} class="flex justify-end gap-2">
			<input type="hidden" name="sessionId" value={deleteSessionId} />
			{#if form?.source === 'remove' && form.message}<p class="mr-auto text-sm text-danger" role="alert">{form.message}</p>{/if}
			<Button type="button" variant="soft" tone="neutral" disabled={pendingAction === 'remove'} onclick={() => confirmDelete = false}><X size={16} aria-hidden="true" /> Batal</Button>
			<Button type="submit" variant="primary" tone="danger" loading={pendingAction === 'remove'}>{#snippet icon()}<Trash2 size={16} aria-hidden="true" />{/snippet}Hapus</Button>
		</form>
	{/if}
</Modal>

<Modal open={editSessionId !== null} title="Edit nama sesi" size="sm" onclose={() => editSessionId = null}>
	{#if editSession}
		<form method="POST" action="?/edit" use:enhance={withLoading('edit')} class="space-y-5">
			<input type="hidden" name="sessionId" value={editSession.id} />
			<div><label for="edit-session-name" class="mb-2 block text-sm font-medium">Nama sesi</label><Input id="edit-session-name" name="name" required maxlength={80} value={editSession.name} placeholder="Nama sesi" /></div>
			{#if form?.source === 'edit' && form.message}<p class="text-sm text-danger" role="alert">{form.message}</p>{/if}
			<div class="flex justify-end gap-3"><Button type="button" variant="soft" tone="neutral" disabled={pendingAction === 'edit'} onclick={() => editSessionId = null}><X size={16} aria-hidden="true" /> Batal</Button><Button type="submit" variant="primary" loading={pendingAction === 'edit'}>{#snippet icon()}<Pencil size={16} aria-hidden="true" />{/snippet}Simpan</Button></div>
		</form>
	{/if}
</Modal>

<Modal bind:open={showQr} title={qrSession?.name ?? 'Kode QR'} size="sm" onclose={() => { void goto('/app/sessions', { replaceState: true }); }}>
	<div class="mx-auto flex size-64 items-center justify-center border border-hairline bg-bg-alt p-3" aria-label="Area kode QR">
		{#if qrSession?.status.state === 'connected'}
			<p class="flex items-center gap-2 text-sm text-success"><CircleCheck size={18} aria-hidden="true" /> Terhubung</p>
		{:else if data.qrSvg}
			<div class="size-full bg-white [&_svg]:h-full [&_svg]:w-full" aria-label="QR pairing WhatsApp">{@html data.qrSvg}</div>
		{:else if Date.now() - data.qrAt >= 30_000}
			{#if qrSession}
				<form method="POST" action="?/start" use:enhance={withLoading(`start:${qrSession.id}`)} class="size-full"><input type="hidden" name="sessionId" value={qrSession.id} /><button type="submit" disabled={pendingAction === `start:${qrSession.id}`} aria-busy={pendingAction === `start:${qrSession.id}`} class="flex size-full flex-col items-center justify-center gap-2 text-center text-sm text-brand hover:bg-brand-light focus-visible:outline-2 focus-visible:outline-brand"><LoaderCircle size={28} class={pendingAction === `start:${qrSession.id}` ? 'animate-spin' : 'hidden'} aria-hidden="true" /><RotateCcw size={28} class={pendingAction === `start:${qrSession.id}` ? 'hidden' : ''} aria-hidden="true" /><span>Perbarui QR</span></button></form>
			{:else}
				<p class="text-sm text-text-muted">QR kedaluwarsa.</p>
			{/if}
		{:else}
			<p class="flex flex-col items-center gap-2 text-center text-sm text-text-muted"><LoaderCircle size={28} class="animate-spin" aria-hidden="true" /> Menunggu QR…</p>
		{/if}
	</div>
	{#if data.qrSvg}<p class="mt-3 text-center text-sm text-text-muted">Pindai lewat Perangkat tertaut di WhatsApp.</p>{/if}
</Modal>

<Modal bind:open={confirmLogout} title="Logout sesi WhatsApp?" description="Perangkat akan terputus dan perlu pairing lagi untuk digunakan." size="sm">
	{#if logoutSessionId}
		<form method="POST" action="?/logout" use:enhance={withLoading('logout')} class="flex justify-end gap-2"><input type="hidden" name="sessionId" value={logoutSessionId} />
			<Button type="button" variant="soft" tone="neutral" disabled={pendingAction === 'logout'} onclick={() => confirmLogout = false}><X size={16} aria-hidden="true" /> Batal</Button>
			<Button type="submit" variant="primary" tone="danger" loading={pendingAction === 'logout'}>{#snippet icon()}<LogOut size={16} aria-hidden="true" />{/snippet}Logout WA</Button>
		</form>
	{/if}
</Modal>
