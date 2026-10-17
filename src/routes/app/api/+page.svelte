<script lang="ts">
 import { untrack } from 'svelte';
 import { page } from '$app/state';
 import { Table } from '@nqmcreative/ui/matte';
 import { Button, Field, Input, Select, Textarea } from '@nqmcreative/ui/matte';
 import { Copy } from '@lucide/svelte';
 import { requestExample } from '#lib/request-example.js';
 let { data } = $props();
 let sessionId = $state('');
 let recipient = $state('');
 let text = $state('');
 let requestId = $state(untrack(() => data.requestId));
 const example = $derived(requestExample(page.url.origin, sessionId, recipient, text, requestId));
 let copying = $state(false);
 let copyState = $state('');
 const sessions = $derived(data.sessions.map(session => ({ value:session.id, label:session.name })));
 function changed() { requestId = crypto.randomUUID(); copyState = ''; }
 async function copy() {
  if (!example || copying) return;
  copying = true;
  try { await navigator.clipboard.writeText(example.curl); copyState = 'Disalin'; }
  catch { copyState = 'Gagal menyalin. Salin contoh secara manual.'; }
  finally { copying = false; }
 }
 const endpoints = [['GET','/health','Kesehatan API'],['GET','/sessions','Daftar sesi'],['POST','/sessions','Buat sesi: { name }'],['GET','/sessions/:id/status','Status koneksi'],['POST','/sessions/:id/start','Mulai koneksi / QR'],['POST','/sessions/:id/reconnect','Sambung ulang'],['POST','/sessions/:id/logout','Logout WhatsApp'],['POST','/messages','Kirim teks'],['GET','/messages/logs','Log: sessionId, status, before, beforeId']];
 const columns = [{key:'method',label:'Metode'},{key:'path',label:'Endpoint'},{key:'label',label:'Fungsi'}];
 const rows = endpoints.map(([method,path,label])=>({id:path+method,method,path:'/api'+path,label}));
</script>
<svelte:head><title>Panduan API · waflow</title></svelte:head>
<h1 class="font-heading text-3xl font-medium tracking-tight">Panduan API</h1>
<section class="mt-8 border border-hairline bg-bg p-6"><h2 class="font-heading text-xl">Autentikasi</h2><p class="mt-3 text-sm">Buat API key di <a href="/app/api-keys" class="text-brand hover:underline">API key</a>. Kirim header <code>Authorization: Bearer API_KEY</code>.</p></section>
<div class="mt-6 grid items-start gap-6 xl:grid-cols-2">
<section class="min-w-0 border border-hairline bg-bg p-6">
 <h2 class="font-heading text-xl">Generator request</h2>
 {#if data.error}<p role="alert" class="mt-4 text-sm text-danger">{data.error}</p>{/if}
 <div class="mt-5 space-y-5">
  <Field label="Sesi" for="request-session" required><Select id="request-session" options={sessions} placeholder="Pilih sesi" bind:value={sessionId} onchange={changed} required /></Field>
  <Field label="Nomor tujuan" for="request-recipient" required><Input id="request-recipient" bind:value={recipient} oninput={changed} placeholder="62812xxxxxxxx" pattern={'[1-9][0-9]{7,14}'} inputmode="numeric" required /></Field>
  <Field label="Pesan" for="request-text" required><Textarea id="request-text" bind:value={text} oninput={changed} maxlength={4096} required /></Field>
 </div>
</section>
<section class="min-w-0 border border-hairline bg-bg p-6">
 <h2 class="font-heading text-xl">Hasil request</h2>
 <div class="mt-5 space-y-4">
   <div><h3 class="text-sm font-medium">POST</h3><code class="mt-2 block break-all text-sm">{example.url}</code></div>
   <div><h3 class="text-sm font-medium">JSON body</h3><pre class="mt-2 overflow-x-auto border border-hairline bg-bg-alt p-4 text-xs"><code>{example.body}</code></pre></div>
   <div><div class="flex items-center justify-between gap-3"><h3 class="text-sm font-medium">cURL (Bash)</h3><Button type="button" tone="neutral" variant="soft" size="sm" loading={copying} disabled={copying} onclick={copy}><Copy size={14} />Salin cURL</Button></div><pre class="mt-2 overflow-x-auto border border-hairline bg-bg-alt p-4 text-xs"><code>{example.curl}</code></pre></div>
   {#if copyState}<p role="status" class="text-sm">{copyState}</p>{/if}
   <p class="text-sm text-text-muted">Isi variabel API_KEY dengan key Anda. Respons 202 berarti masuk antrean. Gunakan idempotencyKey yang sama saat mencoba ulang request yang sama.</p>
  </div>
</section>
</div>
<section class="mt-6 border border-hairline bg-bg"><Table {columns} {rows}>{#snippet cell({column,value})}{#if column.key==='label'}{value}{:else}<code>{value}</code>{/if}{/snippet}</Table></section>
<section class="mt-6 border border-hairline bg-bg p-6">
 <h2 class="font-heading text-xl">Webhook</h2>
 <a href="/app/webhooks" class="mt-3 inline-block text-sm text-brand hover:underline">Konfigurasi webhook</a>
 <div class="mt-5 grid gap-6 lg:grid-cols-2">
  <div><h3 class="text-sm font-medium">Event</h3><dl class="mt-3 space-y-3 text-sm">
   <div><dt class="font-mono text-xs">MESSAGES_UPSERT</dt><dd class="mt-1 text-text-muted">Pesan masuk</dd></div>
   <div><dt class="font-mono text-xs">MESSAGES_UPDATE</dt><dd class="mt-1 text-text-muted">Receipt / status pesan</dd></div>
   <div><dt class="font-mono text-xs">SEND_MESSAGE</dt><dd class="mt-1 text-text-muted">Hasil pengiriman</dd></div>
   <div><dt class="font-mono text-xs">CONNECTION_UPDATE</dt><dd class="mt-1 text-text-muted">Status koneksi</dd></div>
  </dl></div>
  <div class="min-w-0"><h3 class="text-sm font-medium">Verifikasi signature</h3>
   <pre class="mt-3 overflow-x-auto border border-hairline bg-bg-alt p-4 text-xs"><code>HMAC-SHA256(secret, timestamp + "." + body)</code></pre>
   <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-text-muted">
    <li>Signature: <code class="break-all">X-Waflow-Signature</code></li><li>Timestamp: <code class="break-all">X-Waflow-Timestamp</code></li><li>Gunakan body mentah dan tolak timestamp kedaluwarsa.</li><li>Deduplikasi berdasarkan <code>eventId</code>.</li><li>Secret hanya tampil sekali saat disimpan.</li>
   </ul>
  </div>
 </div>
 <div class="mt-6 border-t border-hairline pt-5"><h3 class="text-sm font-medium">Pengiriman</h3><ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-text-muted"><li>Endpoint HTTPS publik dengan respons <code>2xx</code>.</li><li>Maksimal tiga percobaan pengiriman.</li><li>Redirect tidak diikuti.</li></ul></div>
</section>
