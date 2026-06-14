import { ai, AI_MODELS } from "@/lib/utils/ai-client";
import { getBrandMemory } from "@/lib/memory/brand";
import { AgentError } from "@/lib/utils/errors";
import { z } from "zod";
import type { ContentAgentOutput } from "@/types";

interface ContentAgentInput {
  channel: "whatsapp" | "email" | "sms" | "rcs";
  audienceDescription: string;
  products: string[];
  tone?: string;
  additionalInstruction?: string; // for "regenerate with feedback" flow
}

// Channel-specific constraints — hard limits enforced before returning
const CHANNEL_CONSTRAINTS = {
  whatsapp: { maxChars: 1024, supportsFormatting: true, supportsCTA: true, requiresSubject: false },
  email: { maxChars: 10000, supportsFormatting: true, supportsCTA: true, requiresSubject: true },
  sms: { maxChars: 160, supportsFormatting: false, supportsCTA: false, requiresSubject: false },
  rcs: { maxChars: 2000, supportsFormatting: true, supportsCTA: true, requiresSubject: false },
} as const;

const ContentOutputSchema = z.object({
  subject: z.string().optional(),
  headline: z.string().max(120),
  body: z.string(),
  cta: z.string().max(40),
  characterCount: z.number().int().nonnegative(),
});

/**
 * Content Agent — generates personalized Nike campaign message copy.
 * Brand voice is always injected. Channel constraints are always enforced.
 * Automatically retries once if SMS character limit is exceeded.
 */
export async function runContentAgent(
  input: ContentAgentInput,
  _retryCount = 0
): Promise<ContentAgentOutput> {
  const constraints = CHANNEL_CONSTRAINTS[input.channel];
  const brandMemory = await getBrandMemory();
  const tone = input.tone ?? brandMemory.brandTone;

  const systemPrompt = buildContentSystemPrompt(brandMemory.brandName, tone, constraints, input.channel);
  const userPrompt = buildContentUserPrompt(input);

  const response = await ai.chat.completions.create({
    model: AI_MODELS.large,
    temperature: 0.7, // Higher temp for creative, engaging copy
    response_format: { type: "json_object" }, // Forces valid JSON — no markdown fences
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message.content ?? "{}";

  let parsed: ContentAgentOutput;
  try {
    parsed = ContentOutputSchema.parse(JSON.parse(raw));
  } catch {
    throw new AgentError("Content agent returned malformed JSON");
  }

  // Hard enforce SMS character limit — retry once with stricter instruction
  if (input.channel === "sms" && parsed.characterCount > 160 && _retryCount === 0) {
    return runContentAgent(
      { ...input, tone: "extremely concise, plain text only, absolutely max 160 characters total" },
      1
    );
  }

  return parsed;
}

function buildContentSystemPrompt(
  brandName: string,
  tone: string,
  constraints: (typeof CHANNEL_CONSTRAINTS)[keyof typeof CHANNEL_CONSTRAINTS],
  channel: string
): string {
  return `You are a world-class CRM copywriter for ${brandName}.
Brand tone: ${tone}
Channel: ${channel}
Character limit: ${constraints.maxChars}
${constraints.requiresSubject ? "You MUST include a compelling subject line." : ""}
${channel === "sms" ? "NO formatting, NO emojis, NO links. Plain text only. Strictly under 160 chars." : ""}
${channel === "whatsapp" ? "Use emojis sparingly. Keep it conversational and energizing." : ""}

Output a JSON object with exactly these fields:
${constraints.requiresSubject ? '"subject": string (email subject line, max 60 chars),' : ""}
"headline": string (opening hook, max 80 chars),
"body": string (main message body),
"cta": string (call-to-action button text, max 30 chars, e.g. "Shop Now", "Explore Collection"),
"characterCount": number (total characters: headline + body + cta combined)`;
}

function buildContentUserPrompt(input: ContentAgentInput): string {
  const productList = input.products.slice(0, 3).join(", ");
  let prompt = `Write a ${input.channel} campaign for:\nAudience: ${input.audienceDescription}\nFeatured products: ${productList}\nGoal: Re-engage customers and drive a purchase.`;

  if (input.additionalInstruction) {
    prompt += `\n\nMarketer feedback: ${input.additionalInstruction}`;
  }

  return prompt;
}
