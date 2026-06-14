import { Router } from "express";
import { z } from "zod";
import { logger } from "../utils/logger";
import { simulateOutcome } from "../simulator/outcome";
import { scheduleCallbacks } from "../simulator/scheduler";
import { createHmac } from "crypto";

export const sendRouter = Router();

const SendSchema = z.object({
  communicationId: z.string(),
  campaignId: z.string(),
  customerId: z.string(),
  channel: z.enum(["whatsapp", "email", "sms", "rcs"]),
  message: z.string().min(1),
  subject: z.string().optional(),
  webhookUrl: z.string().url(),
});

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "dev-secret-change-me";

function signPayload(body: string): string {
  return `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")}`;
}

sendRouter.post("/send", async (req, res) => {
  logger.info({ body: req.body }, "[CHANNEL] POST /send received");

  try {
    const input = SendSchema.parse(req.body);
    const { communicationId, campaignId, channel, webhookUrl } = input;

    const outcome = simulateOutcome(channel);

    logger.info({
      step: "message_accepted",
      communicationId,
      campaignId,
      channel,
      outcome,
      webhookUrl,
    }, `[CHANNEL] ✅ Message accepted — outcome=${outcome}, callbacks will fire to ${webhookUrl}`);

    scheduleCallbacks(webhookUrl, communicationId, outcome, signPayload);

    res.json({
      success: true,
      communicationId,
      message: `Message accepted for ${channel} delivery`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ issues: error.issues, body: req.body }, "[CHANNEL] ❌ Validation failed");
      res.status(400).json({ error: "Invalid request", issues: error.issues });
      return;
    }
    logger.error({ error }, "[CHANNEL] ❌ Internal error processing send request");
    res.status(500).json({ error: "Internal server error" });
  }
});
