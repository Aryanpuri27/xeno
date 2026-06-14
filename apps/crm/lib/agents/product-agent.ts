import { db } from "@/lib/db/client";
import { ai, AI_MODELS } from "@/lib/utils/ai-client";
import { getEmbedding } from "@/lib/utils/embeddings";
import type { Product, ProductAgentOutput } from "@/types";

const VALID_CATEGORIES = [
  "running", "basketball", "lifestyle", "training", "apparel", "accessories",
] as const;

type Category = (typeof VALID_CATEGORIES)[number];

/**
 * Use an LLM to extract the intended product category from the full campaign goal.
 * This is more reliable than keyword regex because the goal explicitly names the product
 * ("introduce jacket", "promote running shoes", "push hoodies"), whereas the segment
 * description only describes the *audience*, not the product.
 */
async function inferProductCategory(goal: string): Promise<Category> {
  try {
    const res = await ai.chat.completions.create({
      model: AI_MODELS.fast,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You classify Nike marketing campaign goals into exactly one product category.
Valid categories: running, basketball, lifestyle, training, apparel, accessories

Rules:
- apparel  → jackets, hoodies, joggers, shorts, t-shirts, pants, sweatshirts, any clothing
- running  → running shoes, sneakers (general), air max, any footwear
- basketball → basketball shoes, court shoes
- lifestyle → casual sneakers, streetwear shoes
- training → gym shoes, cross-trainers, workout gear
- accessories → bags, socks, caps, water bottles

Respond with ONLY the single category word. Nothing else.`,
        },
        {
          role: "user",
          content: `Campaign goal: "${goal}"`,
        },
      ],
    });

    const raw = res.choices[0]?.message.content?.trim().toLowerCase() ?? "";
    const matched = VALID_CATEGORIES.find((c) => raw.includes(c));
    return matched ?? "running";
  } catch {
    // Keyword fallback if LLM call fails
    return keywordCategory(goal);
  }
}

function keywordCategory(text: string): Category {
  const lower = text.toLowerCase();
  if (lower.match(/jacket|hoodie|jogger|sweatshirt|shorts|t-shirt|apparel|clothing|pants/)) return "apparel";
  if (lower.match(/basketball|hoop|court/)) return "basketball";
  if (lower.match(/training|gym|workout|cross-train/)) return "training";
  if (lower.match(/lifestyle|casual|sneaker|streetwear/)) return "lifestyle";
  if (lower.match(/accessories|bag|sock|cap|bottle/)) return "accessories";
  if (lower.match(/running|run|marathon|jog/)) return "running";
  return "running";
}

/**
 * Product Agent — finds relevant Nike products using pgvector semantic search.
 * Uses cosine similarity against product descriptions to find the best matches.
 * Separates results into primary, cross-sell, and upsell buckets.
 *
 * Key improvement: category is now inferred from the full campaign GOAL via LLM,
 * not from the segment audience description (which doesn't mention the product).
 */
export async function runProductAgent(
  _legacyCategory: string,
  goal: string
): Promise<ProductAgentOutput> {
  // Infer category from the full goal — much more reliable than segment keyword inference
  const category = await inferProductCategory(goal);

  // Embed the goal for semantic search
  const queryEmbedding = await getEmbedding(goal);

  let similarProducts: Array<Product & { similarity: number }> = [];

  try {
    // pgvector cosine similarity search against product descriptions
    similarProducts = await db.$queryRaw<Array<Product & { similarity: number }>>`
      SELECT id, name, category, price, description, sku, "inStock",
             1 - (embedding <=> ${queryEmbedding}::vector) as similarity
      FROM "Product"
      WHERE "inStock" = true
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${queryEmbedding}::vector) > 0.5
      ORDER BY similarity DESC
      LIMIT 20
    `;
  } catch {
    // Fallback: embeddings not ready — use category-based DB query directly
    similarProducts = await directCategoryQuery(category);
  }

  // Primary: products in the intended category, ranked by semantic similarity
  let primaryProducts = similarProducts
    .filter((p) => p.category === category)
    .slice(0, 3);

  // If semantic search found nothing in the right category, query DB directly
  // (Never fall back to off-category products for primary recommendations)
  if (primaryProducts.length === 0) {
    primaryProducts = await directCategoryQuery(category, 3);
  }

  const primaryPrice = primaryProducts[0]?.price ?? 9999;

  // Cross-sell: different category, reasonably priced relative to primary
  const crossSellSuggestions = similarProducts
    .filter((p) => p.category !== category && p.price <= primaryPrice * 1.4)
    .slice(0, 2);

  // Upsell: same category, higher price tier
  const upsellSuggestions = similarProducts
    .filter((p) => p.category === category && p.price > primaryPrice)
    .slice(0, 2);

  return {
    primaryProducts,
    crossSellSuggestions,
    upsellSuggestions,
  };
}

async function directCategoryQuery(
  category: string,
  take = 10
): Promise<Array<Product & { similarity: number }>> {
  const products = await db.product.findMany({
    where: { inStock: true, category },
    take,
    orderBy: { price: "desc" },
  });
  return products.map((p) => ({ ...p, similarity: 0.8 }));
}
