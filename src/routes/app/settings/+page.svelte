<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, ConfirmDialog, Input } from '@nqmcreative/ui/matte';
	let { data, form } = $props();
	let keyPending = $state(false);
	let confirmRevoke = $state(false);
	let revokeId = $state('');
	let revokeForm = $state<HTMLFormElement>();
	let finishRevoke: (() => void) | undefined;
</script>

<svelte:head><title>Pengaturan · waflow</title></svelte:head>

<h1 class="font-heading text-3xl font-medium tracking-tight sm:text-4xl">Pengaturan</h1>

{#if form?.message}<p class="mt-6 border border-hairline bg-bg px-4 py-3 text-sm" role="status">{form.message}</p>{/if}
{#if data.loadError}<p class="mt-6 text-sm text-danger" role="alert">{data.loadError}</p>{/if}

<section class="mt-8 max-w-3xl border border-hairline bg-bg">
	<h2 class="border-b border-hairline px-6 py-5 font-heading text-xl font-medium">Profil</h2>
	<dl class="divide-y divide-hairline px-6"><div class="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt class="text-sm text-text-muted">Nama</dt><dd class="text-sm font-medium">{data.user.name}</dd></div><div class="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt class="text-sm text-text-muted">Email</dt><dd class="text-sm font-medium">{data.user.email}</dd></div><div class="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt class="text-sm text-text-muted">Peran</dt><dd class="text-sm font-medium">{data.user.role === 'owner' ? 'Pemilik' : 'Operator'}</dd></div></dl>
</section>

{#if data.user.role === 'owner'}
	<section class="mt-6 max-w-3xl border border-hairline bg-bg">
		<div class="border-b border-hairline px-6 py-5"><h2 class="font-heading text-xl font-medium">API key</h2></div>
		{#if form?.token}<div class="m-6 break-all border border-warning bg-warning-light p-4 text-sm"><strong>Salin key sekarang:</strong> <code>{form.token}</code></div>{/if}
		<ul class="divide-y divide-hairline px-6">{#each data.keys as key}<li class="flex items-center justify-between gap-3 py-3 text-sm"><span>{key.name}</span><button type="button" class="text-danger" onclick={() => { revokeId = key.id; confirmRevoke = true; }}>Cabut</button></li>{:else}<li class="py-4 text-sm text-text-muted">Belum ada API key.</li>{/each}</ul>
		<form method="POST" action="?/key" use:enhance={() => { keyPending = true; return async ({ update }) => { try { await update(); } finally { keyPending = false; } }; }} class="flex flex-wrap items-end gap-4 border-t border-hairline p-6"><div class="min-w-56 flex-1"><label for="key-name" class="mb-2 block text-sm">Nama key</label><Input id="key-name" name="name" required maxlength={80} /></div><Button type="submit" loading={keyPending}>Buat API key</Button></form>
	</section>
	<form bind:this={revokeForm} method="POST" action="?/revoke" use:enhance={() => async ({ update }) => { try { await update(); } finally { finishRevoke?.(); finishRevoke = undefined; } }}><input type="hidden" name="id" value={revokeId} /></form>
	<ConfirmDialog bind:open={confirmRevoke} title="Cabut API key?" description="Integrasi yang memakai key ini akan kehilangan akses." tone="danger" confirmLabel="Ya, cabut" cancelLabel="Batal" onconfirm={() => new Promise<void>((resolve) => { finishRevoke = resolve; revokeForm?.requestSubmit(); })} />
{/if}
