import OpenAI from "openai";
import { config } from "./config";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

/**
 * Generate a 1536-dimensional embedding using text-embedding-ada-002.
 * Used for: campaign memory semantic search, product similarity search.
 * Cost: ~$0.0001 per 1k tokens — very cheap at this scale.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text.slice(0, 8000), // ada-002 max input length
  });

  return response.data[0]?.embedding ?? [];
}
