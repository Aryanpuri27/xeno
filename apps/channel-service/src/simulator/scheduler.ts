import { logger } from "../utils/logger";

// Delay ranges in milliseconds — makes analytics feel real with natural jitter
const DELAY_RANGES = {
  DELIVERED: [800, 3000],
  OPENED:    [5_000, 30_000],   // Shortened for demo: 5-30s instead of 30-120s
  CLICKED:   [3_000, 15_000],
  CONVERTED: [10_000, 60_000],
} as const;

function jitteredDelay(event: keyof typeof DELAY_RANGES): number {
  const [min, max] = DELAY_RANGES[event];
  return Math.floor(Math.random() * (max - min) + min);
}

async function sendCallback(
  url: string,
  communicationId: string,
  status: string,
  signPayload: (body: string) => string
): Promise<void> {
  const body = JSON.stringify({
    communicationId,
    status,
    timestamp: new Date().toISOString(),
  });

  try {
    logger.info({ communicationId, status, url }, "[CHANNEL] Firing webhook callback");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Xeno-Signature": signPayload(body),
      },
      body,
    });
    if (!response.ok) {
      logger.warn({ communicationId, status, httpStatus: response.status }, "[CHANNEL] Webhook returned non-OK");
    } else {
      logger.info({ communicationId, status }, "[CHANNEL] Webhook callback delivered");
    }
  } catch (err) {
    logger.warn({ communicationId, status, err }, "[CHANNEL] Webhook callback delivery failed");
  }
}

/**
 * Schedule a chain of callbacks for a single message with realistic jitter.
 * The cascade: DELIVERED → OPENED (60%) → CLICKED (30%) → CONVERTED (15%)
 * These percentages reflect realistic Nike email/WhatsApp engagement rates.
 */
export function scheduleCallbacks(
  webhookUrl: string,
  communicationId: string,
  outcome: "delivered" | "failed" | "bounced",
  signPayload: (body: string) => string
): void {
  const terminalStatus = outcome === "delivered" ? "DELIVERED" : outcome === "failed" ? "FAILED" : "BOUNCED";

  // Always fire DELIVERED/FAILED/BOUNCED first
  setTimeout(async () => {
    await sendCallback(webhookUrl, communicationId, terminalStatus, signPayload);

    if (outcome !== "delivered") return; // No further events for failed/bounced

    // ~60% open rate (of delivered)
    if (Math.random() < 0.6) {
      setTimeout(async () => {
        await sendCallback(webhookUrl, communicationId, "OPENED", signPayload);

        // ~30% click rate (of opened)
        if (Math.random() < 0.3) {
          setTimeout(async () => {
            await sendCallback(webhookUrl, communicationId, "CLICKED", signPayload);

            // ~15% conversion (of clicked)
            if (Math.random() < 0.15) {
              setTimeout(
                () => sendCallback(webhookUrl, communicationId, "CONVERTED", signPayload),
                jitteredDelay("CONVERTED")
              );
            }
          }, jitteredDelay("CLICKED"));
        }
      }, jitteredDelay("OPENED"));
    }
  }, jitteredDelay("DELIVERED"));
}
