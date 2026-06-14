# Xeno AI-Native Mini CRM — Coding Agent Guidelines

> These guidelines are the single source of truth for every file you write, edit, or review
> in this codebase. Read them fully before writing a single line of code. When in doubt,
> refer back here. Consistency beats cleverness.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Tech Stack & Versions](#2-tech-stack--versions)
3. [TypeScript Standards](#3-typescript-standards)
4. [Next.js Conventions (CRM App)](#4-nextjs-conventions-crm-app)
5. [Database & Prisma](#5-database--prisma)
6. [Redis & BullMQ](#6-redis--bullmq)
7. [AI / Orchestrator Layer](#7-ai--orchestrator-layer)
8. [Channel Service (Express App)](#8-channel-service-express-app)
9. [API Design](#9-api-design)
10. [Error Handling](#10-error-handling)
11. [Environment & Config](#11-environment--config)
12. [Testing](#12-testing)
13. [Logging](#13-logging)
14. [Security](#14-security)
15. [Performance Conventions](#15-performance-conventions)
16. [Code Style & Formatting](#16-code-style--formatting)
17. [Git Conventions](#17-git-conventions)
18. [What Not To Do](#18-what-not-to-do)
19. [Running the Project](#19-running-the-project)

---

## 1. Project Structure

```
xeno-crm/
├── apps/
│   ├── crm/                          # Next.js 15 app (main CRM)
│   │   ├── app/
│   │   │   ├── (dashboard)/          # Route group — authenticated pages
│   │   │   │   ├── campaigns/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   ├── page.tsx  # Campaign detail + analytics
│   │   │   │   │   │   └── review/
│   │   │   │   │   │       └── page.tsx  # Human-in-the-loop review gate
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx  # Chat interface
│   │   │   │   │   └── page.tsx      # Campaign list
│   │   │   │   ├── segments/
│   │   │   │   └── analytics/
│   │   │   ├── api/
│   │   │   │   ├── campaigns/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── orchestrator/
│   │   │   │   │   └── route.ts      # POST — start orchestrator run
│   │   │   │   ├── segments/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── webhook/
│   │   │   │   │   └── receipt/
│   │   │   │   │       └── route.ts  # Callback from channel service
│   │   │   │   └── analytics/
│   │   │   │       └── [campaignId]/
│   │   │   │           └── stream/
│   │   │   │               └── route.ts  # SSE endpoint
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn/ui components (do not edit directly)
│   │   │   ├── chat/                 # Orchestrator chat interface
│   │   │   ├── campaigns/            # Campaign-specific components
│   │   │   ├── analytics/            # Funnel charts, metric cards
│   │   │   └── segments/             # Segment builder, preview table
│   │   ├── lib/
│   │   │   ├── agents/               # All AI agent implementations
│   │   │   │   ├── orchestrator.ts
│   │   │   │   ├── segment-agent.ts
│   │   │   │   ├── product-agent.ts
│   │   │   │   ├── content-agent.ts
│   │   │   │   ├── channel-agent.ts
│   │   │   │   └── analytics-agent.ts
│   │   │   ├── db/
│   │   │   │   ├── client.ts         # Singleton Prisma client
│   │   │   │   └── queries/          # Named query functions (no raw SQL in routes)
│   │   │   ├── queue/
│   │   │   │   ├── client.ts         # BullMQ queue instance
│   │   │   │   ├── worker.ts         # Worker definition
│   │   │   │   └── jobs/             # Job processor functions
│   │   │   ├── memory/
│   │   │   │   ├── brand.ts          # Brand memory read/write
│   │   │   │   └── campaign.ts       # Campaign memory + RAG retrieval
│   │   │   └── utils/
│   │   │       ├── errors.ts
│   │   │       └── logger.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts
│   │   │   └── migrations/
│   │   └── types/
│   │       └── index.ts              # Shared domain types
│   │
│   └── channel-service/              # Separate Express app
│       ├── src/
│       │   ├── index.ts              # App entry point
│       │   ├── routes/
│       │   │   └── send.ts           # POST /send
│       │   ├── simulator/
│       │   │   ├── outcome.ts        # Weighted random outcome logic
│       │   │   └── scheduler.ts      # Delay-jittered callback scheduler
│       │   └── utils/
│       │       └── logger.ts
│       └── tsconfig.json
│
├── packages/
│   └── shared-types/                 # Types shared between both apps
│       └── src/
│           └── index.ts
│
├── .env.example
├── turbo.json                        # Turborepo config
└── package.json                      # Root workspace
```

### Rules

- Every file has one clear responsibility. If you need to name a file `utils.ts` and it grows
  beyond 100 lines, split it by domain.
- No barrel files (`index.ts` re-exporting everything) inside `lib/`. Import directly by path.
  Barrel files cause circular dependency nightmares.
- `components/ui/` is shadcn-managed. Never edit files in this directory directly.
  Add variants or compositions in `components/` one level up.
- Worker code (`lib/queue/worker.ts`) must be imported only from a standalone Node.js
  process entrypoint, never from a Next.js route handler. Workers run as a separate process.

---

## 2. Tech Stack & Versions

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router) | Use Server Components by default |
| Language | TypeScript 5.x | Strict mode always on |
| Styling | Tailwind CSS v4 + shadcn/ui | No custom CSS files unless necessary |
| Animation | Framer Motion | Only on client components |
| Database | PostgreSQL 16 via Prisma ORM | Never use raw SQL in route handlers |
| Vector store | pgvector extension | HNSW index, 1536 dimensions (OpenAI ada-002) |
| Cache / Queue | Redis 7 + BullMQ 5 | One Redis instance, two logical uses |
| AI | OpenAI (gpt-4o) + Google Gemini | Orchestrator uses OpenAI tool-use |
| Queue runner | BullMQ Worker (standalone process) | concurrency: 20 |
| Channel svc | Express 5 + TypeScript | Separate Railway service |
| Package manager | pnpm workspaces | Never use npm or yarn |
| Monorepo | Turborepo | `turbo build`, `turbo dev` |
| Deployment | Vercel (CRM) + Railway (channel-service, worker) | |

Do not introduce new dependencies without listing the reason in a code comment at the
import site. Every dependency is maintenance debt.

---

## 3. TypeScript Standards

### Always-on compiler options

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,               // non-negotiable
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Type definitions

```typescript
// ✅ Use type for unions/intersections, interface for object shapes
type Channel = "whatsapp" | "email" | "sms" | "rcs";
type CampaignStatus = "draft" | "review" | "running" | "completed" | "failed";

interface Campaign {
  id: string;
  name: string;
  goal: string;
  status: CampaignStatus;
  channel: Channel;
  segmentId: string;
  createdAt: Date;
}

// ✅ Infer from Prisma where possible — do not duplicate types
import type { Campaign } from "@prisma/client";

// ❌ Never use 'any'. Use 'unknown' and narrow.
function parseWebhookBody(raw: unknown): WebhookPayload {
  if (!isWebhookPayload(raw)) throw new InvalidPayloadError();
  return raw;
}

// ✅ Use Zod for runtime validation at every API boundary
import { z } from "zod";

const SendCampaignSchema = z.object({
  campaignId: z.string().cuid(),
  scheduledAt: z.coerce.date().optional(),
});
type SendCampaignInput = z.infer<typeof SendCampaignSchema>;
```

### Nullability

```typescript
// ✅ Explicit null handling — never assume a DB lookup returns a value
const campaign = await db.campaign.findUnique({ where: { id } });
if (!campaign) {
  throw new NotFoundError(`Campaign ${id} not found`);
}

// ✅ Non-null assertion (!) is banned in application code.
// The only allowed use is in test fixtures where you own the data.
```

### Enums

Never use TypeScript `enum`. Use `as const` objects instead — they tree-shake cleanly
and produce better generated types.

```typescript
// ❌
enum CommunicationEvent { SENT, DELIVERED, FAILED }

// ✅
const CommunicationEvent = {
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
  OPENED: "OPENED",
  READ: "READ",
  CLICKED: "CLICKED",
  CONVERTED: "CONVERTED",
} as const;
type CommunicationEvent = (typeof CommunicationEvent)[keyof typeof CommunicationEvent];
```

---

## 4. Next.js Conventions (CRM App)

### Server vs Client components

Default to **Server Components**. Add `"use client"` only when the component:
- Uses React hooks (`useState`, `useEffect`, `useRef`, etc.)
- Attaches browser event listeners
- Reads `localStorage` or similar browser APIs
- Uses Framer Motion animations

```typescript
// ✅ Server component — no directive needed, can be async
// app/(dashboard)/campaigns/page.tsx
import { getCampaigns } from "@/lib/db/queries/campaigns";

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();
  return <CampaignList campaigns={campaigns} />;
}

// ✅ Client component — explicit directive + minimal state
// components/campaigns/launch-button.tsx
"use client";

import { useState } from "react";

export function LaunchButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  // ...
}
```

### Route handlers

```typescript
// app/api/campaigns/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ApiError } from "@/lib/utils/errors";

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  goal: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = CreateCampaignSchema.parse(body); // throws ZodError on failure

    const campaign = await db.campaign.create({
      data: { ...input, status: "draft" },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    return handleApiError(error); // centralized error handler — see Section 10
  }
}
```

### SSE for live analytics

```typescript
// app/api/analytics/[campaignId]/stream/route.ts
export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial snapshot
      const stats = await getAnalyticsSnapshot(params.campaignId);
      send(stats);

      // Poll every 3 seconds — stop when campaign is completed
      const interval = setInterval(async () => {
        const updated = await getAnalyticsSnapshot(params.campaignId);
        send(updated);
        if (updated.status === "completed") {
          clearInterval(interval);
          controller.close();
        }
      }, 3000);
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

### Data fetching rules

- Fetch data in Server Components. Pass it down as props.
- Never call your own API routes from Server Components — call the DB query function directly.
- Client components that need fresh data use `SWR` or `React Query`, not `useEffect + fetch`.
- Mutations go through Server Actions OR route handlers — never both patterns in the same feature.

---

## 5. Database & Prisma

### Schema conventions

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

// All models:
// - Use cuid() for IDs (URL-safe, sortable)
// - createdAt always present
// - updatedAt always present
// - No nullable fields unless the domain genuinely allows NULL

model Customer {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  phone     String?
  city      String?
  gender    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  orders         Order[]
  communications Communication[]
}

model CampaignMemory {
  id          String                      @id @default(cuid())
  campaignId  String                      @unique
  summary     String
  ctr         Float
  openRate    Float
  bestChannel String
  embedding   Unsupported("vector(1536)")?
  createdAt   DateTime                    @default(now())
}
```

### Query functions

Never write Prisma calls inline in route handlers. All DB access goes through named
query functions in `lib/db/queries/`.

```typescript
// lib/db/queries/campaigns.ts

import { db } from "@/lib/db/client";
import type { Campaign, Prisma } from "@prisma/client";

export async function getCampaignById(id: string): Promise<Campaign | null> {
  return db.campaign.findUnique({ where: { id } });
}

export async function getCampaignsWithStats(limit = 20) {
  return db.campaign.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { communications: true } },
    },
  });
}

// ✅ Raw SQL only when Prisma cannot express it (e.g. pgvector similarity search)
export async function findSimilarCampaigns(
  embedding: number[],
  limit = 3
): Promise<CampaignMemory[]> {
  return db.$queryRaw<CampaignMemory[]>`
    SELECT *
    FROM "CampaignMemory"
    ORDER BY embedding <=> ${embedding}::vector
    LIMIT ${limit}
  `;
}
```

### Prisma client singleton

```typescript
// lib/db/client.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
```

### Migration rules

- Never edit migration files after they have been committed. Create a new migration.
- Every migration must be reviewed before running in production.
- Seed data goes in `prisma/seed.ts`, not in migrations.
- Run `npx prisma migrate dev --name <description>` locally. CI runs `prisma migrate deploy`.

---

## 6. Redis & BullMQ

### Client setup

```typescript
// lib/queue/client.ts
import { Queue, QueueEvents } from "bullmq";
import { Redis } from "ioredis";

// Shared connection — reuse across queue instances
export const redisConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

export const campaignQueue = new Queue("campaign-send", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 }, // keep last 1000 completed jobs
    removeOnFail: { count: 500 },
  },
});
```

### Job schema — define strictly

```typescript
// packages/shared-types/src/index.ts

export interface CampaignSendJob {
  campaignId: string;
  customerId: string;
  channel: "whatsapp" | "email" | "sms" | "rcs";
  message: string;
  idempotencyKey: string; // `${campaignId}:${customerId}` — prevents duplicate sends
}
```

### Worker

```typescript
// lib/queue/worker.ts
import { Worker, UnrecoverableError } from "bullmq";
import { redisConnection } from "./client";
import type { CampaignSendJob } from "@xeno/shared-types";

const worker = new Worker<CampaignSendJob>(
  "campaign-send",
  async (job) => {
    const { campaignId, customerId, channel, message, idempotencyKey } = job.data;

    // Check idempotency before sending — prevents duplicate sends on retry
    const alreadySent = await checkIdempotency(idempotencyKey);
    if (alreadySent) {
      // Not an error — just a duplicate. Mark complete silently.
      return;
    }

    try {
      await callChannelService({ campaignId, customerId, channel, message });
      await markIdempotencySeen(idempotencyKey);
    } catch (error) {
      // If the channel service returns 4xx, don't retry — it's a bad request
      if (error instanceof ClientError) {
        throw new UnrecoverableError(error.message);
      }
      throw error; // BullMQ will retry for other errors
    }
  },
  {
    connection: redisConnection,
    concurrency: 20,
    limiter: { max: 100, duration: 1000 }, // max 100 jobs/sec to channel service
  }
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Campaign send job failed");
});
```

### Queue a campaign

```typescript
// In a Server Action or route handler — after campaign approval
async function enqueueCampaign(campaignId: string, customerIds: string[]) {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) throw new NotFoundError("Campaign not found");

  const jobs = customerIds.map((customerId) => ({
    name: "send",
    data: {
      campaignId,
      customerId,
      channel: campaign.channel,
      message: campaign.messageTemplate,
      idempotencyKey: `${campaignId}:${customerId}`,
    } satisfies CampaignSendJob,
  }));

  await campaignQueue.addBulk(jobs);
}
```

---

## 7. AI / Orchestrator Layer

### Tool-use loop pattern

The orchestrator must use OpenAI's tool-use (function calling) pattern — not a simple
`chat.completions.create` with a big prompt. This is what makes the system genuinely
AI-native.

```typescript
// lib/agents/orchestrator.ts
import OpenAI from "openai";
import { tools } from "./tools"; // all tool definitions
import { executeTool } from "./tool-executor";
import { buildSystemPrompt } from "./prompts";
import type { OrchestratorContext, ExecutionPlan } from "@/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runOrchestrator(
  goal: string,
  context: OrchestratorContext
): Promise<ExecutionPlan> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(context) },
    { role: "user", content: goal },
  ];

  // Tool-use loop — runs until the model stops requesting tools
  while (true) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
      response_format: { type: "json_object" }, // final output must be structured
    });

    const message = response.choices[0]?.message;
    if (!message) throw new OrchestratorError("Empty response from model");

    messages.push(message); // append assistant turn

    // If no tool calls, the model is done
    if (!message.tool_calls?.length) {
      return parseExecutionPlan(message.content ?? "");
    }

    // Execute all tool calls in parallel when possible
    const toolResults = await Promise.all(
      message.tool_calls.map(async (toolCall) => {
        const result = await executeTool(toolCall.function.name, toolCall.function.arguments);
        return {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        };
      })
    );

    messages.push(...toolResults);
  }
}
```

### Tool definitions

```typescript
// lib/agents/tools.ts
import type OpenAI from "openai";

export const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "run_segment_agent",
      description:
        "Convert a natural language audience description into a SQL query, validate it, " +
        "and return a count of matching customers along with 5 sample records.",
      parameters: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Natural language description of the target audience",
          },
        },
        required: ["description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_content_agent",
      description: "Generate personalized message copy for a given channel and audience.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["whatsapp", "email", "sms", "rcs"] },
          audienceDescription: { type: "string" },
          products: { type: "array", items: { type: "string" } },
          tone: { type: "string" },
        },
        required: ["channel", "audienceDescription"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaign_memory",
      description:
        "Retrieve learnings from the 3 most similar past campaigns using semantic search. " +
        "Use this before generating content or choosing a channel.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The current campaign goal" },
        },
        required: ["goal"],
        additionalProperties: false,
      },
    },
  },
  // run_product_agent, run_channel_agent follow the same pattern
];
```

### Segment agent — always validate SQL

```typescript
// lib/agents/segment-agent.ts
import { db } from "@/lib/db/client";
import { generateSegmentSQL } from "./sql-generator";

interface SegmentResult {
  sql: string;
  count: number;
  sample: Array<{ id: string; name: string; email: string }>;
}

export async function runSegmentAgent(description: string): Promise<SegmentResult> {
  // Step 1: Generate SQL from natural language (via LLM)
  const sql = await generateSegmentSQL(description);

  // Step 2: Validate and get count — ALWAYS run through DB before returning
  // Use a read-only Prisma client or a transaction with ROLLBACK to be safe
  const countResult = await db.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM (${sql} LIMIT 10000) sub`
  );
  const count = Number(countResult[0]?.count ?? 0);

  // Step 3: Sample customers for the review screen
  const sample = await db.$queryRawUnsafe<SegmentResult["sample"]>(
    `${sql} LIMIT 5`
  );

  return { sql, count, sample };
}
```

### System prompt — inject memory context

```typescript
// lib/agents/prompts.ts
import type { OrchestratorContext } from "@/types";

export function buildSystemPrompt(ctx: OrchestratorContext): string {
  return `You are the Orchestrator Agent for ${ctx.brandName}'s CRM platform.
Your job is to convert a marketer's business goal into a complete, validated campaign plan.

## Brand memory
${JSON.stringify(ctx.brandMemory, null, 2)}

## Relevant past campaign learnings
${ctx.campaignMemories.map((m) => `- ${m.summary} (CTR: ${m.ctr}%, best channel: ${m.bestChannel})`).join("\n")}

## Execution rules
- Always call get_campaign_memory FIRST before any other tool.
- Always call run_segment_agent and validate the audience count before generating content.
- If audience count is 0, stop and report the issue — do not generate content for an empty segment.
- Your final response MUST be a JSON object matching the ExecutionPlan schema.
- Do not make assumptions about channel preference — use get_campaign_memory or run_channel_agent.

## Output schema
{
  "segmentDescription": string,
  "segmentSQL": string,
  "audienceCount": number,
  "sampleCustomers": [{ "id": string, "name": string, "email": string }],
  "recommendedChannel": "whatsapp" | "email" | "sms" | "rcs",
  "channelConfidence": number,   // 0-1
  "products": string[],
  "messageDraft": string,
  "estimatedReach": number
}`;
}
```

### Memory write-back after campaign completion

```typescript
// lib/memory/campaign.ts
import { db } from "@/lib/db/client";
import { getEmbedding } from "@/lib/utils/embeddings";

export async function writeCampaignMemory(campaignId: string) {
  const stats = await getAnalyticsSnapshot(campaignId);
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return;

  const summary = `Campaign "${campaign.name}" targeting ${campaign.goal}. ` +
    `Channel: ${stats.channel}. CTR: ${stats.ctr}%. Open rate: ${stats.openRate}%. ` +
    `Audience size: ${stats.totalSent}.`;

  const embedding = await getEmbedding(summary); // OpenAI ada-002

  await db.$executeRaw`
    INSERT INTO "CampaignMemory" (id, "campaignId", summary, ctr, "openRate", "bestChannel", embedding, "createdAt")
    VALUES (${cuid()}, ${campaignId}, ${summary}, ${stats.ctr}, ${stats.openRate}, ${stats.channel}, ${embedding}::vector, NOW())
    ON CONFLICT ("campaignId") DO UPDATE
    SET summary = EXCLUDED.summary, ctr = EXCLUDED.ctr, embedding = EXCLUDED.embedding
  `;
}
```

---

## 8. Channel Service (Express App)

### Outcome simulation — weighted random

```typescript
// apps/channel-service/src/simulator/outcome.ts

type Outcome = "delivered" | "failed" | "bounced";

const CHANNEL_WEIGHTS: Record<string, Record<Outcome, number>> = {
  whatsapp: { delivered: 0.88, failed: 0.07, bounced: 0.05 },
  email:    { delivered: 0.72, failed: 0.15, bounced: 0.13 },
  sms:      { delivered: 0.80, failed: 0.12, bounced: 0.08 },
  rcs:      { delivered: 0.75, failed: 0.15, bounced: 0.10 },
};

export function simulateOutcome(channel: string): Outcome {
  const weights = CHANNEL_WEIGHTS[channel] ?? CHANNEL_WEIGHTS.email;
  const rand = Math.random();

  let cumulative = 0;
  for (const [outcome, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (rand <= cumulative) return outcome as Outcome;
  }
  return "delivered";
}
```

### Delay jitter — makes analytics feel real

```typescript
// apps/channel-service/src/simulator/scheduler.ts

const DELAY_RANGES = {
  // [minMs, maxMs]
  DELIVERED: [1000, 3000],
  OPENED:    [30_000, 120_000],
  CLICKED:   [10_000, 60_000],
  CONVERTED: [60_000, 300_000],
} as const;

function jitteredDelay(event: keyof typeof DELAY_RANGES): number {
  const [min, max] = DELAY_RANGES[event];
  return Math.floor(Math.random() * (max - min) + min);
}

export async function scheduleCallbacks(
  webhookUrl: string,
  communicationId: string,
  outcome: "delivered" | "failed" | "bounced"
) {
  // DELIVERED (or failed) always fires
  setTimeout(async () => {
    await sendCallback(webhookUrl, communicationId, outcome === "delivered" ? "DELIVERED" : "FAILED");

    if (outcome !== "delivered") return;

    // ~60% open rate simulation
    if (Math.random() < 0.6) {
      setTimeout(async () => {
        await sendCallback(webhookUrl, communicationId, "OPENED");

        // ~30% click rate (of opened)
        if (Math.random() < 0.3) {
          setTimeout(async () => {
            await sendCallback(webhookUrl, communicationId, "CLICKED");

            // ~15% conversion (of clicked)
            if (Math.random() < 0.15) {
              setTimeout(
                () => sendCallback(webhookUrl, communicationId, "CONVERTED"),
                jitteredDelay("CONVERTED")
              );
            }
          }, jitteredDelay("CLICKED"));
        }
      }, jitteredDelay("OPENED"));
    }
  }, jitteredDelay("DELIVERED"));
}

async function sendCallback(url: string, communicationId: string, status: string) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communicationId, status, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    // Fire-and-forget — log but don't crash
    console.error({ communicationId, status, err }, "Callback failed");
  }
}
```

### Webhook receipt handler (in CRM)

```typescript
// app/api/webhook/receipt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const ReceiptSchema = z.object({
  communicationId: z.string(),
  status: z.enum(["DELIVERED", "FAILED", "OPENED", "READ", "CLICKED", "CONVERTED"]),
  timestamp: z.coerce.date(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { communicationId, status, timestamp } = ReceiptSchema.parse(body);

  await db.$transaction([
    db.communication.update({
      where: { id: communicationId },
      data: { status },
    }),
    db.communicationEvent.create({
      data: { communicationId, eventType: status, timestamp },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
```

---

## 9. API Design

### Response envelope

All API responses use a consistent envelope:

```typescript
// Success
{ "data": { ... } }

// Error
{ "error": { "code": "CAMPAIGN_NOT_FOUND", "message": "Campaign abc123 not found" } }

// Paginated list
{
  "data": [...],
  "meta": { "total": 421, "page": 1, "pageSize": 20 }
}
```

### HTTP status codes — use precisely

| Status | When |
|---|---|
| 200 | GET success, PUT/PATCH success |
| 201 | POST created a new resource |
| 204 | DELETE success (no body) |
| 400 | Validation failure (Zod error) |
| 401 | Unauthenticated |
| 403 | Authenticated but unauthorized |
| 404 | Resource not found |
| 409 | Conflict (duplicate idempotency key, campaign already launched) |
| 422 | Business logic failure (segment returned 0 customers) |
| 500 | Unhandled server error |

### Pagination

```typescript
const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
```

---

## 10. Error Handling

### Custom error hierarchy

```typescript
// lib/utils/errors.ts

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class BusinessError extends AppError {
  constructor(message: string, code: string) {
    super(message, code, 422);
  }
}

export class OrchestratorError extends AppError {
  constructor(message: string) {
    super(message, "ORCHESTRATOR_ERROR", 500);
  }
}
```

### Centralized handler for route handlers

```typescript
// lib/utils/errors.ts (continued)
import { ZodError } from "zod";
import { NextResponse } from "next/server";

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Invalid input" } },
      { status: 400 }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    );
  }

  // Unknown error — log and return generic message (never leak internals)
  logger.error({ error }, "Unhandled error in route handler");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    { status: 500 }
  );
}
```

### Worker error handling

```typescript
// In BullMQ workers:
// - Throw for retriable errors (network timeouts, 5xx from channel service)
// - Throw UnrecoverableError for permanent failures (4xx, invalid job data)
// - Log all failures with job ID and error context

worker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, campaignId: job?.data.campaignId, err },
    "Job failed permanently"
  );
  // If it's a campaign-critical failure, update the communication record
});
```

---

## 11. Environment & Config

### `.env.example` — keep this in sync

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/xeno_crm"

# Redis
REDIS_URL="redis://localhost:6379"

# AI
OPENAI_API_KEY="sk-..."
GOOGLE_GEMINI_API_KEY="..."

# Channel service
CHANNEL_SERVICE_URL="http://localhost:4000"
WEBHOOK_BASE_URL="https://your-crm.vercel.app"   # used by channel service for callbacks

# Security
WEBHOOK_SECRET="random-32-char-string"            # HMAC secret for webhook validation

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

### Config validation at startup

```typescript
// lib/utils/config.ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  CHANNEL_SERVICE_URL: z.string().url(),
  WEBHOOK_BASE_URL: z.string().url(),
  WEBHOOK_SECRET: z.string().min(32),
});

// This throws at import time if env is misconfigured — fail fast, not silently
export const config = EnvSchema.parse(process.env);
```

---

## 12. Testing

For this assignment, test coverage focuses on the components most likely to be questioned
by evaluators: agents, SQL generation, queue logic, and webhook handling.

### Test structure

```
tests/
├── unit/
│   ├── agents/
│   │   ├── segment-agent.test.ts     # SQL generation + validation
│   │   ├── channel-agent.test.ts     # Channel recommendation logic
│   │   └── content-agent.test.ts     # Message generation (mock LLM)
│   ├── simulator/
│   │   └── outcome.test.ts           # Weighted random distribution
│   └── utils/
│       └── errors.test.ts
└── integration/
    ├── webhook.test.ts               # Receipt → DB update flow
    └── queue.test.ts                 # Enqueue → worker → channel service mock
```

### Example — test the simulator distribution

```typescript
// tests/unit/simulator/outcome.test.ts
import { simulateOutcome } from "@/simulator/outcome";

describe("simulateOutcome", () => {
  it("produces delivered > 80% for whatsapp over 1000 trials", () => {
    const results = Array.from({ length: 1000 }, () => simulateOutcome("whatsapp"));
    const deliveredRate = results.filter((r) => r === "delivered").length / 1000;
    expect(deliveredRate).toBeGreaterThan(0.8);
    expect(deliveredRate).toBeLessThan(0.96);
  });

  it("never returns an unknown outcome", () => {
    for (let i = 0; i < 100; i++) {
      expect(["delivered", "failed", "bounced"]).toContain(simulateOutcome("email"));
    }
  });
});
```

---

## 13. Logging

Use `pino` for structured JSON logging. Never use `console.log` in application code.

```typescript
// lib/utils/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
```

### What to log and at what level

| Level | Use |
|---|---|
| `debug` | Tool calls, SQL queries, intermediate agent steps |
| `info` | Campaign launched, campaign completed, webhook received |
| `warn` | Retry attempt, audience count = 0, slow query (> 500ms) |
| `error` | Unhandled errors, failed jobs, DB connection errors |

### Always include context

```typescript
// ✅
logger.info({ campaignId, customerId, channel }, "Job enqueued");
logger.error({ campaignId, err }, "Failed to launch campaign");

// ❌ Never log without context fields
logger.info("Job enqueued");
```

---

## 14. Security

### Webhook signature verification

The channel service must sign every callback. The CRM must verify before processing.

```typescript
// In channel service — sign the payload
import { createHmac } from "crypto";

function signPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// Attach as header: X-Xeno-Signature: sha256=<hex>
```

```typescript
// In CRM webhook handler — verify before processing
import { timingSafeEqual } from "crypto";

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

### SQL injection prevention

- Never use template literals for SQL with user-provided values outside of Prisma's
  `$queryRaw` tagged template (which parameterizes automatically).
- Never use `$queryRawUnsafe` with user input. If you must, validate the input is an
  integer or CUID before interpolating.

### Secrets

- Never log secrets, API keys, or database URLs — even at debug level.
- Never commit `.env` files. `.env.example` with no values is fine.
- Never pass secrets through query parameters.

---

## 15. Performance Conventions

### Database

- Add indexes to every foreign key and every column used in `WHERE` clauses.
  Prisma does not create these automatically unless you declare `@@index`.
- The segment SQL generated by the AI must be reviewed — add `EXPLAIN ANALYZE`
  logging in development to catch sequential scans on large tables.
- pgvector HNSW index config:

```prisma
// In schema, after adding the embedding column
@@index([embedding], type: Hnsw(opclass: vector_cosine_ops))
```

### API

- Campaign analytics queries should aggregate from `CommunicationEvent` using
  `GROUP BY eventType` — one query, not seven separate counts.
- SSE polling interval is 3 seconds. Do not go lower — it will hammer the DB.

### Queue

- `addBulk` for batch enqueueing. Never call `queue.add()` in a loop — each call
  is a round trip to Redis.
- Keep job payloads small (under 1KB). Don't put the full message template in the
  job data — put a reference ID and fetch it in the worker.

---

## 16. Code Style & Formatting

### Tools

- **ESLint**: `eslint-config-next` + `@typescript-eslint/recommended`
- **Prettier**: 2-space indent, single quotes, trailing comma, 100 char line width
- **Husky + lint-staged**: lint and format on pre-commit

### Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `segment-agent.ts` |
| React components | PascalCase | `CampaignReviewCard` |
| Functions | camelCase | `runSegmentAgent` |
| Constants | SCREAMING_SNAKE | `MAX_AUDIENCE_SIZE` |
| DB columns | camelCase (Prisma) | `createdAt` |
| API routes | kebab-case | `/api/campaign-memory` |
| Types/interfaces | PascalCase | `ExecutionPlan` |
| Zod schemas | PascalCase + Schema suffix | `CreateCampaignSchema` |

### Function length

- No function over 60 lines. Extract helpers.
- No file over 300 lines. Split by responsibility.

### Comments

```typescript
// ✅ Comment on WHY, not WHAT — the code shows what
// Using idempotency key prevents duplicate sends when workers retry on transient failure
const alreadySent = await checkIdempotency(idempotencyKey);

// ❌ Useless comment
// Check if already sent
const alreadySent = await checkIdempotency(idempotencyKey);

// ✅ TODO with owner and context is fine
// TODO(Aryan): replace polling with Postgres LISTEN/NOTIFY for lower latency
```

---

## 17. Git Conventions

### Branch naming

```
feat/orchestrator-tool-use-loop
fix/webhook-duplicate-processing
chore/add-pgvector-hnsw-index
docs/update-coding-guidelines
```

### Commit messages (Conventional Commits)

```
feat(agents): implement segment agent with SQL validation
fix(queue): add idempotency check before channel service call
chore(db): add HNSW index on campaign memory embeddings
test(simulator): add distribution test for outcome weights
docs: add coding guidelines for coding agent
```

### PR checklist before merge

- [ ] TypeScript compiles with zero errors (`pnpm tsc --noEmit`)
- [ ] ESLint passes (`pnpm lint`)
- [ ] Tests pass (`pnpm test`)
- [ ] No `any`, no `console.log`, no hardcoded secrets
- [ ] New env variables added to `.env.example`
- [ ] New DB columns have a migration + updated seed

---

## 18. What Not To Do

These are common mistakes. The coding agent must never do any of these.

```typescript
// ❌ Never use 'any'
async function processJob(data: any) { ... }

// ❌ Never use console.log — use logger
console.log("campaign launched", campaignId);

// ❌ Never call Prisma inside a React Server Component directly —
//    always go through a query function
export default async function Page() {
  const campaigns = await prisma.campaign.findMany(); // wrong
}

// ❌ Never hardcode delays — all timing is configurable via constants
setTimeout(() => sendCallback(...), 30000); // magic number

// ❌ Never put business logic in route handlers
export async function POST(req: NextRequest) {
  // 80 lines of campaign logic here — wrong
}

// ❌ Never skip Zod validation at API boundaries
export async function POST(req: NextRequest) {
  const { campaignId } = await req.json(); // trusting raw input
}

// ❌ Never run a campaign without a human-in-the-loop review gate
//    The orchestrator produces a plan. The user approves. Then launch.

// ❌ Never store embeddings as JSON arrays in a TEXT column
//    Use the pgvector 'vector' type

// ❌ Never generate SQL and run it without validation
const sql = await generateSQL(userInput);
await db.$executeRawUnsafe(sql); // could be anything

// ❌ Never expose internal error messages or stack traces to clients
return NextResponse.json({ error: err.stack }, { status: 500 });

// ❌ Never use WidthType.PERCENTAGE in Prisma or any DB query
//    (for future docx work — always use DXA units)

// ❌ Never add a job in a loop — use addBulk
for (const customerId of customerIds) {
  await campaignQueue.add("send", { customerId }); // N round trips
}

// ❌ Never leak the channel service URL to the frontend
//    All calls to channel service go through the CRM backend
```

---

## 19. Running the Project

This is a **pnpm + Turborepo monorepo**. Everything is orchestrated from the repo root.
Never use `npm` or `yarn` — always use `pnpm`.

---

### Prerequisites

| Tool | Min Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm install -g pnpm` |
| Docker Desktop | Latest | [docker.com](https://www.docker.com) |
| Git | Any | [git-scm.com](https://git-scm.com) |

> **Windows users:** All `pnpm` commands should be run in **PowerShell** or **Windows Terminal**.
> Do **not** use `turbo` directly — call it via `pnpm run <script>` (turbo is a devDependency,
> not a global binary).

---

### Step 1 — Clone & Install

```bash
git clone <repo-url> xeno
cd xeno
pnpm install          # installs all workspaces in one shot
```

---

### Step 2 — Environment Variables

```bash
# Copy the example env to the root AND into each app
cp .env.example .env
cp .env.example apps/crm/.env
cp .env.example apps/channel-service/.env
```

Then fill in the values in each `.env` file:

| Variable | Description | Default (dev) |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://xeno:xeno_secret@localhost:5432/xeno_crm` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `OPENAI_API_KEY` | OpenAI API key (required for AI features) | — |
| `CHANNEL_SERVICE_URL` | URL of the channel microservice | `http://localhost:4000` |
| `WEBHOOK_BASE_URL` | CRM base URL (used by channel service for callbacks) | `http://localhost:3000` |
| `WEBHOOK_SECRET` | Shared HMAC secret — must be ≥ 32 chars | `change-me-...` |
| `NEXT_PUBLIC_APP_URL` | Public CRM URL (exposed to browser) | `http://localhost:3000` |
| `NODE_ENV` | Environment name | `development` |

---

### Step 3 — Start Infrastructure (Docker)

The project depends on **PostgreSQL 16 with pgvector** and **Redis 7**.
Start both with a single command:

```bash
docker compose up -d
```

Verify they are healthy:

```bash
docker compose ps
# Both postgres and redis should show status: healthy
```

Stop infrastructure:

```bash
docker compose down          # stop but keep data volumes
docker compose down -v       # stop AND wipe all data (fresh start)
```

---

### Step 4 — Database Setup (first time only)

```bash
# Run all Prisma migrations
pnpm db:migrate

# Seed the database with sample customers, orders, and brand memory
pnpm db:seed

# (Optional) apply pgvector column migrations if prompted
pnpm db:migrate-vectors
```

To open the Prisma visual database browser:

```bash
pnpm db:studio
# Opens at http://localhost:5555
```

---

### Step 5 — Run All Dev Servers (recommended)

From the **repo root**, one command starts all apps in parallel via Turborepo:

```bash
pnpm run dev
```

This starts:

| Service | URL | Description |
|---|---|---|
| CRM (Next.js) | http://localhost:3000 | Main web app — AI campaign builder |
| Channel Service (Express) | http://localhost:4000 | Message send simulator & callbacks |

Turborepo's TUI shows logs for each package with colour-coded prefixes:
- `crm:dev` → Next.js app logs
- `channel-service:dev` → Express service logs

---

### Step 6 — Run the BullMQ Worker (separate terminal)

The worker processes campaign send jobs from Redis and calls the channel service.
It **must** run as a separate Node.js process — never import it into a Next.js route.

```bash
# In a new terminal window / PowerShell tab:
pnpm --filter crm run worker
```

> The worker is required whenever you launch a campaign. Without it, jobs will queue
> in Redis but never be processed.

---

### Running Services Individually

If you only need one service (e.g. while working on a specific app):

```bash
# CRM app only
pnpm --filter crm run dev

# Channel service only
pnpm --filter channel-service run dev
```

---

### Useful Scripts — Quick Reference

```bash
# Development
pnpm run dev                          # start all dev servers (Turborepo)
pnpm --filter crm run worker          # start BullMQ worker (separate process)

# Database
pnpm db:migrate                       # run pending Prisma migrations
pnpm db:seed                          # seed sample data
pnpm db:studio                        # open Prisma Studio at localhost:5555
pnpm db:reset                         # drop + re-migrate + re-seed (destructive!)

# Quality
pnpm run lint                         # ESLint across all packages
pnpm run type-check                   # TypeScript type check across all packages
pnpm run test                         # Vitest unit tests

# Build (production)
pnpm run build                        # build all packages
```

---

### Ports at a Glance

| Port | Service |
|---|---|
| `3000` | CRM Next.js app |
| `4000` | Channel microservice (Express) |
| `5432` | PostgreSQL (Docker) |
| `6379` | Redis (Docker) |
| `5555` | Prisma Studio (when running) |

---

### Troubleshooting

**`turbo` is not recognized as a cmdlet**
> Do not run `turbo` directly. Use `pnpm run dev` / `pnpm run build` — turbo is a
> local devDependency, not a global binary.

**`ECONNREFUSED` connecting to Postgres or Redis**
> Docker containers are not running or not yet healthy. Run `docker compose up -d`
> and wait for `docker compose ps` to show `healthy`.

**Prisma client not found / `@prisma/client` errors**
> Run `pnpm --filter crm exec prisma generate` to regenerate the Prisma client.

**Next.js workspace root warning**
> You may see a warning about `C:\Users\<user>\package-lock.json` being detected.
> This is harmless — it's caused by a stray lockfile outside the repo.
> Set `turbopack.root` in `apps/crm/next.config.ts` to silence it if needed.

**Port already in use**
> Find and kill the process using the port:
> ```powershell
> # Find process on port 3000
> netstat -ano | findstr :3000
> # Kill by PID
> taskkill /PID <pid> /F
> ```

**Worker not processing jobs**
> Confirm the worker is running in a separate terminal with `pnpm --filter crm run worker`.
> Check Redis is reachable: `docker compose ps`.

---

*Last updated: June 2026 — Xeno Engineering Internship Assignment*
*Maintained by: Aryan | LogPulse & Xeno CRM*
