type Outcome = "delivered" | "failed" | "bounced";

// Realistic delivery weights per channel — based on industry benchmarks
const CHANNEL_WEIGHTS: Record<string, Record<Outcome, number>> = {
  whatsapp: { delivered: 0.88, failed: 0.07, bounced: 0.05 },
  email:    { delivered: 0.72, failed: 0.15, bounced: 0.13 },
  sms:      { delivered: 0.80, failed: 0.12, bounced: 0.08 },
  rcs:      { delivered: 0.75, failed: 0.15, bounced: 0.10 },
};

export function simulateOutcome(channel: string): Outcome {
  const weights = CHANNEL_WEIGHTS[channel] ?? CHANNEL_WEIGHTS["email"]!;
  const rand = Math.random();

  let cumulative = 0;
  for (const [outcome, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (rand <= cumulative) return outcome as Outcome;
  }
  return "delivered";
}
