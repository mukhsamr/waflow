<script lang="ts">
 import { enhance, type SubmitFunction } from '$app/forms';
 import { invalidateAll } from '$app/navigation';
 import { onMount } from 'svelte';
 import { Webhook, Link2, Save, Trash2, Activity, Clock3, ShieldCheck } from '@lucide/svelte';
 import { Button, Input, Badge, Card, Field, Select, Switch, CheckboxGroup, Table, Alert, EmptyState } from '@nqmcreative/ui/matte';
 let { data, form } = $props();
 let busy = $state('');
 let selected = $state('');
 let endpoint = $state('');
 let enabled = $state(true);
 let events = $state<string[]>(['MESSAGES_UPSERT','MESSAGES_UPDATE','SEND_MESSAGE','CONNECTION_UPDATE']);
 const choices = [{value:'MESSAGES_UPSERT',label:'Pesan masuk'},{value:'MESSAGES_UPDATE',label:'Receipt / status pesan'},{value:'SEND_MESSAGE',label:'Hasil pengiriman'},{value:'CONNECTION_UPDATE',label:'Status koneksi'}];
 const options = $derived(choices.map(option => ({...option,disabled:Boolean(busy)})));
 const sessions = $derived(data.sessions.map(s => ({value:s.id,label:s.name})));
 const existing = $derived(data.configs.some(c => c.session_id === selected));
 const columns = [{key:'updated_at',label:'Waktu',class:'whitespace-nowrap'},{key:'event',label:'Sesi / event'},{key:'status',label:'Status'},{key:'attempts',label:'Percobaan'},{key:'id',label:'ID / error',class:'max-w-72 break-all'}];
 const labels: Record<string,string> = {pending:'Dalam antrean',delivered:'Diterima endpoint',failed:'Gagal',cancelled:'Dibatalkan'};
 function selectSession() {
  const config = data.configs.find(c => c.session_id === selected);
  endpoint = config?.url ?? ''; enabled = config ? Boolean(config.enabled) : true;
  events = config?.events ?? choices.map(c => c.value);
 }
 const submit: SubmitFunction = ({cancel,formData}) => {
  if (busy) { cancel(); return; }
  busy = String(formData.get('operation') ?? 'save');
  return async ({update}) => { try { await update({reset:false}); } finally { busy = ''; } };
 };
 onMount(() => { const timer=setInterval(() => { if(document.visibilityState==='visible' && !busy) void invalidateAll(); },5000); return () => clearInterval(timer); });
</script>

<svelte:head><title>Webhook · waflow</title></svelte:head>
<h1 class="font-heading text-3xl font-medium tracking-tight">Webhook</h1>
{#if data.error}<Alert tone="danger" class="mt-6">{data.error}</Alert>{/if}
{#if form && 'error' in form}<Alert tone="danger" class="mt-6">{form.error}</Alert>{/if}
{#if form && 'secret' in form}
 <Alert tone="success" title="Webhook tersimpan" class="mt-6">
  {#snippet icon()}<ShieldCheck size={18} aria-hidden="true" />{/snippet}
  <p>Simpan secret ini sekarang. Secret hanya ditampilkan sekali.</p>
  <code class="mt-3 block break-all select-all font-mono">{form.secret}</code>
 </Alert>
{:else if form && 'removed' in form}<Alert tone="success" class="mt-6">Webhook dicabut.</Alert>{/if}

<div class="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
 <Card>
  {#snippet header()}<div class="flex items-center gap-3"><Webhook size={19} class="text-brand" aria-hidden="true" /><h2 class="font-heading text-lg font-medium">Konfigurasi endpoint</h2></div>{/snippet}
  <form method="POST" action="?/save" use:enhance={submit} class="mt-3 space-y-6">
   <input type="hidden" name="enabled" value={enabled ? 'on' : ''} />
   {#each events as event}<input type="hidden" name="events" value={event} />{/each}
   <div class="space-y-5">
    <Field label="Sesi" for="session" required><Select id="session" name="sessionId" options={sessions} placeholder="Pilih sesi" bind:value={selected} onchange={selectSession} required disabled={Boolean(busy)} /></Field>
    <Field label="URL HTTPS" for="url" required><Input id="url" name="url" type="url" placeholder="https://example.com/webhook" bind:value={endpoint} required disabled={Boolean(busy)} /></Field>
   </div>
   <div class="border-y border-hairline py-5"><Switch label="Webhook aktif" bind:checked={enabled} disabled={Boolean(busy)} /></div>
   <CheckboxGroup legend="Event" bind:value={events} options={options} error={!events.length ? 'Pilih minimal satu event.' : undefined} />
   {#if existing}<Alert tone="warning">Menyimpan mengganti secret dan membatalkan delivery yang masih antre.</Alert>{/if}
   <div class="flex justify-end border-t border-hairline pt-5"><Button type="submit" variant="primary" loading={busy==='save'} disabled={Boolean(busy) || !selected || !events.length}><Save size={16} aria-hidden="true" /> Simpan webhook</Button></div>
  </form>
 </Card>
 <Card>
  {#snippet header()}<div class="flex items-center justify-between gap-3"><div class="flex items-center gap-3"><Link2 size={19} class="text-brand" aria-hidden="true" /><h2 class="font-heading text-lg font-medium">Endpoint tersimpan</h2></div><Badge tone="neutral" size="sm">{data.configs.length}</Badge></div>{/snippet}
  {#each data.configs as c}
   <div class="space-y-4 border-b border-hairline py-5 last:border-b-0 last:pb-0">
    <div class="flex flex-wrap items-center justify-between gap-3"><p class="font-medium">{c.session_name}</p><Badge size="sm" tone={c.enabled ? 'success' : 'neutral'}>{c.enabled ? 'Aktif' : 'Nonaktif'}</Badge></div>
    <code class="block break-all text-sm text-text-secondary">{c.url}</code>
    <div class="flex flex-wrap gap-2">{#each c.events as event}<Badge size="sm" tone="neutral">{choices.find(choice=>choice.value===event)?.label ?? event}</Badge>{/each}</div>
    <div class="flex items-center justify-end gap-2">
     <Button type="button" variant="soft" tone="neutral" disabled={Boolean(busy)} onclick={()=>{selected=c.session_id;selectSession();}}>Edit</Button>
     <form method="POST" action="?/remove" use:enhance={submit}><input type="hidden" name="sessionId" value={c.session_id} /><input type="hidden" name="operation" value={c.session_id} /><Button type="submit" variant="ghost" tone="danger" loading={busy===c.session_id} disabled={Boolean(busy)}><Trash2 size={15} aria-hidden="true" /> Cabut</Button></form>
    </div>
   </div>
  {:else}<EmptyState title="Belum ada webhook" bordered={false}>{#snippet icon()}<Link2 size={21} aria-hidden="true" />{/snippet}</EmptyState>{/each}
 </Card>
</div>
<Card class="mt-6" padded={false}>
 {#snippet header()}<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-5"><div class="flex items-center gap-3"><Activity size={19} class="text-brand" aria-hidden="true" /><h2 class="font-heading text-lg font-medium">Riwayat delivery</h2></div><Badge tone="neutral" size="sm">50 terbaru</Badge></div>{/snippet}
 <Table {columns} rows={data.deliveries}>
  {#snippet cell({row,column})}
   {#if column.key==='updated_at'}<time class="inline-flex items-center gap-2 text-xs" datetime={new Date(row.updated_at).toISOString()}><Clock3 size={14} class="text-text-muted" aria-hidden="true" />{new Date(row.updated_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</time>
   {:else if column.key==='event'}<p class="text-sm">{row.session_name}</p><code class="mt-1 block text-xs text-text-muted">{row.event}</code>
   {:else if column.key==='status'}<Badge size="sm" tone={row.status==='failed' ? 'danger' : row.status==='delivered' ? 'success' : row.status==='pending' ? 'warning' : 'neutral'}>{labels[row.status] ?? row.status}</Badge>
   {:else if column.key==='attempts'}<span class="text-sm">{row.attempts}/3</span>{#if row.http_status}<code class="mt-1 block text-xs text-text-muted">HTTP {row.http_status}</code>{/if}
   {:else}<code class="text-xs">{row.id}</code>{#if row.error}<p class="mt-2 text-xs text-danger">{row.error}</p>{/if}{/if}
  {/snippet}
  {#snippet empty()}<EmptyState title="Belum ada delivery" bordered={false}>{#snippet icon()}<Activity size={21} aria-hidden="true" />{/snippet}</EmptyState>{/snippet}
 </Table>
</Card>
