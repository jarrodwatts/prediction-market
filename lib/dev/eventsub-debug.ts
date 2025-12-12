export type EventSubWebhookRecord = {
  receivedAt: number;
  messageType: string;
  messageId?: string;
  timestamp?: string;
  subscriptionType?: string;
  broadcasterUserId?: string;
  signaturePresent?: boolean;
  signatureValid?: boolean;
  notes?: string;
};

// Simple in-memory ring buffer for local/dev debugging.
// This will not persist across server restarts or serverless instances.
const GLOBAL_KEY = "__pm_eventsub_webhooks" as const;

function getBuffer(): EventSubWebhookRecord[] {
  const g = globalThis as unknown as Record<string, unknown>;
  const existing = g[GLOBAL_KEY];
  if (Array.isArray(existing)) return existing as EventSubWebhookRecord[];
  const buf: EventSubWebhookRecord[] = [];
  g[GLOBAL_KEY] = buf;
  return buf;
}

export function recordEventSubWebhook(record: EventSubWebhookRecord): void {
  const buf = getBuffer();
  buf.push(record);

  // Keep last 200
  if (buf.length > 200) {
    buf.splice(0, buf.length - 200);
  }
}

export function getRecordedEventSubWebhooks(): EventSubWebhookRecord[] {
  return [...getBuffer()];
}
