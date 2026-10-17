<script lang="ts">
 import { enhance, type SubmitFunction } from '$app/forms';
 import { untrack } from 'svelte';
 import { Plus, Pencil, RotateCw, Trash2, Copy } from '@lucide/svelte';
 import { Button, Input, Modal, Table } from '@nqmcreative/ui/matte';
 let { data, form } = $props();
 let mode = $state<'' | 'key' | 'edit' | 'rotate' | 'revoke'>('');
 let selected = $state({ id:'', name:'' });
 let name = $state('');
 let busy = $state(false);
 let showToken = $state(untrack(() => Boolean(form?.token)));
 let copying = $state(false);
 let copyState = $state('');
 let actionError = $state('');
 const columns = [{key:'name',label:'Nama'},{key:'token_preview',label:'Key'},{key:'actions',label:'Aksi',class:'w-40'}];
 function open(action: typeof mode, key = {id:'',name:''}) {
  if (busy) return;
  selected = key; name = key.name; actionError = ''; mode = action;
 }
 const submit: SubmitFunction = ({ cancel }) => {
  if (busy) { cancel(); return; }
  busy = true;
  return async ({ result, update }) => {
   try {
    await update();
    if (result.type === 'success') { mode = ''; showToken = Boolean(form?.token); copyState = ''; }
    else { actionError = result.type === 'failure' ? String(result.data?.message ?? 'Permintaan gagal.') : 'Permintaan gagal. Coba lagi.'; }
   } finally { busy = false; }
  };
 };
 async function copy() {
  if (copying || !form?.token) return;
  copying = true;
  try { await navigator.clipboard.writeText(form.token); copyState = 'Disalin'; }
  catch { copyState = 'Gagal menyalin. Salin key secara manual.'; }
  finally { copying = false; }
 }
</script>
<svelte:head><title>API key · waflow</title></svelte:head>
<div class="flex items-center justify-between gap-4"><h1 class="font-heading text-3xl font-medium tracking-tight">API key</h1><Button onclick={() => open('key')} disabled={busy}><Plus size={16} aria-hidden="true" />Buat API key</Button></div>
{#if data.loadError}<p class="mt-6 text-sm text-danger" role="alert">{data.loadError}</p>{/if}
<section class="mt-8 border border-hairline bg-bg">
 <Table {columns} rows={data.keys}>
  {#snippet cell({row,column})}
   {#if column.key === 'name'}{row.name}
   {:else if column.key === 'token_preview'}<code class="text-sm text-text-muted">{row.token_preview ? `••••••••${row.token_preview}` : '—'}</code>
   {:else}<div class="flex items-center gap-1">
    <Button variant="ghost" tone="neutral" size="sm" aria-label={`Rotate ${row.name}`} title="Rotate" disabled={busy} onclick={() => open('rotate',row)}><RotateCw size={16} aria-hidden="true" /></Button>
    <Button variant="ghost" tone="neutral" size="sm" aria-label={`Edit ${row.name}`} title="Edit" disabled={busy} onclick={() => open('edit',row)}><Pencil size={16} aria-hidden="true" /></Button>
    <Button variant="ghost" tone="danger" size="sm" aria-label={`Hapus ${row.name}`} title="Hapus" disabled={busy} onclick={() => open('revoke',row)}><Trash2 size={16} aria-hidden="true" /></Button>
   </div>{/if}
  {/snippet}
  {#snippet empty()}Belum ada API key.{/snippet}
 </Table>
</section>
<Modal open={Boolean(mode)} title={mode === 'key' ? 'Buat API key' : mode === 'edit' ? 'Edit API key' : mode === 'rotate' ? `Rotate ${selected.name}?` : `Hapus ${selected.name}?`} description={mode === 'rotate' ? 'Key lama langsung tidak berlaku. Perbarui key di aplikasi yang terhubung.' : mode === 'revoke' ? 'Aplikasi yang memakai key ini akan kehilangan akses.' : undefined} size="sm" onclose={() => { if (!busy) mode = ''; }}>
 {#if mode}
 <form method="POST" action={`?/${mode}`} use:enhance={submit} class="space-y-5">
  <input type="hidden" name="id" value={selected.id} />
  {#if mode === 'key' || mode === 'edit'}<div><label for="key-name" class="mb-2 block text-sm">Nama key</label><Input id="key-name" name="name" bind:value={name} required maxlength={80} disabled={busy} /></div>{/if}
  {#if actionError}<p role="alert" class="text-sm text-danger">{actionError}</p>{/if}
  <div class="flex justify-end gap-3"><Button type="button" tone="neutral" variant="soft" disabled={busy} onclick={() => mode = ''}>Batal</Button><Button type="submit" loading={busy} disabled={busy} tone={mode === 'revoke' ? 'danger' : 'brand'}>{mode === 'key' ? 'Buat' : mode === 'edit' ? 'Simpan' : mode === 'rotate' ? 'Rotate' : 'Hapus'}</Button></div>
 </form>
 {/if}
</Modal>
<Modal bind:open={showToken} title="API key baru" description="Salin key sekarang. Nilai lengkap hanya ditampilkan sekali." size="sm">
 {#if form?.token}<code class="block break-all border border-hairline bg-bg-alt p-4 text-sm">{form.token}</code><div class="mt-5 flex justify-end"><Button tone="neutral" variant="soft" loading={copying} disabled={copying} onclick={copy}><Copy size={16} aria-hidden="true" />Salin key</Button></div>{/if}
 {#if copyState}<p role="status" class="mt-3 text-sm">{copyState}</p>{/if}
</Modal>
