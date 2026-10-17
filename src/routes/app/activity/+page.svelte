<script lang="ts">
 import { onMount } from 'svelte';
 import { invalidateAll } from '$app/navigation';
 import { Badge, Button, Table } from '@nqmcreative/ui/matte';
 let { data } = $props();
 const labels: Record<string,string> = { queued:'Dalam antrean',sending:'Mengirim',sent:'Dikirim',received:'Pesan masuk',failed:'Gagal',unknown:'Hasil belum pasti' };
 const columns = [{key:'created_at',label:'Waktu',class:'whitespace-nowrap'},{key:'jid',label:'Sesi / penerima'},{key:'status',label:'Status'},{key:'wa_ack',label:'Receipt WA'},{key:'id',label:'ID / error',class:'max-w-80 break-all'}];
 const ack = (value: number) => value >= 4 ? 'Dibaca' : value === 3 ? 'Diterima perangkat' : value === 2 ? 'Diterima server WA' : value === -1 ? 'Ditolak WA' : 'Belum ada receipt';
 onMount(() => { const timer=setInterval(() => { if(document.visibilityState==='visible') void invalidateAll(); },5000); return () => clearInterval(timer); });
 const older = () => `/app/activity?${new URLSearchParams({ sessionId:data.sessionId,status:data.status,before:String(data.next?.before),beforeId:data.next?.beforeId ?? '' })}`;
</script>
<svelte:head><title>Log aktivitas · waflow</title></svelte:head>
<h1 class="font-heading text-3xl font-medium tracking-tight">Log aktivitas</h1>
{#if data.error}<p role="alert" class="mt-5 text-danger">{data.error}</p>{/if}
<div class="mt-8 grid gap-px border border-hairline bg-hairline md:grid-cols-3">
 <div class="bg-bg p-6"><p class="text-sm text-text-muted">Dalam antrean</p><p class="mt-4 text-3xl">{data.stats?.pending ?? '—'}</p></div>
 <div class="bg-bg p-6"><p class="text-sm text-text-muted">Pesan masuk hari ini</p><p class="mt-4 text-3xl">{data.stats?.incoming ?? '—'}</p></div>
 <div class="bg-bg p-6"><p class="text-sm text-text-muted">Gagal / belum pasti</p><p class="mt-4 text-3xl">{data.stats?.attention ?? '—'}</p></div>
</div>
<section class="mt-6 border border-hairline bg-bg">
 <form method="GET" class="flex flex-wrap items-end gap-4 border-b border-hairline p-5"><div><label for="log-session" class="mb-2 block text-sm">Sesi</label><select id="log-session" name="sessionId" value={data.sessionId} class="border border-hairline bg-bg p-2 text-sm"><option value="">Semua sesi</option>{#each data.sessions as s}<option value={s.id}>{s.name}</option>{/each}</select></div><div><label for="log-status" class="mb-2 block text-sm">Status</label><select id="log-status" name="status" value={data.status} class="border border-hairline bg-bg p-2 text-sm"><option value="">Semua status</option>{#each Object.entries(labels) as [value,label]}<option {value}>{label}</option>{/each}</select></div><Button type="submit" variant="soft" tone="neutral">Tampilkan</Button></form>
 <Table {columns} rows={data.logs}>
  {#snippet cell({row,column})}
   {#if column.key==='created_at'}<time datetime={new Date(row.created_at).toISOString()}>{new Date(row.created_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</time>
   {:else if column.key==='jid'}<p>{row.session_name}</p><code class="text-xs text-text-muted">{row.jid}</code><p class="mt-1 text-xs">{row.direction==='incoming' ? 'Masuk' : 'Keluar'}</p>
   {:else if column.key==='status'}<Badge size="sm" tone={row.status==='failed' ? 'danger' : row.status==='unknown' ? 'warning' : row.status==='sent' || row.status==='received' ? 'success' : 'neutral'}>{labels[row.status] ?? row.status}</Badge>
   {:else if column.key==='wa_ack'}<span class="text-xs">{row.direction==='outgoing' ? ack(row.wa_ack) : '—'}</span>
   {:else}<code class="text-xs">{row.id}</code>{#if row.error}<p class="mt-2 text-xs text-danger">{row.error}</p>{/if}{/if}
  {/snippet}
  {#snippet empty()}Belum ada aktivitas.{/snippet}
 </Table>
 {#if data.next}<div class="border-t border-hairline p-4"><a href={older()} class="text-sm text-brand hover:underline">Log lebih lama</a></div>{/if}
</section>
