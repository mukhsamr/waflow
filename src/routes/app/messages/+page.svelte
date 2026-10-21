<script lang="ts">
 import { enhance, type SubmitFunction } from '$app/forms';
 import { onMount, untrack } from 'svelte';
 import { invalidateAll } from '$app/navigation';
 import { Send } from '@lucide/svelte';
 import { Badge, Button, Input, Table, Tabs, Textarea } from '@nqmcreative/ui/matte';
 let { data, form } = $props();
 let mode = $state(untrack(() => form && 'mode' in form ? form.mode : 'single'));
 let recipients = $state(untrack(() => form && 'recipients' in form ? form.recipients ?? '' : ''));
 const recipientCount = $derived(new Set(recipients.split(/\r?\n/).map(n => n.trim()).filter(Boolean)).size);
 let delaySeconds = $state(untrack(() => form && 'delaySeconds' in form ? form.delaySeconds ?? '5' : '5'));
 let busy = $state(false);
 let selected = $state(untrack(() => data.sessionId || data.sessions.find(s => s.status.state === 'connected')?.id || ''));
 let text = $state(untrack(() => form && 'text' in form ? form.text : ''));
 let key = $state(untrack(() => form && 'idempotencyKey' in form ? form.idempotencyKey : data.idempotencyKey));
 const connected = $derived(data.sessions.find(s => s.id === selected)?.status.state === 'connected');
 const labels: Record<string,string> = { queued:'Dalam antrean', sending:'Mengirim', sent:'Terkirim', failed:'Gagal', unknown:'Belum pasti' };
 const columns = [{key:'created_at',label:'Waktu'},{key:'jid',label:'Penerima'},{key:'session_name',label:'Sesi'},{key:'status',label:'Status'}];
 onMount(() => { const timer = setInterval(() => { if (document.visibilityState === 'visible' && !busy) void invalidateAll(); }, 5000); return () => clearInterval(timer); });
 const older = () => `/app/messages?${new URLSearchParams({ sessionId: data.sessionId, before: String(data.next?.before), beforeId: data.next?.beforeId ?? '' })}`;
 const send: SubmitFunction = ({ cancel }) => {
   if (busy || !connected) { cancel(); return; }
   busy = true;
   return async ({ result, update }) => { try { await update({ reset: false }); if (result.type === 'success') { text = ''; recipients = ''; key = crypto.randomUUID(); } } finally { busy = false; } };
 };
</script>
<svelte:head><title>Kirim Pesan · waflow</title></svelte:head>
<div class="flex flex-wrap items-center justify-between gap-4"><h1 class="font-heading text-3xl font-medium tracking-tight">Kirim Pesan</h1><a href="/app/api" class="text-sm text-brand hover:underline">Panduan API</a></div>
{#if data.error}<p role="alert" class="mt-5 text-danger">{data.error}</p>{/if}
<section class="mt-8 max-w-3xl border border-hairline bg-bg p-6">
 <fieldset disabled={busy} class="mb-6"><Tabs class="overflow-y-hidden" items={[{value:'single',label:'Single'},{value:'multiple',label:'Multiple'}]} bind:value={mode} /></fieldset>
 <form method="POST" action="?/send" use:enhance={send} class="space-y-5">
  <input type="hidden" name="mode" value={mode} />
  <input type="hidden" name="idempotencyKey" value={key} />
  <fieldset disabled={busy} class="space-y-5">
   <div><label for="send-session" class="mb-2 block text-sm">Sesi</label><select id="send-session" name="sessionId" bind:value={selected} required class="w-full border border-hairline bg-bg p-3 text-sm"><option value="" disabled>Pilih sesi</option>{#each data.sessions as s}<option value={s.id}>{s.name}{s.status.state !== 'connected' ? ' · Tidak terhubung' : ''}</option>{/each}</select></div>
   {#if mode === 'single'}
   <div><label for="recipient" class="mb-2 block text-sm">Nomor penerima</label><Input id="recipient" name="recipient" type="tel" pattern={'[1-9][0-9]{7,14}'} placeholder="62812xxxxxxxx" value={form && 'recipient' in form ? form.recipient : ''} required /></div>
   {:else}
   <div><label for="recipients" class="mb-2 block text-sm">Nomor penerima · satu per baris</label><Textarea id="recipients" name="recipients" bind:value={recipients} required maxlength={17000} rows={6} placeholder={'628123456789\n628987654321'} /><p class="mt-2 text-sm text-text-muted" aria-live="polite">{recipientCount}/100 nomor unik</p></div>
   <div><label for="delay-seconds" class="mb-2 block text-sm">Jeda antar pesan (detik)</label><Input id="delay-seconds" name="delaySeconds" type="number" min={1} max={3600} step={1} bind:value={delaySeconds} required /></div>
   {/if}
   <div><label for="text" class="mb-2 block text-sm">Teks</label><Textarea id="text" name="text" bind:value={text} required maxlength={4096} rows={5} /></div>
  </fieldset>
  {#if selected && !connected}<p class="text-sm text-warning">Hubungkan sesi sebelum mengirim.</p>{/if}
  {#if form && 'error' in form}<p role="alert" class="text-sm text-danger">{form.error}</p>{/if}
  {#if form && 'accepted' in form}<p role="status" class="text-sm text-success">{form.count} pesan masuk antrean.</p>{/if}
  <Button type="submit" variant="primary" loading={busy} disabled={busy || !connected || (mode === 'multiple' && (!recipientCount || recipientCount > 100))}><Send size={16} aria-hidden="true" /> {mode === 'multiple' ? `Kirim ke ${recipientCount} nomor` : 'Kirim pesan'}</Button>
 </form>
</section>
<section class="mt-8 border border-hairline bg-bg">
 <h2 class="border-b border-hairline p-5 font-heading text-xl">Riwayat pengiriman</h2>
 {#if data.logError}<p role="alert" class="p-5 text-sm text-danger">{data.logError}</p>{/if}
 <Table {columns} rows={data.logs}>
  {#snippet cell({row,column})}
   {#if column.key==='created_at'}<time class="whitespace-nowrap" datetime={new Date(row.created_at).toISOString()}>{new Date(row.created_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</time>
   {:else if column.key==='jid'}{row.jid.replace(/@.*$/, '')}
   {:else if column.key==='status'}<Badge size="sm" tone={row.status==='sent' ? 'success' : row.status==='failed' ? 'danger' : row.status==='unknown' ? 'warning' : 'neutral'}>{labels[row.status] ?? row.status}</Badge>{#if row.error}<p class="mt-2 text-xs text-danger">{row.error}</p>{/if}
   {:else}{row.session_name}{/if}
  {/snippet}
  {#snippet empty()}Belum ada pengiriman.{/snippet}
 </Table>
 {#if data.next}<div class="border-t border-hairline p-4"><a href={older()} class="text-sm text-brand hover:underline">Lebih lama</a></div>{/if}
</section>
