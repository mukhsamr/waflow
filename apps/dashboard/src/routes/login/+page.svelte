<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Input } from '@nqmcreative/ui/matte';
	import AuthShell from '#lib/components/AuthShell.svelte';
	let { form } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Masuk · waflow</title></svelte:head>

<AuthShell eyebrow="Selamat datang kembali" title="Masuk ke panel">
	{#if form?.message}<div class="mb-6 border-l-2 border-danger bg-danger-light px-4 py-3 text-sm text-danger" role="alert">{form.message}</div>{/if}
	<form method="POST" use:enhance={() => { pending = true; return async ({ update }) => { try { await update(); } finally { pending = false; } }; }} class="space-y-5">
		<div><label for="email" class="mb-2 block text-sm font-medium">Email</label><Input id="email" name="email" type="email" autocomplete="email" placeholder="nama@perusahaan.com" value={form?.email ?? ''} required /></div>
		<div><label for="password" class="mb-2 block text-sm font-medium">Password</label><Input id="password" name="password" type="password" autocomplete="current-password" placeholder="Masukkan password" required /></div>
		<div class="pt-2"><Button type="submit" variant="solid" block size="lg" loading={pending}>Masuk ke panel</Button></div>
	</form>
</AuthShell>
