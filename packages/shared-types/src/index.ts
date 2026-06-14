// Shared types between CRM app and channel service
// Import directly by path — no barrel re-exports

// ── Channel types ─────────────────────────────────────────────────────────────

export type Channel = "whatsapp" | "email" | "sms" | "rcs";

export type CampaignStatus =
  | "draft"
  | "review"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ── BullMQ job payloads ────────────────────────────────────────────────────────

export interface CampaignSendJob {
  campaignId: string;
  customerId: string;
  channel: Channel;
  message: string;
  subject?: string; // email only
  idempotencyKey: string; // `${campaignId}:${customerId}` — prevents duplicate sends
}

// ── Channel service request/response ─────────────────────────────────────────

export interface SendMessageRequest {
  communicationId: string;
  campaignId: string;
  customerId: string;
  channel: Channel;
  message: string;
  subject?: string;
  webhookUrl: string;
}

export interface SendMessageResponse {
  success: boolean;
  communicationId: string;
  message: string;
}

// ── Webhook callback ──────────────────────────────────────────────────────────

export type CommunicationEventType =
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "BOUNCED"
  | "OPENED"
  | "READ"
  | "CLICKED"
  | "CONVERTED";

export interface WebhookCallbackPayload {
  communicationId: string;
  status: CommunicationEventType;
  timestamp: string; // ISO date string
}

// ── Communication event constants (use instead of enum) ───────────────────────

export const CommunicationEvent = {
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
  BOUNCED: "BOUNCED",
  OPENED: "OPENED",
  READ: "READ",
  CLICKED: "CLICKED",
  CONVERTED: "CONVERTED",
} as const;
export type CommunicationEventValue =
  (typeof CommunicationEvent)[keyof typeof CommunicationEvent];
