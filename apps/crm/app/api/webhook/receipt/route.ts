import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { handleApiError } from "@/lib/utils/errors";
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "@/lib/utils/config";
import { logger } from "@/lib/utils/logger";
import { createId } from "@paralleldrive/cuid2";

const ReceiptSchema = z.object({
  communicationId: z.string(),
  status: z.enum(["DELIVERED", "FAILED", "BOUNCED", "OPENED", "READ", "CLICKED", "CONVERTED"]),
  timestamp: z.coerce.date(),
});

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-xeno-signature") ?? "";

    // Verify HMAC signature — prevents spoofed callbacks
    if (!verifyWebhookSignature(rawBody, signature, config.WEBHOOK_SECRET)) {
      logger.warn({ signature }, "Webhook signature verification failed");
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid signature" } },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);
    const { communicationId, status, timestamp } = ReceiptSchema.parse(body);

    // Atomic transaction — update comm status and create event in one DB round trip
    await db.$transaction([
      db.communication.update({
        where: { id: communicationId },
        data: { status, updatedAt: new Date() },
      }),
      db.communicationEvent.create({
        data: {
          id: createId(),
          communicationId,
          eventType: status,
          timestamp,
        },
      }),
    ]);

    logger.debug({ communicationId, status }, "Webhook receipt processed");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
