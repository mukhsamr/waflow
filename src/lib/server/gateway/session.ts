import { DurableObject } from 'cloudflare:workers';
import makeWASocket, { BufferJSON, DisconnectReason, fetchLatestWaWebVersion, initAuthCreds, normalizeMessageContent, proto } from '@whiskeysockets/baileys';
import type { AuthenticationCreds, AuthenticationState, SignalDataSet, SignalDataTypeMap, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import type { MessageJob, MessageRow } from './messaging';
import { whatsappMessageId, type Receipt } from './message-identity';
import type { GatewayEvent } from './gateway-events';

export type SessionStatus = { state: 'new' | 'pairing' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'logged-out'; qr?: string; phone?: string; avatarUrl?: string; updatedAt: number; error?: string };

type SendResult = { status: 'sent' | 'unknown' | 'retry' | 'failed'; error?: string };
export class WaSession extends DurableObject<{ INCOMING_QUEUE: Queue<MessageJob> }> {
  private socket?: WASocket;
  private startPromise?: Promise<void>;
  private qr?: string;
  private qrExpiresAt = 0;
  private generation = 0;
  private retryAttempts = 0;
  private avatarPromise?: Promise<void>;
  private flushPromise?: Promise<void>;
  private sends = new Map<string, Promise<SendResult>>();
  private stopping = false;
  private alarmUpdate: Promise<void> = Promise.resolve();

  private scheduleAlarm(at: number): Promise<void> {
    const update = this.alarmUpdate.then(async () => {
      const current = await this.ctx.storage.getAlarm();
      if (current === null || at < current) await this.ctx.storage.setAlarm(at);
    });
    this.alarmUpdate = update.catch(() => {});
    return update;
  }

  private restartAfterPairing(): Promise<void> {
    this.logConnection('pairing-restart');
    this.setState('reconnecting');
    return this.scheduleAlarm(Date.now() + 1000);
  }

  private logConnection(event: string, details: Record<string, number | boolean | string | undefined> = {}): void {
    console.info({ component: 'wa-session', objectId: this.ctx.id.toString(), event, generation: this.generation, ...details });
  }

  private refreshAvatar(socket: WASocket): void {
    if (this.avatarPromise) return;
    const jid = socket.user?.id;
    if (!jid) return;
    const generation = this.generation;
    this.avatarPromise = (async () => {
      let url: string | undefined;
      try { url = await socket.profilePictureUrl(jid, 'preview', 5000); } catch { /* Some profiles have no visible photo. */ }
      if (generation !== this.generation) return;
      const avatarUrl = url?.startsWith('https://') ? url : undefined;
      this.ctx.storage.sql.exec("INSERT INTO state (key, value) VALUES ('avatar', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify({ url: avatarUrl, fetchedAt: Date.now() }));
    })().finally(() => { this.avatarPromise = undefined; });
    this.ctx.waitUntil(this.avatarPromise);
  }

  private retryDelay(): number {
    return Math.min(5 * 60_000, 30_000 * 2 ** Math.min(this.retryAttempts++, 4));
  }

  private storageFailed(socket?: WASocket): void {
    this.logConnection('credential-storage-failed');
    this.generation++;
    this.socket = undefined;
    this.setState('disconnected', 'Credential WhatsApp gagal disimpan. Koneksi dihentikan.');
    this.ctx.waitUntil(this.scheduleAlarm(Date.now() + this.retryDelay()));
    socket?.end(new Error('Credential storage failed'));
  }

  constructor(ctx: DurableObjectState, env: { INCOMING_QUEUE: Queue<MessageJob> }) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS auth (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS sent_messages (id TEXT PRIMARY KEY, status TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS incoming_outbox (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS receipt_outbox (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS gateway_outbox (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  async identify(sessionId: string): Promise<void> {
    this.ctx.storage.sql.exec("INSERT INTO state (key, value) VALUES ('session-id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", sessionId);
  }


  async incomingMessage(id: string): Promise<MessageRow | null> {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM incoming_outbox WHERE id = ?', id).toArray()[0];
    return row ? JSON.parse(row.value) as MessageRow : null;
  }

  async ackIncoming(id: string): Promise<void> {
    this.ctx.storage.sql.exec('DELETE FROM incoming_outbox WHERE id = ?', id);
  }

  async gatewayEvent(id: string): Promise<GatewayEvent | null> {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM gateway_outbox WHERE id = ?', id).toArray()[0];
    return row ? JSON.parse(row.value) : null;
  }
  async ackGatewayEvent(id: string): Promise<void> {
    this.ctx.storage.sql.exec('DELETE FROM gateway_outbox WHERE id = ?',id);
  }

  // Resolve only mappings actually learned by Baileys; never infer a phone from a LID.
  async peers(jids: string[]): Promise<Record<string, string[]>> {
    const result: Record<string, string[]> = {};
    for (const jid of jids.slice(0, 500)) {
      const match = jid.match(/^(\d+)(?::\d+)?@(lid|s\.whatsapp\.net)$/);
      if (!match) { result[jid] = [jid]; continue; }
      const [, user, domain] = match;
      const other = this.read<string>(`lid-mapping:${user}${domain === 'lid' ? '_reverse' : ''}`);
      result[jid] = domain === 'lid' && other ? [`${other}@s.whatsapp.net`, `${user}@lid`] : [`${user}@${domain}`, ...(other ? [`${other}@lid`] : [])];
    }
    return result;
  }

  async receipt(id: string): Promise<Receipt | null> {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM receipt_outbox WHERE id = ?', id).toArray()[0];
    return row ? JSON.parse(row.value) : null;
  }

  async ackReceipt(id: string, ack: number): Promise<void> {
    // A later read receipt must survive an earlier delivery consumer's acknowledgement.
    this.ctx.storage.sql.exec('DELETE FROM receipt_outbox WHERE id = ? AND json_extract(value, \'$.ack\') = ?', id, ack);
  }

  private storeReceipt(waId: string, jid: string, ack: number): void {
    if (!waId || !jid || ![-1, 2, 3, 4, 5].includes(ack) || jid.endsWith('@g.us')) return;
    const previous = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM receipt_outbox WHERE id = ?', waId).toArray()[0];
    if (previous) {
      const saved = JSON.parse(previous.value).ack;
      if ((ack === -1 && saved >= 3) || (ack !== -1 && (saved >= ack || (saved === -1 && ack === 2)))) return;
    }
    this.ctx.storage.sql.exec('INSERT INTO receipt_outbox (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value', waId, JSON.stringify({ waId, jid, ack }));
    this.ctx.waitUntil(this.flushIncoming().catch(() => {}));
  }

  private async stopConnectionAlarm(): Promise<void> {
    if (this.ctx.storage.sql.exec('SELECT 1 FROM incoming_outbox UNION ALL SELECT 1 FROM receipt_outbox UNION ALL SELECT 1 FROM gateway_outbox LIMIT 1').toArray().length) await this.scheduleAlarm(Date.now() + 120_000);
    else await this.ctx.storage.deleteAlarm();
  }

  private flushIncoming(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = (async () => {
      try {
        for (const row of this.ctx.storage.sql.exec<{ id: string; value: string }>('SELECT id, value FROM incoming_outbox LIMIT 100').toArray()) {
          const message = JSON.parse(row.value) as MessageRow & { publishedAt?: number };
          if (message.publishedAt && Date.now() - message.publishedAt < 120_000) continue;
          await this.env.INCOMING_QUEUE.send({ kind: 'incoming', id: message.id, sessionId: message.session_id });
          this.ctx.storage.sql.exec('UPDATE incoming_outbox SET value = ? WHERE id = ?', JSON.stringify({ ...message, publishedAt: Date.now() }), row.id);
        }
        const sessionId = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM state WHERE key = 'session-id'").toArray()[0]?.value;
        for (const row of this.ctx.storage.sql.exec<{ id: string; value: string }>('SELECT id,value FROM gateway_outbox LIMIT 100').toArray()) {
          const event = JSON.parse(row.value) as GatewayEvent & { publishedAt?: number };
          if (event.publishedAt && Date.now() - event.publishedAt < 120_000) continue;
          await this.env.INCOMING_QUEUE.send({ kind: 'session-event', id: row.id, sessionId: event.sessionId });
          this.ctx.storage.sql.exec('UPDATE gateway_outbox SET value = ? WHERE id = ?',JSON.stringify({ ...event, publishedAt: Date.now() }),row.id);
        }
        if (sessionId) for (const row of this.ctx.storage.sql.exec<{ id: string; value: string }>('SELECT id, value FROM receipt_outbox LIMIT 100').toArray()) {
          const receipt = JSON.parse(row.value) as Receipt & { publishedAt?: number };
          if (receipt.publishedAt && Date.now() - receipt.publishedAt < 120_000) continue;
          await this.env.INCOMING_QUEUE.send({ kind: 'receipt', id: row.id, sessionId });
          const current = await this.receipt(row.id);
          if (current?.ack === receipt.ack) this.ctx.storage.sql.exec('UPDATE receipt_outbox SET value = ? WHERE id = ?', JSON.stringify({ ...receipt, publishedAt: Date.now() }), row.id);
        }
      } finally {
        if (this.ctx.storage.sql.exec('SELECT 1 FROM incoming_outbox UNION ALL SELECT 1 FROM receipt_outbox UNION ALL SELECT 1 FROM gateway_outbox LIMIT 1').toArray().length) await this.scheduleAlarm(Date.now() + 120_000);
      }
    })().finally(() => { this.flushPromise = undefined; });
    return this.flushPromise;
  }

  async sendText(id: string, jid: string, text: string): Promise<SendResult> {
    if (this.stopping) return { status: 'retry', error: 'Sesi sedang dihentikan.' };
    const pending = this.sends.get(id);
    if (pending) return pending;
    const previous = this.ctx.storage.sql.exec<{ status: string }>('SELECT status FROM sent_messages WHERE id = ?', id).toArray()[0];
    if (previous) return previous.status === 'sent' ? { status: 'sent' } : { status: 'unknown', error: 'Hasil pengiriman belum pasti. Periksa WhatsApp sebelum mengirim lagi.' };
    if (!this.socket || this.state().state !== 'connected') {
      if (this.pairConfirmed()) await this.start();
      return { status: 'retry', error: 'Sesi belum terhubung setelah percobaan ulang.' };
    }
    const socket = this.socket;
    const operation = (async (): Promise<SendResult> => {
      // Persist before the side effect: an interrupted send must never be replayed automatically.
      this.ctx.storage.sql.exec("INSERT INTO sent_messages (id, status) VALUES (?, 'sending')", id);
      try {
        const messageId = await whatsappMessageId(id);
        await socket.sendMessage(jid, { text }, { messageId });
        this.ctx.storage.sql.exec("UPDATE sent_messages SET status = 'sent' WHERE id = ?", id);
        return { status: 'sent' };
      } catch (error) {
        // Stack frames locate runtime failures without recording message text or auth data.
        const frames = error instanceof Error ? error.stack?.split('\n').slice(1, 6) : [];
        this.ctx.storage.sql.exec("INSERT INTO state (key, value) VALUES ('send-diagnostic', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify({ name: error instanceof Error ? error.name : 'Error', frames }));
        this.ctx.storage.sql.exec("UPDATE sent_messages SET status = 'unknown' WHERE id = ?", id);
        return { status: 'unknown', error: 'Hasil pengiriman belum pasti. Periksa WhatsApp sebelum mengirim lagi.' };
      }
    })().finally(() => { this.sends.delete(id); });
    this.sends.set(id, operation);
    return operation;
  }

  private read<T>(key: string): T | null {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM auth WHERE key = ?', key).toArray()[0];
    return row ? JSON.parse(row.value, BufferJSON.reviver) as T : null;
  }

  private write(key: string, value: unknown): void {
    if (value === null) this.ctx.storage.sql.exec('DELETE FROM auth WHERE key = ?', key);
    else this.ctx.storage.sql.exec('INSERT INTO auth (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value, BufferJSON.replacer));
  }

  private state(): SessionStatus {
    const row = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM state WHERE key = 'status'").toArray()[0];
    return row ? JSON.parse(row.value) as SessionStatus : { state: 'new', updatedAt: Date.now() };
  }

  private setState(state: SessionStatus['state'], error?: string): void {
    const previous = this.state();
    const status: SessionStatus = { state, updatedAt: Date.now(), ...(error ? { error } : {}) };
    this.ctx.storage.sql.exec("INSERT INTO state (key, value) VALUES ('status', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(status));
    const sessionId = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM state WHERE key = 'session-id'").toArray()[0]?.value;
    if (sessionId && (previous.state !== state || previous.error !== error)) {
      const event: GatewayEvent = { id: `connection:${crypto.randomUUID()}`, sessionId, event: 'CONNECTION_UPDATE', occurredAt: status.updatedAt, data: { state, ...(error ? { error } : {}) } };
      this.ctx.storage.sql.exec('INSERT INTO gateway_outbox (id,value) VALUES (?,?)',event.id,JSON.stringify(event));
      this.ctx.waitUntil(this.flushIncoming().catch(() => {}));
    }
  }

  private pairConfirmed(): boolean {
    return this.state().state === 'connected' || Boolean(this.ctx.storage.sql.exec("SELECT 1 FROM state WHERE key = 'pair-confirmed'").toArray()[0]);
  }

  private clearUnconfirmedPairing(): void {
    this.logConnection('unconfirmed-pairing-cleared', { registered: Boolean(this.read<AuthenticationCreds>('creds')?.registered) });
    this.generation++;
    this.socket?.end(new Error('Unconfirmed pairing ended'));
    this.socket = undefined;
    this.qr = undefined;
    this.qrExpiresAt = 0;
    const wasRegistered = Boolean(this.read<AuthenticationCreds>('creds')?.registered);
    this.ctx.storage.sql.exec('DELETE FROM auth');
    this.ctx.storage.sql.exec("DELETE FROM state WHERE key = 'avatar'");
    this.setState(wasRegistered ? 'disconnected' : 'new', wasRegistered ? 'WhatsApp belum mengonfirmasi tautan perangkat. Coba QR lagi.' : undefined);
  }

  async status(sessionId?: string): Promise<SessionStatus> {
    if (sessionId) await this.identify(sessionId);
    const status = this.state();
    const jid = this.read<AuthenticationCreds>('creds')?.me?.id;
    const phone = jid?.match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/)?.[1];
    if (phone) status.phone = phone;
    const avatarRow = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM state WHERE key = 'avatar'").toArray()[0];
    const avatar = avatarRow ? JSON.parse(avatarRow.value) as { url?: string; fetchedAt: number } : null;
    if (avatar?.url) status.avatarUrl = avatar.url;
    if (this.socket && status.state === 'connected' && (!avatar || Date.now() - avatar.fetchedAt > 60 * 60_000)) this.refreshAvatar(this.socket);
    if (this.qr && Date.now() < this.qrExpiresAt && status.state === 'pairing') status.qr = this.qr;
    if (!this.socket && status.state === 'connected') return { ...status, state: 'reconnecting' };
    return status;
  }

  async start(): Promise<SessionStatus> {
    if (this.socket) {
      if (this.state().state === 'pairing' && (!this.qr || Date.now() >= this.qrExpiresAt)) return this.reconnect();
      return this.status();
    }
    if (this.read<AuthenticationCreds>('creds')?.registered && !this.pairConfirmed()) this.clearUnconfirmedPairing();
    if (!this.startPromise) this.startPromise = this.openSocket().finally(() => { this.startPromise = undefined; });
    await this.startPromise;
    return this.status();
  }

  async reconnect(): Promise<SessionStatus> {
    if (this.startPromise) await this.startPromise.catch(() => {});
    this.generation++;
    this.socket?.end(new Error('Reconnect requested'));
    this.socket = undefined;
    this.qr = undefined;
    this.qrExpiresAt = 0;
    this.setState('reconnecting');
    return this.start();
  }

  async relink(): Promise<SessionStatus> {
    await this.logout();
    return this.start();
  }

  async logout(): Promise<SessionStatus> {
    this.stopping = true;
    try {
      if (this.sends.size) await Promise.allSettled(this.sends.values());
      await this.flushIncoming().catch(() => {});
      if (this.startPromise) await this.startPromise.catch(() => {});
      this.generation++;
      const socket = this.socket;
      this.socket = undefined;
      this.qr = undefined;
      this.qrExpiresAt = 0;
      if (socket) await socket.logout().catch(() => socket.end(new Error('Logout requested')));
      this.ctx.storage.sql.exec('DELETE FROM auth');
      this.ctx.storage.sql.exec("DELETE FROM state WHERE key = 'avatar'");
      this.ctx.storage.sql.exec("DELETE FROM state WHERE key = 'pair-confirmed'");
      await this.stopConnectionAlarm();
      this.setState('logged-out');
      return this.status();
    } finally { this.stopping = false; }
  }

  async remove(): Promise<void> {
    await this.logout();
    await this.ctx.storage.deleteAll();
  }

  async alarm(): Promise<void> {
    await this.flushIncoming().catch(() => {});
    if (this.state().state === 'logged-out') return;
    if (!this.pairConfirmed()) {
      this.clearUnconfirmedPairing();
      return;
    }
    try {
      await this.start();
      await this.scheduleAlarm(Date.now() + 120_000);
    } catch {
      // openSocket already scheduled the bounded retry.
    }
  }

  private async openSocket(): Promise<void> {
    const generation = ++this.generation;
    const creds = this.read<AuthenticationCreds>('creds') ?? initAuthCreds();
    this.logConnection('socket-start', { registered: Boolean(creds.registered), pairConfirmed: this.pairConfirmed() });
    const auth: AuthenticationState = {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const values: Record<string, SignalDataTypeMap[T]> = {};
          for (const id of ids) {
            let value = this.read<SignalDataTypeMap[T]>(`${type}:${id}`);
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value as object) as unknown as SignalDataTypeMap[T];
            if (value) values[id] = value;
          }
          return values;
        },
        set: async (data: SignalDataSet) => {
          try {
            this.ctx.storage.transactionSync(() => {
              for (const [type, values] of Object.entries(data)) for (const [id, value] of Object.entries(values)) this.write(`${type}:${id}`, value);
            });
          } catch (error) {
            this.storageFailed(this.socket);
            throw error;
          }
        }
      }
    };
    this.setState(creds.registered ? 'reconnecting' : 'connecting');
    try {
      const { version } = await fetchLatestWaWebVersion({ signal: AbortSignal.timeout(10_000) });
      this.logConnection('web-version', { version: version.join('.') });
      const logger = pino({ level: 'silent' });
      const socket = makeWASocket({ auth, version, logger, printQRInTerminal: false, syncFullHistory: false });
      this.socket = socket;
      // sendMessage resolves after writing to the socket, not after the server ACK.
      socket.ws.on('CB:ack,class:message', (node: { attrs: { id?: string; from?: string; error?: string } }) => {
        if (generation !== this.generation) return;
        if (node.attrs.id && node.attrs.from) this.storeReceipt(node.attrs.id, node.attrs.from, node.attrs.error ? -1 : proto.WebMessageInfo.Status.SERVER_ACK);
      });
      socket.ev.on('messages.update', (updates) => {
        if (generation !== this.generation) return;
        for (const { key, update } of updates) {
          if (key.fromMe && key.id && key.remoteJid && typeof update.status === 'number') this.storeReceipt(key.id, key.remoteJid, update.status === proto.WebMessageInfo.Status.ERROR ? -1 : update.status);
        }
      });
      socket.ev.on('messages.upsert', ({ messages, type }) => {
        if (generation !== this.generation || type !== 'notify') return;
        const sessionId = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM state WHERE key = 'session-id'").toArray()[0]?.value;
        if (!sessionId) return;
        for (const message of messages) {
          if (message.key.fromMe || !message.key.id || !message.key.remoteJid || message.key.remoteJid === 'status@broadcast') continue;
          const content = normalizeMessageContent(message.message);
          const text = content?.conversation ?? content?.extendedTextMessage?.text;
          if (!text) continue;
          const now = Date.now();
          const timestamp = Number(message.messageTimestamp) * 1000;
          const row: MessageRow = { id: `in:${sessionId}:${message.key.remoteJid}:${message.key.id}`, session_id: sessionId, direction: 'incoming', jid: message.key.remoteJid, text, status: 'received', error: null, created_at: Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= now + 86_400_000 ? timestamp : now, updated_at: now };
          this.ctx.storage.sql.exec('INSERT OR IGNORE INTO incoming_outbox (id, value) VALUES (?, ?)', row.id, JSON.stringify(row));
        }
        this.ctx.waitUntil(this.flushIncoming().catch(() => {}));
      });
      socket.ev.on('creds.update', (update) => {
        if (generation !== this.generation) return;
        try {
          Object.assign(creds, update);
          this.write('creds', creds);
          if (update.registered !== undefined) this.logConnection('registration-updated', { registered: Boolean(creds.registered) });
        } catch {
          this.storageFailed(socket);
        }
      });
      socket.ev.on('connection.update', (update) => {
        if (generation !== this.generation) return;
        if (update.qr || update.isNewLogin || update.connection) this.logConnection('connection-update', {
          connection: update.connection, qrAvailable: Boolean(update.qr), newLogin: Boolean(update.isNewLogin),
          registered: Boolean(creds.registered), pairConfirmed: this.pairConfirmed(),
          disconnectCode: (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
        });
        if (update.isNewLogin || update.connection === 'open') this.ctx.storage.sql.exec("INSERT INTO state (key, value) VALUES ('pair-confirmed', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        if (update.qr) {
          this.qr = update.qr;
          if (!this.qrExpiresAt) {
            this.qrExpiresAt = Date.now() + 30_000;
            this.ctx.waitUntil(this.scheduleAlarm(this.qrExpiresAt));
          }
          this.setState('pairing');
        }
        if (update.connection === 'open') {
          this.retryAttempts = 0;
          this.qr = undefined;
          this.qrExpiresAt = 0;
          this.setState('connected');
          this.refreshAvatar(socket);
        }
        if (update.connection === 'close') {
          this.socket = undefined;
          this.qr = undefined;
          this.qrExpiresAt = 0;
          const code = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) {
            this.generation++;
            this.ctx.storage.sql.exec('DELETE FROM auth');
            this.ctx.storage.sql.exec("DELETE FROM state WHERE key = 'avatar'");
            this.ctx.storage.sql.exec("DELETE FROM state WHERE key = 'pair-confirmed'");
            this.setState('logged-out', `WhatsApp menolak atau mengakhiri sesi (${code}). Minta QR baru lalu coba lagi.`);
          } else if (code === DisconnectReason.restartRequired && this.pairConfirmed()) {
            this.ctx.waitUntil(this.restartAfterPairing());
          } else if (!this.pairConfirmed()) {
            this.clearUnconfirmedPairing();
            this.ctx.waitUntil(this.stopConnectionAlarm());
          } else {
            this.setState('reconnecting', code ? `Koneksi terputus (${code}).` : 'Koneksi terputus.');
            this.ctx.waitUntil(this.scheduleAlarm(Date.now() + this.retryDelay()));
          }
        }
      });
      if (creds.registered && this.pairConfirmed()) await this.scheduleAlarm(Date.now() + 120_000);
    } catch (error) {
      this.socket = undefined;
      this.logConnection('socket-start-failed', { registered: Boolean(creds.registered) });
      this.setState('disconnected', 'Gagal memulai koneksi WhatsApp. Coba sambungkan ulang.');
      if (creds.registered && this.pairConfirmed()) await this.scheduleAlarm(Date.now() + this.retryDelay());
      throw error;
    }
  }
}



