<script lang="ts">
 let { data } = $props();
</script>
<svelte:head><title>Pengaturan · waflow</title></svelte:head>
<h1 class="font-heading text-3xl font-medium tracking-tight">Pengaturan</h1>
<section class="mt-8 max-w-3xl border border-hairline bg-bg">
	<h2 class="border-b border-hairline px-6 py-5 font-heading text-xl font-medium">Profil</h2>
	<dl class="divide-y divide-hairline px-6"><div class="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt class="text-sm text-text-muted">Nama</dt><dd class="text-sm font-medium">{data.user.name}</dd></div><div class="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt class="text-sm text-text-muted">Email</dt><dd class="text-sm font-medium">{data.user.email}</dd></div><div class="grid gap-1 py-4 sm:grid-cols-[140px_1fr]"><dt class="text-sm text-text-muted">Peran</dt><dd class="text-sm font-medium">{data.user.role === 'owner' ? 'Pemilik' : 'Operator'}</dd></div></dl>
</section>
