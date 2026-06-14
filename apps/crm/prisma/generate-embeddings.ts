/**
 * generate-embeddings.ts
 *
 * One-time script to generate and store text-embedding-ada-002 embeddings
 * for every Product row in the database.
 *
 * Run after seeding:
 *   npx tsx prisma/generate-embeddings.ts
 *
 * Embeddings are stored in the `embedding` vector(1536) column added by
 * prisma/migrations/add-vector-columns.sql. The product-agent uses them
 * for cosine-similarity search to match campaigns to relevant products.
 */

import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const db = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Generate a 1536-dim embedding for a product description */
async function getProductEmbedding(product: {
  name: string;
  category: string;
  description: string;
  price: number;
}): Promise<number[]> {
  const text = [
    `Product: ${product.name}`,
    `Category: ${product.category}`,
    `Description: ${product.description}`,
    `Price: ₹${(product.price / 100).toFixed(0)}`,
  ].join(". ");

  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });

  return response.data[0]?.embedding ?? [];
}

/** Store embedding in the DB via raw SQL (Prisma doesn't support vector type natively) */
async function saveProductEmbedding(productId: string, embedding: number[]): Promise<void> {
  const vectorLiteral = `[${embedding.join(",")}]`;
  await db.$executeRawUnsafe(
    `UPDATE "Product" SET embedding = $1::vector WHERE id = $2`,
    vectorLiteral,
    productId
  );
}

/** Sleep helper for rate limiting */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🧠 Starting product embedding generation...\n");

  // Fetch all products without embeddings (or re-run all)
  const products = await db.product.findMany({
    select: { id: true, name: true, category: true, description: true, price: true },
  });

  console.log(`   Found ${products.length} products to embed\n`);

  let success = 0;
  let failed = 0;

  for (const product of products) {
    try {
      process.stdout.write(`   Embedding: ${product.name}...`);
      const embedding = await getProductEmbedding(product);
      await saveProductEmbedding(product.id, embedding);
      success++;
      process.stdout.write(` ✅\n`);

      // Rate limit: OpenAI ada-002 allows ~3000 RPM on most tiers
      // 50ms delay = 20 req/sec = well under limit, avoids 429s
      await sleep(50);
    } catch (err) {
      failed++;
      process.stdout.write(` ❌ ${(err as Error).message}\n`);

      // If rate limited, back off for 5 seconds
      if ((err as { status?: number })?.status === 429) {
        console.log("   ⏳ Rate limited — waiting 5 seconds...");
        await sleep(5000);
      }
    }
  }

  console.log(`\n✅ Embedding generation complete!`);
  console.log(`   Success: ${success} / ${products.length}`);
  if (failed > 0) console.log(`   Failed:  ${failed} (re-run to retry)`);

  // Verify: count products that now have embeddings
  const withEmbeddings = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint as count FROM "Product" WHERE embedding IS NOT NULL
  `;
  console.log(`\n   Products with embeddings in DB: ${withEmbeddings[0]?.count ?? 0}`);
}

main()
  .catch((err) => {
    console.error("❌ Embedding generation failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
