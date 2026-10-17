export const webhookEvents = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE'] as const;
export type WebhookEvent = typeof webhookEvents[number];
export type GatewayEvent = { id: string; sessionId: string; event: WebhookEvent; occurredAt: number; data: Record<string, unknown> };
