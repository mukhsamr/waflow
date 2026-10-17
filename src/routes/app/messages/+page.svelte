<script lang="ts">
 import { enhance, type SubmitFunction } from '$app/forms';
 import { untrack } from 'svelte';
 import { Send } from '@lucide/svelte';
 import { Button, Input, Textarea } from '@nqmcreative/ui/matte';
 let { data, form } = $props();
 let busy = $state(false);
 let selected = $state(untrack(() => data.sessionId || data.sessions.find(s => s.status.state === 'connected')?.id || ''));
 let text = $state('');
 let key = $state(untrack(() => form && 'idempotencyKey' in form ? form.idempotencyKey : data.idempotencyKey));
 const connected = $derived(data.sessions.find(s => s.id === selected)?.status.state === 'connected');
 const send: SubmitFunction = ({ cancel }) => {
   if (busy || !connected) { cancel(); return; }
   busy = true;
   return async ({ result, update }) => { try { await update({ reset: false }); if (result.type === 'success') { text = ''; key = crypto.randomUUID(); } } finally { busy = false; } };
 };
</script>
<svelte:head><title>Kirim teks · waflow</title></svelte:head>
<div class="flex flex-wrap items-center justify-between gap-4"><h1 class="font-heading text-3xl font-medium tracking-tight">Kirim teks</h1><a href="/app/api" class="text-sm text-brand hover:underline">Panduan API</a></div>
{#if data.error}<p role="alert" class="mt-5 text-danger">{data.error}</p>{/if}
<section class="mt-8 max-w-3xl border border-hairline bg-bg p-6">
 <form method="POST" action="?/send" use:enhance={send} class="space-y-5">
  <input type="hidden" name="idempotencyKey" value={key} />
  <fieldset disabled={busy} class="space-y-5">
   <div><label for="send-session" class="mb-2 block text-sm">Sesi</label><select id="send-session" name="sessionId" bind:value={selected} required class="w-full border border-hairline bg-bg p-3 text-sm"><option value="" disabled>Pilih sesi</option>{#each data.sessions as s}<option value={s.id}>{s.name}{s.status.state !== 'connected' ? ' · Tidak terhubung' : ''}</option>{/each}</select></div>
   <div><label for="recipient" class="mb-2 block text-sm">Nomor penerima</label><Input id="recipient" name="recipient" type="tel" pattern={'[1-9][0-9]{7,14}'} placeholder="62812xxxxxxxx" required /></div>
   <div><label for="text" class="mb-2 block text-sm">Teks</label><Textarea id="text" name="text" bind:value={text} required maxlength={4096} rows={5} /></div>
  </fieldset>
  {#if selected && !connected}<p class="text-sm text-warning">Hubungkan sesi sebelum mengirim.</p>{/if}
  {#if form && 'error' in form}<p role="alert" class="text-sm text-danger">{form.error}</p>{/if}
  {#if form && 'accepted' in form}<div role="status" class="border border-hairline bg-success-light p-4 text-sm"><p>Permintaan diterima: {form.status}</p><code class="mt-2 block break-all">{form.id}</code><a class="mt-3 inline-block text-brand hover:underline" href="/app/activity">Periksa hasil di log aktivitas</a></div>{/if}
  <Button type="submit" variant="primary" loading={busy} disabled={busy || !connected}><Send size={16} aria-hidden="true" /> Kirim teks</Button>
 </form>
</section>
