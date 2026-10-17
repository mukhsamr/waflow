<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Breadcrumb } from '@nqmcreative/ui/matte';
	let { eyebrow, title, children }: { eyebrow: string; title: string; children: Snippet } = $props();
</script>

<div class="grid min-h-screen bg-bg text-text lg:grid-cols-[minmax(0,1.06fr)_minmax(440px,.94fr)]">
	<aside class="relative hidden min-h-screen overflow-hidden bg-[#103d37] px-10 py-10 text-white lg:flex lg:flex-col xl:px-16">
		<div class="absolute inset-0 opacity-20" style="background-image: linear-gradient(#ffffff20 1px, transparent 1px), linear-gradient(90deg, #ffffff20 1px, transparent 1px); background-size: 52px 52px;"></div>
		<div class="relative z-10 flex items-center justify-between border-b border-white/25 pb-6">
			<a href="/" class="font-heading text-xl font-medium tracking-tight">waflow</a>
		</div>
		<div class="relative z-10 my-auto max-w-xl py-16">
			<h2 class="font-heading text-5xl font-medium leading-[1.09] tracking-tight xl:text-6xl">Kelola setiap koneksi WhatsApp dari satu panel.</h2>
		</div>
	</aside>
	<main class="flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-16 lg:py-10">
		<div class="flex items-center justify-between lg:justify-end"><a href="/" class="font-heading text-lg font-medium lg:hidden">waflow</a><span class="font-mono text-[10px] uppercase tracking-[.18em] text-text-muted">Akses operator</span></div>
		<Breadcrumb items={[{ label: 'Masuk' }]} class="mt-8" />
		<div class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
			<p class="font-mono text-[11px] uppercase tracking-[.2em] text-brand">{eyebrow}</p>
			<h1 class="mt-4 font-heading text-4xl font-medium tracking-tight">{title}</h1>
			<div class="mt-9">{@render children()}</div>
		</div>
	</main>
</div>
