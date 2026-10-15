export async function whatsappMessageId(id: string) {
 const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)));
 return Array.from(bytes.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export type Receipt = { waId: string; ack: number; jid: string };
