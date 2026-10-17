<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Activity, Bell, ChevronUp, LayoutDashboard, LogOut, Send, Code, RadioTower, Settings, Webhook } from '@lucide/svelte';
	import { Badge, Breadcrumb, ConfirmDialog } from '@nqmcreative/ui/matte';
	let { data, children } = $props();
	let confirmLogout = $state(false);
	let logoutForm: HTMLFormElement;
	let finishLogout: (() => void) | undefined;
	const navigation = [
		{ href: '/app', label: 'Ringkasan', icon: LayoutDashboard },
		{ href: '/app/sessions', label: 'Sesi WhatsApp', icon: RadioTower },
		{ href: '/app/messages', label: 'Kirim teks', icon: Send },
		{ href: '/app/webhooks', label: 'Webhook', icon: Webhook },
		{ href: '/app/activity', label: 'Log aktivitas', icon: Activity },
		{ href: '/app/api', label: 'Panduan API', icon: Code }
	];
	let breadcrumbs = $derived.by(() => {
		const path = page.url.pathname;
		if (path === '/app') return [{ label: 'Ringkasan' }];
		const items = [{ label: 'Ringkasan', href: '/app' }];
		const labels: Record<string, string> = { '/app/sessions': 'Sesi WhatsApp', '/app/messages': 'Kirim teks', '/app/activity': 'Log aktivitas', '/app/settings': 'Pengaturan', '/app/webhooks': 'Webhook', '/app/api': 'Panduan API' };
		return [...items, { label: labels[path] ?? path.split('/').filter(Boolean).at(-1) ?? 'Halaman' }];
	});
</script>

<svelte:head><title>Panel · waflow</title></svelte:head>

<div class="min-h-screen bg-bg-alt text-text lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
	<aside class="border-b border-hairline bg-bg lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
		<div class="flex h-[74px] items-center border-b border-hairline px-5"><a href="/app" class="font-heading text-lg font-medium tracking-tight">waflow</a></div>
		<nav aria-label="Navigasi panel" class="flex gap-1 overflow-x-auto p-3 lg:mt-7 lg:flex-col lg:px-3">
			{#each navigation as item}
				{@const active = item.href === '/app' ? page.url.pathname === '/app' : page.url.pathname.startsWith(item.href)}
				<a href={item.href} aria-current={active ? 'page' : undefined} class:active class="flex shrink-0 items-center gap-3 border-l-2 border-transparent px-3 py-3 text-sm text-text-muted transition-colors hover:bg-bg-alt hover:text-text lg:w-full"><item.icon size={17} strokeWidth={1.7} /><span>{item.label}</span></a>
			{/each}
		</nav>
		<div class="mt-auto border-t border-hairline p-3">
			<details name="panel-menu" class="relative group">
				<summary class="flex cursor-pointer list-none items-center gap-3 p-2 hover:bg-bg-alt [&::-webkit-details-marker]:hidden" aria-label="Buka menu profil">
					<span class="flex h-9 w-9 shrink-0 items-center justify-center bg-brand-light text-sm font-medium text-brand" aria-hidden="true">{data.user.name.charAt(0).toUpperCase()}</span>
					<span class="min-w-0 flex-1 text-left"><span class="block truncate text-sm font-medium">{data.user.name}</span><span class="block truncate text-xs text-text-muted">{data.user.email}</span></span>
					<ChevronUp size={16} class="text-text-muted transition-transform group-open:rotate-180" />
				</summary>
				<div class="absolute bottom-full left-0 z-20 mb-2 w-full border border-hairline bg-bg p-1 shadow-sm">
					<a href="/app/settings" class="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-bg-alt"><Settings size={16} /> Pengaturan</a>
					<form bind:this={logoutForm} method="POST" action="/logout" use:enhance={() => async ({ update }) => { try { await update(); } finally { finishLogout?.(); finishLogout = undefined; } }} class="border-t border-hairline"><button type="button" onclick={() => (confirmLogout = true)} class="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-danger hover:bg-danger-light"><LogOut size={16} /> Keluar</button></form>
				</div>
			</details>
		</div>
	</aside>
	<div class="min-w-0">
		<header class="flex h-[74px] items-center justify-between border-b border-hairline bg-bg px-5 sm:px-8"><div class="flex items-center gap-3"><span class="font-mono text-[10px] uppercase tracking-[.17em] text-text-muted">Control center</span><span class="hidden h-4 w-px bg-hairline sm:block"></span><Badge tone="warning" variant="soft" size="sm">Fitur bertahap</Badge></div><details name="panel-menu" class="relative group"><summary class="flex h-9 w-9 cursor-pointer list-none items-center justify-center text-text-muted hover:bg-bg-alt hover:text-brand [&::-webkit-details-marker]:hidden" aria-label="Notifikasi"><Bell size={19} /></summary><div class="absolute right-0 top-full z-20 mt-2 w-72 border border-hairline bg-bg p-5 shadow-sm"><p class="text-sm font-medium">Notifikasi</p><p class="mt-3 border-t border-hairline pt-4 text-sm text-text-muted">Belum ada notifikasi.</p></div></details></header>
		<main class="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><Breadcrumb items={breadcrumbs} class="mb-7" />{@render children()}</main>
	</div>
</div>

<ConfirmDialog bind:open={confirmLogout} title="Keluar dari panel?" description="Sesi login Anda akan diakhiri. Anda perlu masuk kembali untuk membuka panel." tone="danger" confirmLabel="Ya, keluar" cancelLabel="Batal" onconfirm={() => new Promise<void>((resolve) => { finishLogout = resolve; logoutForm.requestSubmit(); })} />

<style>
	.active { border-left-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); font-weight: 500; }
</style>

