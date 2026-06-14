import { ai, AI_MODELS } from "@/lib/utils/ai-client";
import { db } from "@/lib/db/client";
import { AgentError } from "@/lib/utils/errors";
import type { SegmentAgentOutput } from "@/types";

// IMPORTANT: Prisma generates PostgreSQL tables with PascalCase names (quoted).
// Column names are camelCase (also quoted). Using wrong names = 42P01 "relation does not exist".
const SCHEMA_CONTEXT = `
CRITICAL: This is a Prisma-managed PostgreSQL database. All identifiers are case-sensitive.

Available tables — use EXACTLY these quoted names:
- "Customer" c  → c.id, c.name, c.email, c.phone, c.city, c.gender, c.age, c.tier, c."createdAt"
    tier values: 'standard', 'silver', 'gold', 'elite'
- "Order" o     → o.id, o."customerId", o."productId", o.amount, o.quantity, o."orderedAt"
- "Product" p   → p.id, p.name, p.category, p.price, p.sku, p."inStock"
    category values: 'running', 'basketball', 'lifestyle', 'training', 'apparel', 'accessories'

STRICT SQL RULES — violating any of these will cause a PostgreSQL error:
1. SELECT must be: c.id, c.name, c.email, MAX(o."orderedAt") as last_order_date
2. FROM clause: FROM "Customer" c JOIN "Order" o ON o."customerId" = c.id
   (only omit the JOIN if there is absolutely no order-related filter)
3. GROUP BY must be: GROUP BY c.id, c.name, c.email
4. WHERE clause: filters on NON-AGGREGATED columns only (c.id, c.name, c.tier, c.city, etc.)
   NEVER put aggregate functions (MAX, COUNT, AVG, SUM) in WHERE — use HAVING instead.
5. HAVING clause: filters on AGGREGATED values only, e.g.:
   HAVING MAX(o."orderedAt") < NOW() - INTERVAL '60 days'
   HAVING COUNT(o.id) >= 3
6. Time filters: use NOW() - INTERVAL '60 days' syntax (NOT DATE_TRUNC)
7. Output ONLY the raw SQL — no markdown, no backticks, no semicolons at the end
8. LIMIT: Only add LIMIT N if the user's request explicitly specifies a target audience size
   (e.g. "campaign for 100 users" → append LIMIT 100 at the very end, after GROUP BY / HAVING).
   Otherwise do NOT add LIMIT — the application controls it.
9. CORRELATED SUBQUERIES ARE FORBIDDEN. Never use EXISTS(...) or IN (SELECT ...) that references
   a column from the outer query's JOIN (e.g. o."productId", o.amount). This causes PostgreSQL
   error 42803. Instead, express such filters using a second JOIN or HAVING on aggregated values.
   WRONG:  HAVING EXISTS (SELECT 1 FROM "Order" o2 WHERE o2."productId" = o."productId" ...)
   WRONG:  WHERE o."productId" IN (SELECT id FROM "Product" p WHERE ...)
   RIGHT:  JOIN "Product" p ON p.id = o."productId" AND p.category = 'running'

EXAMPLE for "customers who haven't ordered in 60 days":
SELECT c.id, c.name, c.email, MAX(o."orderedAt") as last_order_date
FROM "Customer" c
JOIN "Order" o ON o."customerId" = c.id
WHERE c.id IS NOT NULL
GROUP BY c.id, c.name, c.email
HAVING MAX(o."orderedAt") < NOW() - INTERVAL '60 days'
`;

/**
 * Segment Agent — converts natural language audience description into validated SQL.
 * Runs the SQL against real data and returns count + sample before returning.
 * NEVER returns unvalidated SQL — validation is the whole point of this agent.
 */
export async function runSegmentAgent(description: string): Promise<SegmentAgentOutput> {
  const sqlResponse = await ai.chat.completions.create({
    model: AI_MODELS.fast,
    temperature: 0, // reproducible SQL
    messages: [
      {
        role: "system",
        content: `You are a PostgreSQL expert for Nike's CRM database.\n${SCHEMA_CONTEXT}`,
      },
      {
        role: "user",
        content: `Generate a SQL query for this audience: "${description}"`,
      },
    ],
  });

  const rawSQL = sqlResponse.choices[0]?.message.content?.trim() ?? "";
  if (!rawSQL) throw new AgentError("Segment agent produced empty SQL");

  // Sanitize LLM output: strip markdown fences, trailing semicolons
  const cleanSQL = rawSQL
    .replace(/^```sql?\n?/i, "")
    .replace(/```$/, "")
    .replace(/;\s*$/, "")
    .trim();

  // Extract user-specified LIMIT (if any) so we can re-apply it correctly.
  // Regex matches a trailing LIMIT clause at the end of the query.
  const limitMatch = cleanSQL.match(/\bLIMIT\s+(\d+)\s*$/i);
  const userLimit = limitMatch ? parseInt(limitMatch[1]!, 10) : null;
  // Strip the trailing LIMIT so we can control placement in each sub-use below
  const sqlWithoutLimit = limitMatch
    ? cleanSQL.slice(0, cleanSQL.lastIndexOf(limitMatch[0])).trimEnd()
    : cleanSQL;

  // Infer category from description for product agent downstream use
  const inferredCategory = inferCategory(description);

  // Validate — wrap in COUNT(*) subquery (safe, read-only).
  // We use sqlWithoutLimit inside the subquery so the COUNT reflects the full
  // matching set; the outer LIMIT 50000 just caps the scan cost.
  let count = 0;
  try {
    const countResult = await db.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM (${sqlWithoutLimit}) sub LIMIT 50000`
    );
    // If the user capped the audience, the real count is the minimum of both
    count = userLimit !== null
      ? Math.min(Number(countResult[0]?.count ?? 0), userLimit)
      : Number(countResult[0]?.count ?? 0);
  } catch (err) {
    throw new AgentError(`Segment SQL failed validation: ${(err as Error).message}`);
  }

  if (count === 0) {
    return {
      sql: cleanSQL,
      description,
      inferredCategory,
      count: 0,
      sample: [],
      estimatedReach: 0,
      warning: "No customers match this segment. The audience criteria may be too narrow.",
    };
  }

  // Sample 5 customers for the review screen.
  // Always use sqlWithoutLimit here to avoid a double-LIMIT syntax error.
  const sample = await db.$queryRawUnsafe<SegmentAgentOutput["sample"]>(
    `${sqlWithoutLimit} LIMIT 5`
  );

  // Persist cleanSQL (with the user's LIMIT if present) — this is what
  // launchCampaign() will execute verbatim to resolve the final audience.
  return { sql: cleanSQL, description, inferredCategory, count, sample, estimatedReach: count };
}

function inferCategory(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("running") || lower.includes("run")) return "running";
  if (lower.includes("basketball") || lower.includes("hoop")) return "basketball";
  if (lower.includes("training") || lower.includes("gym") || lower.includes("workout")) return "training";
  if (lower.includes("lifestyle") || lower.includes("sneaker") || lower.includes("casual")) return "lifestyle";
  if (lower.includes("apparel") || lower.includes("jacket") || lower.includes("hoodie")) return "apparel";
  if (lower.includes("accessories") || lower.includes("bag") || lower.includes("socks")) return "accessories";
  return "running"; // Nike default
}
