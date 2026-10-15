<script lang="ts">
 import { RadioTower, Send, Webhook, Activity, KeyRound, Code } from '@lucide/svelte';
 let { data } = $props();
 const shortcuts = [{ href:'/app/sessions', label:'Sesi WhatsApp', icon:RadioTower },{ href:'/app/messages', label:'Kirim teks', icon:Send },{ href:'/app/webhooks', label:'Webhook', icon:Webhook },{ href:'/app/activity', label:'Log aktivitas', icon:Activity },{ href:'/app/settings', label:'API key', icon:KeyRound },{ href:'/app/api', label:'Panduan API', icon:Code }];
</script>
<svelte:head><title>Ringkasan · waflow</title></svelte:head>
<h1 class="font-heading text-3xl font-medium tracking-tight">Ringkasan</h1>
<div class="mt-8 grid gap-px border border-hairline bg-hairline sm:grid-cols-3"><div class="bg-bg p-6"><p class="text-sm text-text-muted">Sesi terhubung</p><p class="mt-5 font-heading text-4xl">{data.activeSessions ?? '—'}</p></div><div class="bg-bg p-6"><p class="text-sm text-text-muted">Pesan hari ini</p><p class="mt-5 font-heading text-4xl">{data.stats?.today ?? '—'}</p></div><div class="bg-bg p-6"><p class="text-sm text-text-muted">Dalam antrean</p><p class="mt-5 font-heading text-4xl">{data.stats?.pending ?? '—'}</p></div></div>
<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{#each shortcuts as item}<a href={item.href} class="flex items-center gap-4 border border-hairline bg-bg p-6 text-sm hover:bg-brand-light"><item.icon size={21} class="text-brand" /> {item.label}</a>{/each}</div>
