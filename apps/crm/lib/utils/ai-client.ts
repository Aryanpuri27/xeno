import OpenAI from "openai";
import { config } from "./config";

/**
 * Shared OpenAI client — single instance reused across all agents.
 *
 * Model mapping:
 *   AI_MODELS.large → gpt-4o       (creative writing, analytics)
 *   AI_MODELS.fast  → gpt-4o-mini  (SQL generation, structured JSON)
 */
export const ai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

export const AI_MODELS = {
  /** High-capability model for complex reasoning and creative tasks */
  large: "gpt-4o",
  /** Fast, cheap model for structured output and SQL generation */
  fast: "gpt-4o-mini",
} as const;
