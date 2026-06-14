# AI Orchestrator & Memory Layer — Deep Dive

> This document explains exactly how the AI brain of the Xeno CRM works — the orchestrator's
> tool-use loop, every specialized agent, the two-tier memory system, and the learning loop
> that makes the platform improve over time. Read this before touching anything in `lib/agents/`
> or `lib/memory/`.

---

## Table of Contents

1. [Mental Model — What "AI-Native" Actually Means Here](#1-mental-model)
2. [The Orchestrator — How It Thinks](#2-the-orchestrator)
3. [The Tool-Use Loop — Step by Step](#3-the-tool-use-loop)
4. [Specialized Agents — What Each One Does](#4-specialized-agents)
5. [Prompt Engineering Rules](#5-prompt-engineering-rules)
6. [Memory Architecture — Overview](#6-memory-architecture)
7. [Brand Memory — What It Is and How It Works](#7-brand-memory)
8. [Campaign Memory — What It Is and How It Works](#8-campaign-memory)
9. [Vector Embeddings & Semantic Search Explained](#9-vector-embeddings--semantic-search)
10. [The Learning Loop — End to End](#10-the-learning-loop)
11. [State Management During a Run](#11-state-management-during-a-run)
12. [Streaming Orchestrator Thinking to the UI](#12-streaming-orchestrator-thinking-to-the-ui)
13. [Failure Modes & Guardrails](#13-failure-modes--guardrails)
14. [Full Annotated Code Reference](#14-full-annotated-code-reference)

---

## 1. Mental Model

Before writing any code, understand the fundamental shift this system makes.

### Traditional CRM (rule-based)

```
Marketer → picks segment from dropdown
         → writes message manually
         → picks channel manually
         → clicks launch
```

Every step requires human knowledge and manual effort. The system is a form renderer.

### This CRM (AI-native)

```
Marketer → types a business goal in plain English
         → AI reads past campaign memory
         → AI figures out the right audience
         → AI picks the best products
         → AI writes the message
         → AI recommends the best channel
         → Marketer reviews and approves
         → System launches
         → System learns from results
         → Next campaign is smarter
```

The marketer provides *intent*. The AI provides *execution*. The system gets *better over time*.

### What makes this different from "just calling GPT"

A naive implementation would take the marketer's goal and send it to GPT in one big prompt
asking for everything at once. That produces brittle, unverifiable output.

This system uses a **tool-use loop** — the AI is given a set of callable functions (tools)
and decides which ones to call, in what order, based on what it needs. Each tool call
produces verified, structured data (real SQL that ran against real data, real customer counts,
real channel performance stats). The AI's final plan is grounded in reality, not hallucinated.

---

## 2. The Orchestrator

### What it is

The Orchestrator is a single async function that:
1. Takes a marketer's natural language goal as input
2. Runs a conversation loop with GPT-4o using OpenAI's tool-use API
3. Lets GPT-4o decide which tools (agents) to call and in what order
4. Collects results from each tool call
5. Returns a validated, structured `ExecutionPlan` object

### What it is NOT

- It is NOT a hardcoded pipeline that always calls agents in the same order
- It is NOT a simple chat completion that returns free-form text
- It is NOT a separate microservice — it runs inside Next.js route handlers

### The conversation structure

The orchestrator maintains a growing list of messages (the conversation history) and keeps
sending it to GPT-4o until the model decides it has enough information and returns a final
JSON plan without any more tool calls.

```
Turn 1:  [system prompt + user goal] → model says "I need to check past campaigns first"
Turn 2:  [+ tool result: campaign memory] → model says "I need to find the right audience"
Turn 3:  [+ tool result: segment SQL + count] → model says "I need to pick products"
Turn 4:  [+ tool result: product list] → model says "now I can write the message"
Turn 5:  [+ tool result: message draft] → model says "final plan is ready" → returns JSON
```

The number of turns is NOT fixed. A simple goal might resolve in 3 turns. A complex one
with back-and-forth might take 6–7.

---

## 3. The Tool-Use Loop — Step by Step

This is the core mechanism. Understand this completely.

### How OpenAI tool-use works

When you call `openai.chat.completions.create()` with a `tools` array, the model can
respond in two ways:

**Option A — Normal response**: `message.tool_calls` is empty/undefined. The model is done.
You use `message.content` as the final output.

**Option B — Tool call response**: `message.tool_calls` contains one or more tool calls.
Each has a `function.name` and `function.arguments` (a JSON string). You must execute
those functions and send the results back as `role: "tool"` messages. Then call the API again.

You keep looping until Option A happens.

### The loop in code, fully annotated

```typescript
// lib/agents/orchestrator.ts

export async function runOrchestrator(
  goal: string,
  context: OrchestratorContext
): Promise<ExecutionPlan> {

  // The conversation history — grows with every turn
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      // The system prompt includes brand memory + recent campaign learnings
      // so the model has context before it even reads the user's goal
      content: buildSystemPrompt(context),
    },
    {
      role: "user",
      content: goal, // e.g. "Bring back dormant coffee customers"
    },
  ];

  // Safety limit — prevents infinite loops if model misbehaves
  const MAX_TURNS = 10;
  let turns = 0;

  while (turns < MAX_TURNS) {
    turns++;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,          // the list of available agent functions
      tool_choice: "auto",  // model decides whether to call tools or not
      temperature: 0.2,     // low temperature = deterministic planning
    });

    const message = response.choices[0]?.message;
    if (!message) throw new OrchestratorError("Model returned empty response");

    // ALWAYS append the assistant's message to history
    // This is critical — without it, the model loses context in the next turn
    messages.push(message);

    // No tool calls = model is done planning
    if (!message.tool_calls || message.tool_calls.length === 0) {
      // Parse the final JSON plan from message.content
      return parseExecutionPlan(message.content ?? "");
    }

    // Execute all tool calls the model requested
    // Some tool calls can run in parallel (product agent + channel agent don't depend on each other)
    // Others must run sequentially (content agent needs product agent output first)
    // We let GPT-4o handle this ordering — it batches independent calls in one turn
    const toolResults = await Promise.all(
      message.tool_calls.map(async (toolCall) => {
        // Stream this tool call event to the UI so the marketer sees AI thinking
        await emitOrchestratorEvent({
          type: "tool_call",
          tool: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });

        const result = await executeTool(
          toolCall.function.name,
          JSON.parse(toolCall.function.arguments)
        );

        await emitOrchestratorEvent({
          type: "tool_result",
          tool: toolCall.function.name,
          output: result,
        });

        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,  // must match the call ID exactly
          content: JSON.stringify(result),
        };
      })
    );

    // Add all tool results to history so model can use them in the next turn
    messages.push(...toolResults);
  }

  throw new OrchestratorError(`Orchestrator exceeded ${MAX_TURNS} turns without a final plan`);
}
```

### Why `messages.push(message)` before processing tool calls matters

The OpenAI API is **stateless**. It does not remember previous turns.
You must send the entire conversation history on every request.
If you forget to append the assistant's message (even when it has tool calls),
the model will see incomplete history on the next turn and produce garbage output.

### Tool call execution routing

```typescript
// lib/agents/tool-executor.ts

import { runSegmentAgent } from "./segment-agent";
import { runProductAgent } from "./product-agent";
import { runContentAgent } from "./content-agent";
import { runChannelAgent } from "./channel-agent";
import { getCampaignMemory } from "../memory/campaign";

type ToolName =
  | "run_segment_agent"
  | "run_product_agent"
  | "run_content_agent"
  | "run_channel_agent"
  | "get_campaign_memory";

// This is the router — maps tool names to actual functions
export async function executeTool(
  name: ToolName,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "run_segment_agent":
      return runSegmentAgent(args.description as string);

    case "run_product_agent":
      return runProductAgent(args.category as string, args.context as string);

    case "run_content_agent":
      return runContentAgent({
        channel: args.channel as Channel,
        audienceDescription: args.audienceDescription as string,
        products: args.products as string[],
        tone: args.tone as string | undefined,
      });

    case "run_channel_agent":
      return runChannelAgent(args.audienceDescription as string);

    case "get_campaign_memory":
      return getCampaignMemory(args.goal as string);

    default:
      throw new OrchestratorError(`Unknown tool: ${name}`);
  }
}
```

---

## 4. Specialized Agents — What Each One Does

Each agent is a focused function. It receives structured input, does one job,
and returns structured output. None of them "talk to GPT" on their own — they
are called by the orchestrator's tool-use loop.

---

### 4.1 Segment Agent

**Job**: Convert natural language into a valid, executable SQL query and return
a verified audience count + sample customers.

**Why it matters**: If the segment is wrong, everything downstream is wrong.
This is the most critical agent. It MUST run the SQL against the real database
before returning — never return unvalidated SQL.

```typescript
// lib/agents/segment-agent.ts

interface SegmentAgentInput {
  description: string; // "Coffee customers inactive for 60+ days"
}

interface SegmentAgentOutput {
  sql: string;
  count: number;
  sample: Array<{ id: string; name: string; email: string; lastOrderDate: string }>;
  estimatedReach: number; // same as count, used in ExecutionPlan
}

export async function runSegmentAgent(description: string): Promise<SegmentAgentOutput> {

  // Step 1: Generate SQL via a focused LLM call
  // Note: this is a SEPARATE, simple LLM call — not the orchestrator
  // We use a small, fast model for SQL generation (gpt-4o-mini is fine)
  const sqlResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a PostgreSQL expert. Generate a SELECT query for the customers table.
Available tables and columns:
- customers: id, name, email, phone, city, gender, created_at
- orders: id, customer_id, product_id, amount, ordered_at
- products: id, name, category, price

Rules:
- Always return a SELECT of customer id, name, email, and last_order_date
- Use parameterized values (no user input in the SQL)
- Output ONLY the SQL query, nothing else
- Always add: WHERE c.id IS NOT NULL (safety check)`,
      },
      {
        role: "user",
        content: `Generate a SQL query for: "${description}"`,
      },
    ],
  });

  const rawSQL = sqlResponse.choices[0]?.message.content?.trim() ?? "";
  if (!rawSQL) throw new AgentError("Segment agent produced empty SQL");

  // Step 2: Validate — run a COUNT query (safe, read-only)
  // Wrap in a subquery to safely count any SELECT statement
  let count = 0;
  try {
    const countResult = await db.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM (${rawSQL} LIMIT 50000) sub`
    );
    count = Number(countResult[0]?.count ?? 0);
  } catch (err) {
    // SQL was invalid — tell the orchestrator so it can retry
    throw new AgentError(`Segment SQL failed validation: ${(err as Error).message}`);
  }

  // Step 3: If count is 0, report it — do not silently proceed
  // The orchestrator will re-prompt with a broader description
  if (count === 0) {
    return {
      sql: rawSQL,
      count: 0,
      sample: [],
      estimatedReach: 0,
      // warning field gives the orchestrator context to adjust
      warning: "No customers match this segment. Consider broadening the criteria.",
    } as SegmentAgentOutput & { warning: string };
  }

  // Step 4: Fetch 5 sample customers for the review screen
  const sample = await db.$queryRawUnsafe<SegmentAgentOutput["sample"]>(
    `${rawSQL} LIMIT 5`
  );

  return { sql: rawSQL, count, sample, estimatedReach: count };
}
```

---

### 4.2 Product Agent

**Job**: Retrieve products relevant to the campaign goal using RAG (vector similarity search)
against the product catalog, then suggest cross-sell and upsell opportunities.

```typescript
// lib/agents/product-agent.ts

interface ProductAgentOutput {
  primaryProducts: Product[];
  crossSellSuggestions: Product[];
  upsellSuggestions: Product[];
}

export async function runProductAgent(
  category: string,
  context: string
): Promise<ProductAgentOutput> {

  // Generate an embedding for the campaign context
  // This lets us find semantically similar products, not just keyword matches
  const queryEmbedding = await getEmbedding(`${category} ${context}`);

  // pgvector cosine similarity search against product descriptions
  // Products were embedded at seed time using the same model (ada-002)
  const similarProducts = await db.$queryRaw<Product[]>`
    SELECT id, name, category, price, description,
           1 - (embedding <=> ${queryEmbedding}::vector) as similarity
    FROM products
    WHERE 1 - (embedding <=> ${queryEmbedding}::vector) > 0.75
    ORDER BY similarity DESC
    LIMIT 10
  `;

  // Separate into primary, cross-sell, upsell by category match + price tier
  const primaryProducts = similarProducts.filter(p => p.category === category).slice(0, 3);
  const crossSellSuggestions = similarProducts
    .filter(p => p.category !== category && p.price <= primaryProducts[0]?.price * 1.2)
    .slice(0, 2);
  const upsellSuggestions = similarProducts
    .filter(p => p.category === category && p.price > primaryProducts[0]?.price)
    .slice(0, 2);

  return { primaryProducts, crossSellSuggestions, upsellSuggestions };
}
```

---

### 4.3 Content Agent

**Job**: Generate personalized message copy for a specific channel, audience, and product set.
This agent calls GPT-4o with brand tone + channel constraints + product details.

```typescript
// lib/agents/content-agent.ts

interface ContentAgentInput {
  channel: "whatsapp" | "email" | "sms" | "rcs";
  audienceDescription: string;
  products: string[];
  tone?: string;
}

interface ContentAgentOutput {
  subject?: string;       // for email only
  headline: string;
  body: string;
  cta: string;            // call-to-action text
  characterCount: number; // important for SMS (160 char limit)
}

// Channel-specific constraints — content agent respects these hard limits
const CHANNEL_CONSTRAINTS = {
  whatsapp: { maxChars: 1024, supportsFormatting: true, supportsCTA: true },
  email:    { maxChars: 10000, supportsFormatting: true, supportsCTA: true, requiresSubject: true },
  sms:      { maxChars: 160, supportsFormatting: false, supportsCTA: false },
  rcs:      { maxChars: 2000, supportsFormatting: true, supportsCTA: true },
};

export async function runContentAgent(input: ContentAgentInput): Promise<ContentAgentOutput> {
  const constraints = CHANNEL_CONSTRAINTS[input.channel];
  const brandMemory = await getBrandMemory(); // inject brand tone

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7, // slightly higher for creative content generation
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a CRM content writer for ${brandMemory.brandName}.
Brand tone: ${brandMemory.brandTone}
Channel: ${input.channel}
Character limit: ${constraints.maxChars}
${constraints.requiresSubject ? "You must include a subject line." : ""}
${input.channel === "sms" ? "No formatting, emojis, or links. Plain text only." : ""}

Output a JSON object with these fields:
${constraints.requiresSubject ? '"subject": string (email subject line),' : ""}
"headline": string (opening hook, max 80 chars),
"body": string (main message body),
"cta": string (call-to-action, e.g. "Shop Now", "Claim Offer"),
"characterCount": number (total character count of headline + body + cta)`,
      },
      {
        role: "user",
        content: `Write a ${input.channel} message for: ${input.audienceDescription}
Featured products: ${input.products.join(", ")}
Goal: Re-engage and drive a purchase.`,
      },
    ],
  });

  const raw = response.choices[0]?.message.content ?? "{}";
  const parsed = JSON.parse(raw) as ContentAgentOutput;

  // Hard enforce SMS limit — if over, ask for a shorter version
  if (input.channel === "sms" && parsed.characterCount > 160) {
    // Recursive retry with stricter instruction — max one retry
    return runContentAgent({ ...input, tone: "extremely concise, max 160 chars" });
  }

  return parsed;
}
```

---

### 4.4 Channel Agent

**Job**: Recommend the best channel based on past performance data for this audience segment.
This is NOT a random recommendation — it uses real historical analytics from the database.

```typescript
// lib/agents/channel-agent.ts

interface ChannelAgentOutput {
  recommendedChannel: "whatsapp" | "email" | "sms" | "rcs";
  confidenceScore: number; // 0.0 to 1.0
  reasoning: string;
  channelStats: ChannelPerformance[];
}

interface ChannelPerformance {
  channel: string;
  avgOpenRate: number;
  avgCtr: number;
  avgDeliveryRate: number;
  sampleSize: number;
}

export async function runChannelAgent(
  audienceDescription: string
): Promise<ChannelAgentOutput> {

  // Step 1: Get real performance data from past campaigns
  const channelStats = await db.$queryRaw<ChannelPerformance[]>`
    SELECT
      c.channel,
      AVG(CASE WHEN ce.event_type = 'OPENED' THEN 1.0 ELSE 0.0 END) as "avgOpenRate",
      AVG(CASE WHEN ce.event_type = 'CLICKED' THEN 1.0 ELSE 0.0 END) as "avgCtr",
      AVG(CASE WHEN ce.event_type = 'DELIVERED' THEN 1.0 ELSE 0.0 END) as "avgDeliveryRate",
      COUNT(DISTINCT c.id) as "sampleSize"
    FROM communications c
    LEFT JOIN communication_events ce ON ce.communication_id = c.id
    GROUP BY c.channel
    HAVING COUNT(DISTINCT c.id) > 10
    ORDER BY "avgCtr" DESC
  `;

  // Step 2: If no data yet (new brand), use defaults
  if (channelStats.length === 0) {
    return {
      recommendedChannel: "whatsapp",
      confidenceScore: 0.5,
      reasoning: "No historical data available. Defaulting to WhatsApp (generally highest engagement).",
      channelStats: [],
    };
  }

  // Step 3: Ask the LLM to reason over the data and make a recommendation
  // The LLM is not guessing — it's interpreting real numbers
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a CRM channel optimization expert. Given performance data, 
recommend the best channel. Output JSON: 
{ "recommendedChannel": string, "confidenceScore": number, "reasoning": string }`,
      },
      {
        role: "user",
        content: `Audience: ${audienceDescription}
Channel performance data: ${JSON.stringify(channelStats, null, 2)}
Which channel should we use for this campaign and why?`,
      },
    ],
  });

  const recommendation = JSON.parse(response.choices[0]?.message.content ?? "{}");
  return { ...recommendation, channelStats };
}
```

---

### 4.5 Analytics Agent

**Job**: After a campaign completes, analyze its performance and generate natural language
insights. Also triggers the memory write-back (learning loop).

```typescript
// lib/agents/analytics-agent.ts

interface AnalyticsAgentOutput {
  summary: string;
  insights: string[];
  recommendations: string[];
  performanceVsBenchmark: "above" | "below" | "at" | "insufficient_data";
}

export async function runAnalyticsAgent(campaignId: string): Promise<AnalyticsAgentOutput> {
  const stats = await getFullCampaignStats(campaignId);
  const benchmarks = await getChannelBenchmarks(stats.channel);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a marketing analytics expert. Analyze campaign performance and generate 
actionable insights. Be specific — mention actual numbers. Output JSON:
{
  "summary": string (1 sentence overall verdict),
  "insights": string[] (3-5 specific findings),
  "recommendations": string[] (2-3 actionable next steps),
  "performanceVsBenchmark": "above" | "below" | "at" | "insufficient_data"
}`,
      },
      {
        role: "user",
        content: `Campaign stats: ${JSON.stringify(stats)}
Channel benchmarks: ${JSON.stringify(benchmarks)}
Analyze this campaign's performance.`,
      },
    ],
  });

  const analysis = JSON.parse(response.choices[0]?.message.content ?? "{}");

  // Trigger memory write-back — this is what makes the system learn
  // Fire and forget — don't await, analytics display shouldn't block on this
  writeCampaignMemory(campaignId, stats, analysis).catch((err) =>
    logger.error({ campaignId, err }, "Failed to write campaign memory")
  );

  return analysis;
}
```

---

## 5. Prompt Engineering Rules

These rules apply to every prompt in this codebase. Violating them leads to
inconsistent, hallucinated, or unsafely structured outputs.

### Rule 1: Always use `response_format: { type: "json_object" }` for structured output

Never ask the model to "return JSON" in the prompt text alone — it will sometimes wrap
it in markdown fences or add explanation text. Use the `response_format` parameter.

```typescript
// ✅ Forces JSON — parse directly without cleaning
const response = await openai.chat.completions.create({
  response_format: { type: "json_object" },
  messages: [...],
});
const data = JSON.parse(response.choices[0].message.content);

// ❌ Unreliable — model may return ```json ... ``` or add text before/after
const response = await openai.chat.completions.create({
  messages: [{ role: "user", content: "Return JSON: ..." }],
});
```

### Rule 2: Low temperature for planning/logic, higher for content creation

```
Orchestrator system prompt:  temperature: 0.2   (deterministic planning)
Segment SQL generation:       temperature: 0     (exact, reproducible SQL)
Channel recommendation:       temperature: 0     (data-driven, not creative)
Content generation:           temperature: 0.7   (varied, engaging copy)
Analytics insights:           temperature: 0.3   (specific but readable)
```

### Rule 3: Output schema in the system prompt, not the user prompt

The schema definition belongs in the system prompt where it frames the model's behavior
globally. The user prompt should contain only the variable input.

### Rule 4: Validate every LLM response with Zod before using it

```typescript
import { z } from "zod";

const ExecutionPlanSchema = z.object({
  segmentDescription: z.string(),
  segmentSQL: z.string(),
  audienceCount: z.number().int().nonnegative(),
  recommendedChannel: z.enum(["whatsapp", "email", "sms", "rcs"]),
  channelConfidence: z.number().min(0).max(1),
  messageDraft: z.string().min(1),
});

function parseExecutionPlan(raw: string): ExecutionPlan {
  const parsed = JSON.parse(raw);
  return ExecutionPlanSchema.parse(parsed); // throws ZodError if model output is malformed
}
```

### Rule 5: Never put database values directly into prompts

Always summarize or transform DB data before injecting into prompts.
Raw DB records in prompts waste tokens and can leak sensitive data (emails, phone numbers).

```typescript
// ❌ Leaks PII and wastes tokens
content: `Customers: ${JSON.stringify(allCustomers)}` // 500 customer records in a prompt

// ✅ Summarized — what the model actually needs
content: `Audience: 421 dormant coffee customers. Last purchase: 60-90 days ago. City: Delhi (60%), Mumbai (40%).`
```

---

## 6. Memory Architecture — Overview

The system has two types of memory. They solve different problems.

```
┌─────────────────────────────────────────────────────────┐
│                    Memory System                         │
│                                                         │
│  ┌───────────────────┐    ┌──────────────────────────┐  │
│  │   Brand Memory    │    │    Campaign Memory        │  │
│  │                   │    │                          │  │
│  │ What this brand   │    │ What worked in past      │  │
│  │ is like, always   │    │ campaigns, retrieved by  │  │
│  │                   │    │ semantic similarity      │  │
│  │ Storage: JSON     │    │                          │  │
│  │ in PostgreSQL     │    │ Storage: pgvector        │  │
│  │                   │    │ (embeddings in DB)       │  │
│  │ Retrieved:        │    │                          │  │
│  │ always injected   │    │ Retrieved: top-3 most    │  │
│  │ into system prompt│    │ similar to current goal  │  │
│  └───────────────────┘    └──────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Brand Memory** = long-term identity. Static-ish. Updated manually or after major strategy changes.

**Campaign Memory** = episodic learning. Grows after every campaign. Retrieved contextually.

---

## 7. Brand Memory — What It Is and How It Works

### What it stores

```typescript
interface BrandMemory {
  brandName: string;
  brandTone: "Premium" | "Casual" | "Playful" | "Professional" | "Urgent";
  preferredChannels: ("whatsapp" | "email" | "sms" | "rcs")[];
  bestPerformingCategories: string[];
  avoidTopics: string[];
  ctaStyle: "discount-first" | "value-first" | "urgency-first";
  targetDemographic: string;
}
```

### Example brand memory object

```json
{
  "brandName": "BrewCraft Coffee",
  "brandTone": "Casual",
  "preferredChannels": ["whatsapp", "email"],
  "bestPerformingCategories": ["cold-brew", "espresso", "subscription"],
  "avoidTopics": ["competitor comparisons", "heavy discounting"],
  "ctaStyle": "value-first",
  "targetDemographic": "urban professionals, 25-40, health-conscious"
}
```

### Storage

Brand Memory is stored as a JSON column in a `settings` table in PostgreSQL.
It is NOT stored as a vector — there is no similarity search needed.
Every campaign run retrieves it unconditionally.

```prisma
model Settings {
  id          String @id @default(cuid())
  key         String @unique
  value       Json
  updatedAt   DateTime @updatedAt
}
```

### How it is used

```typescript
// lib/memory/brand.ts

export async function getBrandMemory(): Promise<BrandMemory> {
  const setting = await db.settings.findUnique({
    where: { key: "brand_memory" },
  });

  if (!setting) {
    // Return sensible defaults for a new brand — don't crash
    return {
      brandName: "Your Brand",
      brandTone: "Professional",
      preferredChannels: ["whatsapp"],
      bestPerformingCategories: [],
      avoidTopics: [],
      ctaStyle: "value-first",
      targetDemographic: "general",
    };
  }

  return setting.value as BrandMemory;
}

export async function updateBrandMemory(patch: Partial<BrandMemory>): Promise<void> {
  const current = await getBrandMemory();
  await db.settings.upsert({
    where: { key: "brand_memory" },
    update: { value: { ...current, ...patch } },
    create: { key: "brand_memory", value: { ...current, ...patch } },
  });
}
```

### When it is injected

Brand memory is injected into the **orchestrator's system prompt** before any campaign run.
This means the model knows the brand's identity, preferred channels, and tone constraints
before it reads the marketer's goal.

```typescript
export function buildSystemPrompt(ctx: OrchestratorContext): string {
  return `You are the campaign planning AI for ${ctx.brandMemory.brandName}.

## Brand identity
Tone: ${ctx.brandMemory.brandTone}
Preferred channels: ${ctx.brandMemory.preferredChannels.join(", ")}
Best categories: ${ctx.brandMemory.bestPerformingCategories.join(", ")}
Avoid: ${ctx.brandMemory.avoidTopics.join(", ")}
CTA style: ${ctx.brandMemory.ctaStyle}

## Past campaign learnings (most similar to current goal)
${ctx.campaignMemories.map((m, i) =>
  `${i + 1}. ${m.summary} → CTR: ${m.ctr}%, Open rate: ${m.openRate}%, Best channel: ${m.bestChannel}`
).join("\n")}

[... rest of system prompt ...]`;
}
```

---

## 8. Campaign Memory — What It Is and How It Works

### What it stores

Each row represents a single completed campaign and what was learned from it.

```typescript
interface CampaignMemoryRecord {
  id: string;
  campaignId: string;
  summary: string;         // human-readable paragraph describing the campaign and results
  ctr: number;             // click-through rate (%)
  openRate: number;        // open rate (%)
  deliveryRate: number;    // delivery rate (%)
  bestChannel: string;     // which channel performed best
  audienceSize: number;    // how many customers were targeted
  topProduct: string;      // product with most conversions
  embedding: number[];     // 1536-dimensional vector of the summary text
  createdAt: Date;
}
```

### The summary field is critical

The summary is what gets embedded into a vector. It must be information-dense —
it's both the human-readable record AND the thing the semantic search will find.

```typescript
// Good summary — captures campaign identity + outcomes
"Campaign 'Wake Up Coffee Lovers' targeted 382 dormant cold brew customers
inactive for 60+ days. Sent via WhatsApp. CTR: 14.2%, Open rate: 68%, 
Delivery rate: 91%. Cold Brew 500ml was the top converting product. 
Best send time was 9 AM. Audience was predominantly Delhi (55%), female (60%)."

// Bad summary — too vague for semantic search
"A coffee campaign that did well on WhatsApp."
```

### How campaign memory is written

```typescript
// lib/memory/campaign.ts

export async function writeCampaignMemory(
  campaignId: string,
  stats: CampaignStats,
  analysis: AnalyticsAgentOutput
): Promise<void> {

  // Build a rich, information-dense summary
  const summary = buildMemorySummary(campaignId, stats, analysis);

  // Generate embedding using OpenAI ada-002
  // ada-002 produces 1536-dimensional vectors — matches pgvector column definition
  const embedding = await getEmbedding(summary);

  // Upsert — if this campaign already has a memory entry, update it
  await db.$executeRaw`
    INSERT INTO campaign_memories (
      id, campaign_id, summary, ctr, open_rate, delivery_rate,
      best_channel, audience_size, top_product, embedding, created_at
    ) VALUES (
      ${cuid()}, ${campaignId}, ${summary},
      ${stats.ctr}, ${stats.openRate}, ${stats.deliveryRate},
      ${stats.channel}, ${stats.totalSent}, ${stats.topProduct},
      ${embedding}::vector, NOW()
    )
    ON CONFLICT (campaign_id)
    DO UPDATE SET
      summary = EXCLUDED.summary,
      ctr = EXCLUDED.ctr,
      open_rate = EXCLUDED.open_rate,
      embedding = EXCLUDED.embedding
  `;
}

function buildMemorySummary(
  campaignId: string,
  stats: CampaignStats,
  analysis: AnalyticsAgentOutput
): string {
  return `Campaign "${stats.campaignName}" targeted ${stats.audienceDescription}. ` +
    `Audience size: ${stats.totalSent} customers. Channel: ${stats.channel}. ` +
    `CTR: ${stats.ctr.toFixed(1)}%. Open rate: ${stats.openRate.toFixed(1)}%. ` +
    `Delivery rate: ${stats.deliveryRate.toFixed(1)}%. ` +
    `Top product: ${stats.topProduct}. ` +
    `AI verdict: ${analysis.summary}`;
}
```

### How campaign memory is retrieved

```typescript
// lib/memory/campaign.ts (continued)

export async function getCampaignMemory(
  currentGoal: string,
  limit = 3
): Promise<CampaignMemoryRecord[]> {

  // Step 1: Embed the current goal
  // This creates a vector representation of what we're TRYING to do right now
  const goalEmbedding = await getEmbedding(currentGoal);

  // Step 2: Find the most semantically similar past campaigns
  // <=> is the pgvector cosine distance operator (lower = more similar)
  // 1 - distance = similarity score (0 = opposite, 1 = identical)
  const memories = await db.$queryRaw<CampaignMemoryRecord[]>`
    SELECT
      *,
      1 - (embedding <=> ${goalEmbedding}::vector) as similarity_score
    FROM campaign_memories
    WHERE 1 - (embedding <=> ${goalEmbedding}::vector) > 0.7
    ORDER BY embedding <=> ${goalEmbedding}::vector
    LIMIT ${limit}
  `;

  return memories;
}
```

---

## 9. Vector Embeddings & Semantic Search Explained

This section explains the concepts for anyone unfamiliar with how pgvector works.

### What is a vector embedding?

An embedding is a list of numbers (a vector) that represents the meaning of a piece of text.
Texts with similar meanings produce similar vectors. This allows us to search by meaning,
not by exact keyword match.

```
"dormant coffee customers" → [0.21, -0.54, 0.83, 0.12, ...] (1536 numbers)
"inactive cold brew buyers" → [0.22, -0.52, 0.81, 0.14, ...] (very similar)
"new fashion customers"     → [0.91, 0.23, -0.44, 0.67, ...] (very different)
```

These numbers have no individual meaning — only the relationships between vectors matter.

### How to generate embeddings

```typescript
// lib/utils/embeddings.ts

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",  // produces 1536-dimensional vectors
    input: text,
  });

  return response.data[0]?.embedding ?? [];
}
```

### How pgvector stores and searches them

pgvector is a PostgreSQL extension that adds a `vector` column type and distance operators.

```sql
-- Column definition (in migration)
ALTER TABLE campaign_memories ADD COLUMN embedding vector(1536);

-- HNSW index — makes similarity search fast even with thousands of rows
-- cosine distance is best for text embeddings (normalized vectors)
CREATE INDEX ON campaign_memories
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

The `<=>` operator computes cosine distance (0 = identical, 2 = opposite).
We use `1 - (embedding <=> query_embedding)` to get similarity (1 = identical, -1 = opposite).
We filter at `> 0.7` — anything below that threshold is not meaningfully related.

### When to embed vs when not to

| Use embeddings (semantic search) | Use regular SQL (exact match) |
|---|---|
| "Find campaigns similar to this goal" | "Find campaign by ID" |
| "Find products related to this description" | "Find all campaigns by status" |
| "Find relevant brand guidelines" | "Find orders in last 30 days" |
| Anything where meaning matters more than exact keywords | Anything with exact known values |

---

## 10. The Learning Loop — End to End

This is the mechanism that makes the platform improve over time. Here is the complete
flow from campaign launch to the next campaign being smarter.

```
Campaign launched
      │
      ▼
Messages sent via BullMQ workers
      │
      ▼
Channel service sends callbacks (DELIVERED, OPENED, CLICKED, CONVERTED)
      │
      ▼
Webhook handler updates communication_events table
      │
      ▼
Campaign status flips to "completed" when all jobs processed
      │
      ▼
Analytics agent runs:
  - Queries aggregated stats from communication_events
  - Calls GPT-4o to generate natural language insights
  - Identifies top product, best channel, open time patterns
      │
      ▼
writeCampaignMemory() called:
  - Builds rich text summary of campaign + results
  - Generates embedding (OpenAI ada-002)
  - Stores in campaign_memories table with pgvector column
      │
      ▼
Next campaign is created
      │
      ▼
Orchestrator's system prompt calls getCampaignMemory(currentGoal):
  - Embeds the new goal
  - Finds top-3 semantically similar past campaigns
  - Returns their summaries + stats
      │
      ▼
Orchestrator system prompt is built with this context:
  "Past campaigns similar to this goal:
   1. Coffee re-engagement: CTR 14.2%, best channel WhatsApp, best time 9 AM
   2. Cold brew launch: CTR 9.8%, best channel Email, ..."
      │
      ▼
Model uses this history to:
  - Prefer WhatsApp for coffee campaigns (it worked before)
  - Suggest 9 AM send time (pattern from memory)
  - Recommend Cold Brew as featured product (top converter)
      │
      ▼
Campaign is better because of what the system learned
```

### Triggering memory write-back automatically

```typescript
// In the campaign worker — after all jobs are done
// lib/queue/jobs/campaign-completion.ts

export async function handleCampaignCompletion(campaignId: string): Promise<void> {
  // Check if all communications for this campaign are in a terminal state
  const pendingCount = await db.communication.count({
    where: {
      campaignId,
      status: { notIn: ["DELIVERED", "FAILED", "BOUNCED"] },
    },
  });

  if (pendingCount > 0) return; // not done yet

  // Update campaign status
  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "completed" },
  });

  // Run analytics and write memory — async, non-blocking
  runAnalyticsAgent(campaignId)
    .then((analysis) => logger.info({ campaignId, analysis }, "Campaign analysis complete"))
    .catch((err) => logger.error({ campaignId, err }, "Analytics agent failed"));
}
```

---

## 11. State Management During a Run

The orchestrator is stateless between HTTP requests. All state lives in three places:

### 1. The messages array (in-memory, during the run)

This is the conversation history passed to OpenAI on every turn. It exists only for the
duration of the orchestrator function call. When the function returns, it's gone.

### 2. The OrchestratorRun table (in PostgreSQL, persistent)

For the UI to show progress while the orchestrator runs, we write intermediate state to the DB.

```typescript
// Each tool call + result is written here in real time
// The SSE endpoint reads from this table every 500ms and streams to the browser

interface OrchestratorRun {
  id: string;
  status: "running" | "completed" | "failed";
  steps: OrchestratorStep[];
  result?: ExecutionPlan;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface OrchestratorStep {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date;
}
```

### 3. The BullMQ job queue (in Redis, persistent across restarts)

Once the orchestrator produces an ExecutionPlan and the marketer approves it,
jobs are enqueued in BullMQ/Redis. Redis persistence means jobs survive a server restart.

---

## 12. Streaming Orchestrator Thinking to the UI

The marketer should see the AI working in real time — not stare at a spinner for 30 seconds.
This is implemented with Server-Sent Events (SSE).

### Flow

```
Browser → POST /api/orchestrator (starts run, returns runId immediately)
Browser → GET /api/orchestrator/[runId]/stream (SSE connection)
Orchestrator → writes steps to DB as it runs
SSE handler → polls DB every 500ms and streams new steps to browser
Browser → renders each step as it arrives ("Finding your audience..." etc.)
```

### The emitter function

```typescript
// lib/agents/orchestrator-events.ts

type OrchestratorEventType = "tool_call" | "tool_result" | "thinking" | "complete" | "error";

interface OrchestratorEvent {
  type: OrchestratorEventType;
  tool?: string;
  message?: string;
  data?: unknown;
  timestamp: Date;
}

// Human-readable labels for each tool call — shown in the thinking panel
const TOOL_LABELS: Record<string, string> = {
  get_campaign_memory:  "📚 Reviewing past campaign learnings...",
  run_segment_agent:    "🎯 Finding your target audience...",
  run_product_agent:    "🛍️ Selecting relevant products...",
  run_content_agent:    "✍️ Writing your campaign message...",
  run_channel_agent:    "📡 Choosing the best channel...",
};

export async function emitOrchestratorEvent(
  runId: string,
  event: Omit<OrchestratorEvent, "timestamp">
): Promise<void> {
  const step = {
    ...event,
    label: event.tool ? TOOL_LABELS[event.tool] : undefined,
    timestamp: new Date(),
  };

  // Append step to the run record in DB
  await db.orchestratorRun.update({
    where: { id: runId },
    data: {
      steps: { push: step }, // Prisma JSON array append
      updatedAt: new Date(),
    },
  });
}
```

### The SSE stream endpoint

```typescript
// app/api/orchestrator/[runId]/stream/route.ts

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const encoder = new TextEncoder();
  let lastStepCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll every 500ms for new steps
      const interval = setInterval(async () => {
        const run = await db.orchestratorRun.findUnique({
          where: { id: params.runId },
        });

        if (!run) {
          clearInterval(interval);
          controller.close();
          return;
        }

        // Send only new steps since last poll
        const newSteps = (run.steps as OrchestratorStep[]).slice(lastStepCount);
        if (newSteps.length > 0) {
          newSteps.forEach((step) => send({ type: "step", step }));
          lastStepCount += newSteps.length;
        }

        // Close stream when run is done
        if (run.status === "completed" || run.status === "failed") {
          send({ type: run.status, result: run.result, error: run.error });
          clearInterval(interval);
          controller.close();
        }
      }, 500);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

---

## 13. Failure Modes & Guardrails

### What happens if the segment returns 0 customers?

The segment agent returns `{ count: 0, warning: "..." }`. The orchestrator sees this
in the tool result, and because of this instruction in the system prompt:

> "If audience count is 0, stop and report the issue — do not generate content for an empty segment."

...the model will return an error plan instead of proceeding. The UI shows this as an
error state with a suggestion to broaden the segment description.

### What happens if the model calls a non-existent tool?

The `executeTool` switch statement has a `default` case that throws `OrchestratorError`.
This terminates the run and is logged as an error. The model should not do this with
a well-defined `tools` array, but it can happen with model degradation.

### What happens if the orchestrator exceeds MAX_TURNS?

The loop exits after 10 turns and throws `OrchestratorError("Exceeded MAX_TURNS")`.
The run is marked `failed` in the DB. The SSE stream sends a `{ type: "failed" }` event.
The UI shows an error and invites the marketer to try again with a simpler goal.

### What happens if OpenAI is down?

The `openai.chat.completions.create()` call throws. The error propagates up and is caught
by the route handler's `try/catch`, which marks the run as failed. No partial state is left
in an inconsistent state because the memory write-back happens AFTER a run completes, not during.

### What if the campaign memory SQL query is slow?

The HNSW index handles this. Without it, pgvector performs exact nearest-neighbor search
(full table scan). With HNSW, search is approximate but O(log n). At the scale of hundreds
of campaigns, this query should run in < 10ms.

---

## 14. Full Annotated Code Reference

### Complete OrchestratorContext type

```typescript
// types/index.ts

export interface OrchestratorContext {
  runId: string;                       // used for SSE event emission
  brandMemory: BrandMemory;            // always injected — brand identity
  campaignMemories: CampaignMemoryRecord[];  // top-3 similar past campaigns
  brandName: string;                   // convenience field from brandMemory
}

export interface ExecutionPlan {
  segmentDescription: string;
  segmentSQL: string;
  audienceCount: number;
  sampleCustomers: Array<{ id: string; name: string; email: string }>;
  recommendedChannel: "whatsapp" | "email" | "sms" | "rcs";
  channelConfidence: number;
  products: Array<{ id: string; name: string; category: string }>;
  messageDraft: string;
  subject?: string;                    // for email only
  cta: string;
  estimatedReach: number;
}
```

### Complete tool definitions with all agents

```typescript
// lib/agents/tools.ts

export const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_campaign_memory",
      description: "ALWAYS call this first. Retrieves the 3 most similar past campaigns by semantic similarity. Returns their CTR, open rate, best channel, and AI summary.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The current campaign goal in plain English" },
        },
        required: ["goal"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_segment_agent",
      description: "Generate and validate a SQL query for the target audience. Returns real customer count and 5 sample records. If count is 0, broaden the description.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Natural language audience description" },
        },
        required: ["description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_product_agent",
      description: "Find relevant products for the campaign using semantic search. Returns primary products, cross-sell, and upsell suggestions.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Primary product category" },
          context: { type: "string", description: "Campaign context and audience description" },
        },
        required: ["category", "context"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_channel_agent",
      description: "Recommend the best communication channel based on real historical performance data. Returns recommended channel with confidence score.",
      parameters: {
        type: "object",
        properties: {
          audienceDescription: { type: "string" },
        },
        required: ["audienceDescription"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_content_agent",
      description: "Generate personalized message copy for the chosen channel. Must be called AFTER run_channel_agent and run_product_agent.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["whatsapp", "email", "sms", "rcs"] },
          audienceDescription: { type: "string" },
          products: { type: "array", items: { type: "string" }, description: "Product names to feature" },
          tone: { type: "string", description: "Override brand tone if needed" },
        },
        required: ["channel", "audienceDescription", "products"],
        additionalProperties: false,
      },
    },
  },
];
```

### Database schema additions for memory + orchestrator state

```prisma
// prisma/schema.prisma (memory + orchestrator additions)

model CampaignMemory {
  id            String   @id @default(cuid())
  campaignId    String   @unique
  summary       String   @db.Text
  ctr           Float
  openRate      Float
  deliveryRate  Float
  bestChannel   String
  audienceSize  Int
  topProduct    String
  // embedding column requires raw SQL migration — Prisma doesn't support vector natively
  createdAt     DateTime @default(now())

  @@index([campaignId])
}

model OrchestratorRun {
  id        String   @id @default(cuid())
  status    String   @default("running") // running | completed | failed
  steps     Json     @default("[]")      // OrchestratorStep[]
  result    Json?                        // ExecutionPlan | null
  error     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Settings {
  id        String   @id @default(cuid())
  key       String   @unique             // e.g. "brand_memory"
  value     Json
  updatedAt DateTime @updatedAt
}
```

---

*This document is part of the Xeno CRM coding agent guidelines.*
*Read alongside CODING_GUIDELINES.md for complete system understanding.*
*Last updated: June 2026*
