<script lang="ts">
 import { onMount } from 'svelte';
 import { goto, invalidateAll } from '$app/navigation';
 import { ArrowDownLeft, ArrowUpRight, CircleCheck, CircleX } from '@lucide/svelte';
 import { Badge, Table } from '@nqmcreative/ui/matte';
 let { data } = $props();
 const labels: Record<string,string> = { queued:'Dalam antrean',sending:'Mengirim',sent:'Dikirim',received:'Pesan masuk',failed:'Gagal',unknown:'Hasil belum pasti' };
 const columns = [{key:'created_at',label:'Waktu',class:'whitespace-nowrap'},{key:'jid',label:'Sesi / penerima'},{key:'status',label:'Status'},{key:'wa_ack',label:'Receipt WA'},{key:'id',label:'ID / error',class:'max-w-80 break-all'}];
 const ack = (value: number) => value >= 4 ? 'Dibaca' : value === 3 ? 'Diterima perangkat' : value === 2 ? 'Diterima server WA' : value === -1 ? 'Ditolak WA' : 'Belum ada receipt';
 onMount(() => { const timer=setInterval(() => { if(document.visibilityState==='visible') void invalidateAll(); },5000); return () => clearInterval(timer); });
 const older = () => `/app/activity?${new URLSearchParams({ sessionId:data.sessionId,status:data.status,before:String(data.next?.before),beforeId:data.next?.beforeId ?? '' })}`;
 function filter(event: Event) {
  const form = (event.currentTarget as HTMLSelectElement).form!;
  void goto(`/app/activity?${new URLSearchParams(new FormData(form) as Iterable<[string,string]>)}`, { keepFocus: true, noScroll: true });
 }
</script>
<svelte:head><title>Log aktivitas · waflow</title></svelte:head>
<h1 class="font-heading text-3xl font-medium tracking-tight">Log aktivitas</h1>
{#if data.error}<p role="alert" class="mt-5 text-danger">{data.error}</p>{/if}
<div class="mt-8 grid gap-5 md:grid-cols-2">
 {#each [{ label:'Pesan keluar', icon:ArrowUpRight, color:'text-info', success:data.stats?.outgoing_success, failed:data.stats?.outgoing_failed },{ label:'Pesan masuk', icon:ArrowDownLeft, color:'text-accent', success:data.stats?.incoming_success, failed:data.stats?.incoming_failed }] as card}
 <section class="flex flex-wrap items-center justify-between gap-5 border border-hairline bg-bg p-5">
  <h2 class="flex items-center gap-2 font-heading text-base"><card.icon class={card.color} size={20} aria-hidden="true" />{card.label}</h2>
  <div class="flex items-center gap-5 text-sm">
   <p class="flex items-center gap-2"><CircleCheck class="text-success" size={16} aria-hidden="true" /><span class="text-text-muted">Sukses</span><span class="font-medium tabular-nums">{card.success ?? '—'}</span></p>
   <p class="flex items-center gap-2"><CircleX class="text-danger" size={16} aria-hidden="true" /><span class="text-text-muted">Gagal</span><span class="font-medium tabular-nums">{card.failed ?? '—'}</span></p>
  </div>
 </section>
 {/each}
</div>
<section class="mt-6 border border-hairline bg-bg">
 <form method="GET" class="flex flex-wrap gap-4 border-b border-hairline p-5">
  <select aria-label="Sesi" name="sessionId" value={data.sessionId} onchange={filter} class="border border-hairline bg-bg p-2 text-sm"><option value="">Semua sesi</option>{#each data.sessions as s}<option value={s.id}>{s.name}</option>{/each}</select>
  <select aria-label="Status" name="status" value={data.status} onchange={filter} class="border border-hairline bg-bg p-2 text-sm"><option value="">Semua status</option>{#each Object.entries(labels) as [value,label]}<option {value}>{label}</option>{/each}</select>
 </form>
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
