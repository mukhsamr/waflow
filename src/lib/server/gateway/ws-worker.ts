import { EventEmitter } from 'node:events';

// Baileys uses the Node ws surface; Workers expose the WHATWG WebSocket instead.
export default class WorkerWebSocket extends EventEmitter {
  static readonly CONNECTING = WebSocket.CONNECTING;
  static readonly OPEN = WebSocket.OPEN;
  static readonly CLOSING = WebSocket.CLOSING;
  static readonly CLOSED = WebSocket.CLOSED;
  private readonly socket: WebSocket;

  constructor(url: string) {
    super();
    this.socket = new WebSocket(url);
    this.socket.binaryType = 'arraybuffer';
    this.socket.addEventListener('open', () => this.emit('open'));
    this.socket.addEventListener('message', (event) => this.emit('message', typeof event.data === 'string' ? event.data : Buffer.from(event.data)));
    this.socket.addEventListener('close', (event) => this.emit('close', event.code, Buffer.from(event.reason)));
    this.socket.addEventListener('error', () => this.emit('error', new Error('WebSocket transport error')));
  }

  get readyState() { return this.socket.readyState; }
  send(data: string | Uint8Array, callback?: (error?: Error) => void) {
    try { this.socket.send(data); callback?.(); }
    catch (error) { callback?.(error as Error); }
  }
  close() { this.socket.close(); }
}
