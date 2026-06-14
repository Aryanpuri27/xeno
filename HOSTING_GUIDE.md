# Xeno CRM — Full Hosting & Deployment Guide

This guide covers everything needed to take Xeno CRM from a local dev environment to a fully hosted production stack, including database seeding, connecting the Next.js app to Redis, the BullMQ worker, and the Channel Service.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Environment Variables Reference](#3-environment-variables-reference)
4. [Local Development Setup](#4-local-development-setup)
5. [Database Setup & Seeding](#5-database-setup--seeding)
6. [Connecting Next.js, Redis, Worker & Channel Service](#6-connecting-nextjs-redis-worker--channel-service)
7. [Production Deployment — Recommended Stack](#7-production-deployment--recommended-stack)
   - [7a. PostgreSQL → Supabase](#7a-postgresql--supabase)
   - [7b. Redis → Upstash](#7b-redis--upstash)
   - [7c. Next.js CRM → Vercel](#7c-nextjs-crm--vercel)
   - [7d. Channel Service → Railway](#7d-channel-service--railway)
   - [7e. BullMQ Worker → Railway](#7e-bullmq-worker--railway)
8. [Alternative: Full Railway Deployment](#8-alternative-full-railway-deployment)
9. [Alternative: Self-Hosted VPS (Docker)](#9-alternative-self-hosted-vps-docker)
10. [Post-Deploy Verification Checklist](#10-post-deploy-verification-checklist)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture Overview

The monorepo consists of **3 running processes** that must all be online for the system to work end-to-end:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│   Marketer Browser                                                │
│         │  ▲ SSE streams (real-time logs + analytics)            │
│         ▼  │                                                      │
│   ┌──────────────────┐                                           │
│   │  Next.js CRM      │  ← Process 1: Vercel / Railway           │
│   │  (App Router)     │    Port 3000                              │
│   └──────┬───────────┘                                           │
│          │ enqueue jobs                                           │
│          ▼                                                        │
│   ┌──────────────────┐    ┌──────────────────┐                  │
│   │  Redis + BullMQ  │───▶│  BullMQ Worker   │  ← Process 2     │
│   │  (Queue store +  │    │  (standalone     │    Railway        │
│   │   idempotency)   │    │   Node.js)       │                   │
│   └──────────────────┘    └──────┬───────────┘                  │
│                                  │ POST /send                     │
│                                  ▼                                │
│                          ┌──────────────────┐                   │
│                          │ Channel Service   │  ← Process 3      │
│                          │ Express :4000     │    Railway         │
│                          └──────┬───────────┘                   │
│                                 │ async webhook callbacks         │
│                                 ▼                                 │
│                   POST /api/webhook/receipt (CRM)                │
│                                 │                                 │
│                                 ▼                                 │
│                   ┌──────────────────────────┐                  │
│                   │  PostgreSQL + pgvector    │  ← Managed DB    │
│                   │  (Supabase / Railway PG)  │    Supabase      │
│                   └──────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key constraint:** The worker and channel service must be **always-on persistent processes**. Vercel serverless functions are NOT suitable for the worker — use Railway or a VPS for those two.

---

## 2. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 20.0.0 | Runtime for all packages |
| pnpm | ≥ 9.0.0 | Package manager (monorepo) |
| Docker Desktop | Any | Local Postgres + Redis |
| Git | Any | Version control |

Check versions:
```bash
node --version   # v20.x.x
pnpm --version   # 9.x.x
docker --version
```

---

## 3. Environment Variables Reference

There is a **single shared `.env` file** at the project root (`xeno/.env`) which is read by all three processes. Copy from the example:

```bash
cp .env.example .env
```

Then fill in all values:

```env
# ── Database ──────────────────────────────────────────────────────────────────
# Local:      postgresql://xeno:xeno_secret@localhost:5432/xeno_crm
# Supabase:   postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1
DATABASE_URL="postgresql://xeno:xeno_secret@localhost:5432/xeno_crm"

# ── Redis ─────────────────────────────────────────────────────────────────────
# Local:     redis://localhost:6379
# Upstash:   rediss://default:[token]@[host].upstash.io:6379
REDIS_URL="redis://localhost:6379"

# ── OpenAI ────────────────────────────────────────────────────────────────────
OPENAI_API_KEY="sk-..."

# ── Service URLs ──────────────────────────────────────────────────────────────
# CHANNEL_SERVICE_URL: where the worker sends POST /send requests
# Local:       http://localhost:4000
# Production:  https://channel-service.railway.app
CHANNEL_SERVICE_URL="http://localhost:4000"

# WEBHOOK_BASE_URL: base URL of the CRM, used by channel service to build callback URLs
# Local:       http://localhost:3000
# Production:  https://your-crm.vercel.app  (or Railway URL)
WEBHOOK_BASE_URL="http://localhost:3000"

# ── Security ──────────────────────────────────────────────────────────────────
# MUST match between CRM and channel service — used for HMAC-SHA256 webhook signing
# Generate: openssl rand -hex 32
WEBHOOK_SECRET="change-me-to-32-random-characters-min"

# ── Public URL (Next.js) ──────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

> [!CAUTION]
> `WEBHOOK_SECRET` must be **identical** in the CRM and the channel service. A mismatch causes all webhook callbacks to be rejected with 401, leaving every campaign stuck at `SENT` status permanently.

---

## 4. Local Development Setup

### Step 1 — Clone & Install

```bash
git clone <your-repo-url> xeno
cd xeno
pnpm install
```

### Step 2 — Start Docker Services

```bash
# Start PostgreSQL (with pgvector) + Redis in the background
docker compose up -d

# Verify both are healthy
docker compose ps
# Should show: xeno-postgres (healthy), xeno-redis (healthy)
```

### Step 3 — Set Up Environment

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
# All other values work as-is for local dev
```

### Step 4 — Database Migrations + Seeding

```bash
# Run all Prisma migrations (creates all tables)
pnpm db:migrate

# Apply pgvector column (run ONCE after first migration)
pnpm db:migrate-vectors

# Seed the database (10K customers, 49 products, ~25K orders)
pnpm db:seed
# This takes 2–5 minutes — it's generating 35,000+ records
```

### Step 5 — Start All Processes

Open **3 separate terminals:**

```bash
# Terminal 1: CRM Next.js app
pnpm --filter crm dev
# → http://localhost:3000

# Terminal 2: Channel Service
pnpm --filter channel-service dev
# → http://localhost:4000

# Terminal 3: BullMQ Worker
pnpm --filter crm worker
# → Watches for jobs on the campaign-send queue
```

Or run everything in one terminal using Turbo:

```bash
pnpm dev   # starts CRM + worker concurrently (channel-service needs separate terminal)
```

### Step 6 — Verify Local Setup

```bash
# Postgres
docker exec xeno-postgres psql -U xeno -d xeno_crm -c "SELECT COUNT(*) FROM \"Customer\";"
# Should return: count 10000

# Redis
docker exec xeno-redis redis-cli ping
# Should return: PONG

# Channel service
curl http://localhost:4000/health
# Should return: {"ok":true,"service":"channel-service","timestamp":"..."}

# CRM app
curl http://localhost:3000/api/health  # or just open browser
```

---

## 5. Database Setup & Seeding

### Prisma Migrations

The project uses Prisma with a PostgreSQL database. The schema lives at `apps/crm/prisma/schema.prisma`.

```bash
# Apply pending migrations (safe — does not drop data)
pnpm db:migrate

# Reset database completely and re-seed (DESTRUCTIVE — wipes all data)
pnpm db:reset

# Open Prisma Studio (GUI browser for the database)
pnpm db:studio
```

### Enabling pgvector

pgvector is required for the `CampaignMemory` table and the product embedding search. It must be enabled **before** the migration runs:

**For local Docker** (automatic — the `pgvector/pgvector:pg16` image includes it):
```sql
-- This runs automatically, but you can verify:
SELECT * FROM pg_extension WHERE extname = 'vector';
```

**For Supabase** (run once in the SQL editor):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**For Railway PostgreSQL** (run in the query runner):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run the vector column migration:
```bash
pnpm db:migrate-vectors
```

### Seeding Details

The seed script (`apps/crm/prisma/seed.ts`) creates:

| Entity | Count | Notes |
|--------|-------|-------|
| Products | 49 | Nike catalog — Running, Basketball, Lifestyle, Training, Apparel, Accessories |
| Customers | 10,000 | Weighted tiers, Indian + global cities |
| Orders | ~25,000 | Weighted categories, temporal skew |
| Settings | 1 | Brand memory with Nike guidelines |

```bash
# Run seed only (no migration)
pnpm db:seed

# Expected output:
# ✅ Brand memory settings upserted
# ✅ 49 products created
# ✅ 10000 customers created
# ✅ 25312 orders created
# 🎉 Database seeded successfully
```

> [!NOTE]
> The seed uses `upsert` for Settings and Products, so it is **safe to re-run** without duplicating data. Customers and Orders however are appended — use `pnpm db:reset` to start clean.

### Production Seeding

On first production deploy, run the seed remotely by temporarily setting `DATABASE_URL` to your production connection string:

```bash
# Option A: env override
DATABASE_URL="postgresql://..." pnpm db:seed

# Option B: Railway CLI
railway run pnpm db:seed

# Option C: Vercel (for CRM deploy)
vercel env pull .env.production.local
DATABASE_URL=$(cat .env.production.local | grep DATABASE_URL | cut -d= -f2) pnpm db:seed
```

---

## 6. Connecting Next.js, Redis, Worker & Channel Service

### How the Services Connect

```
NEXT.JS CRM                   BULLMQ WORKER              CHANNEL SERVICE
─────────────                 ─────────────              ───────────────
POST /api/orchestrator/start  reads REDIS_URL            reads PORT
  └─ creates OrchestratorRun  reads DATABASE_URL         reads WEBHOOK_SECRET
  └─ triggers Stage 1         reads CHANNEL_SERVICE_URL
                              reads WEBHOOK_BASE_URL

GET /api/webhook/receipt ◄────────────────────────────── fires async callbacks
  └─ verifies HMAC sig                                   (DELIVERED/OPENED/etc.)
  └─ updates Communication
  └─ inserts CommunicationEvent
```

### Connection Points

#### CRM → Redis (BullMQ job enqueue)
```typescript
// apps/crm/lib/queue/queue.ts
const queue = new Queue<CampaignSendJob>("campaign-send", {
  connection: new Redis(process.env.REDIS_URL!),
});
```
The CRM enqueues one job per customer when a campaign is launched. **The CRM and the Worker must point to the same Redis instance.**

#### Worker → Redis (job dequeue)
```typescript
// apps/crm/lib/queue/worker.ts
const worker = new Worker("campaign-send", handler, {
  connection: new Redis(process.env.REDIS_URL!),
  concurrency: 20,
  limiter: { max: 100, duration: 1000 },
});
```

#### Worker → Channel Service (HTTP)
```typescript
// The worker calls:
fetch(`${process.env.CHANNEL_SERVICE_URL}/send`, { method: "POST", ... })
```
`CHANNEL_SERVICE_URL` must be the publicly reachable URL of the channel service. In production this will be the Railway URL.

#### Channel Service → CRM Webhook (HTTP callbacks)
```typescript
// The channel service fires webhook callbacks to:
const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhook/receipt`;
```
`WEBHOOK_BASE_URL` must be the publicly reachable URL of the CRM. Both services verify calls using the shared `WEBHOOK_SECRET`.

#### CRM → SSE Stream (real-time logs)
The CRM emits Server-Sent Events (SSE) via an in-process event bus (`orchestrator-events.ts`). This is entirely within the Next.js process — **no extra connection needed**, but it means the CRM must be a **persistent server** (not Vercel Edge Functions). Use the Node.js runtime.

### Environment Variable Cross-Reference

| Variable | CRM reads? | Worker reads? | Channel-service reads? |
|---|---|---|---|
| `DATABASE_URL` | ✅ | ✅ | ❌ |
| `REDIS_URL` | ✅ | ✅ | ❌ |
| `OPENAI_API_KEY` | ✅ | ❌ | ❌ |
| `CHANNEL_SERVICE_URL` | ❌ | ✅ | ❌ |
| `WEBHOOK_BASE_URL` | ❌ | ✅ | ❌ |
| `WEBHOOK_SECRET` | ✅ | ❌ | ✅ |
| `PORT` | ❌ | ❌ | ✅ (default 4000) |

---

## 7. Production Deployment — Recommended Stack

**Recommended platform split:**

| Service | Platform | Why |
|---|---|---|
| Next.js CRM | **Vercel** | Best-in-class Next.js support, automatic previews, edge CDN |
| BullMQ Worker | **Railway** | Persistent Node.js process, easy env vars, auto-restart |
| Channel Service | **Railway** | Same — persistent Express server |
| PostgreSQL | **Supabase** | Managed Postgres with pgvector built-in |
| Redis | **Upstash** | Serverless Redis, free tier, HTTP + native Redis protocol |

---

### 7a. PostgreSQL → Supabase

1. Go to [supabase.com](https://supabase.com) → New Project
2. Enable the vector extension:
   - **SQL Editor** → Run: `CREATE EXTENSION IF NOT EXISTS vector;`
3. Copy the **Connection String** (Transaction mode for pooled):
   ```
   postgresql://postgres.[ref]:[password]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
   ```
4. Add `?pgbouncer=true&connection_limit=1` to the end for Prisma compatibility:
   ```
   postgresql://...@pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1
   ```
5. Set `DATABASE_URL` in your `.env` and on all platforms (Vercel + Railway).

**Run migrations on Supabase:**
```bash
DATABASE_URL="postgresql://..." pnpm db:migrate
DATABASE_URL="postgresql://..." pnpm db:migrate-vectors
DATABASE_URL="postgresql://..." pnpm db:seed
```

---

### 7b. Redis → Upstash

1. Go to [upstash.com](https://upstash.com) → Create Database
2. Choose a region close to your Railway deployment
3. Copy the **Redis URL** (format: `rediss://default:[token]@[host].upstash.io:6379`)
4. Set `REDIS_URL` on both **Vercel** (for the CRM) and **Railway** (for the Worker)

> [!IMPORTANT]
> Upstash uses TLS (`rediss://` not `redis://`). ioredis handles this automatically when the URL starts with `rediss://`.

---

### 7c. Next.js CRM → Vercel

1. Push your repo to GitHub/GitLab
2. Go to [vercel.com](https://vercel.com) → Import Project → select your repo
3. Set **Root Directory** to `apps/crm`
4. Set **Build Command**: `cd ../.. && pnpm build --filter crm`
5. Set **Install Command**: `cd ../.. && pnpm install`
6. Add all **Environment Variables** (Settings → Environment Variables):

```
DATABASE_URL          = postgresql://... (Supabase)
REDIS_URL             = rediss://... (Upstash)
OPENAI_API_KEY        = sk-...
WEBHOOK_BASE_URL      = https://your-crm.vercel.app  ← set AFTER you know your URL
WEBHOOK_SECRET        = your-32-char-secret
NEXT_PUBLIC_APP_URL   = https://your-crm.vercel.app
NODE_ENV              = production
```

> [!NOTE]
> `CHANNEL_SERVICE_URL` is NOT needed on Vercel — only the worker calls the channel service. The CRM just enqueues jobs to Redis.

7. Deploy → Note the production URL (e.g., `https://xeno-crm.vercel.app`)
8. Go back and update `WEBHOOK_BASE_URL` to that URL → Redeploy

**Vercel-specific next.config.ts additions** (ensure SSE works):
```typescript
// apps/crm/next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["your-crm.vercel.app"],
    },
  },
  transpilePackages: ["@xeno/shared-types"],
};
```

---

### 7d. Channel Service → Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your repo
3. Set **Root Directory**: `apps/channel-service`
4. Set **Build Command**: `pnpm build` (runs `tsc`)
5. Set **Start Command**: `node dist/index.js`
6. Add **Environment Variables**:

```
PORT           = 4000  (Railway auto-assigns, but set explicitly)
WEBHOOK_SECRET = your-32-char-secret  ← MUST match CRM's secret
NODE_ENV       = production
```

7. Deploy → Note the Railway URL (e.g., `https://channel-service.railway.app`)
8. Go to **Railway Settings → Networking** → Enable Public Networking
9. Copy the public domain

> [!NOTE]
> The channel service does NOT need `DATABASE_URL`, `REDIS_URL`, or `OPENAI_API_KEY`. Keep its environment minimal.

---

### 7e. BullMQ Worker → Railway

The worker is a **separate Railway service** in the same project:

1. In the same Railway project → **New Service** → Deploy from GitHub (same repo)
2. Set **Root Directory**: `apps/crm`
3. Set **Build Command**: `pnpm install --filter crm`
4. Set **Start Command**: `pnpm --filter crm worker`
   - This runs: `tsx --env-file .env lib/queue/worker.ts`
5. Add **Environment Variables**:

```
DATABASE_URL          = postgresql://... (same Supabase as CRM)
REDIS_URL             = rediss://... (same Upstash as CRM)
CHANNEL_SERVICE_URL   = https://channel-service.railway.app  ← from step 7d
WEBHOOK_BASE_URL      = https://your-crm.vercel.app          ← CRM URL from 7c
WEBHOOK_SECRET        = your-32-char-secret
NODE_ENV              = production
```

> [!IMPORTANT]
> The Worker does **not** need `OPENAI_API_KEY` or `NEXT_PUBLIC_APP_URL`. Do NOT deploy the Next.js app from this service — it's purely a background worker.

6. Set **Restart Policy**: On Failure (ensure jobs are not dropped)
7. Set **Replicas**: 1 (scale up to 2+ for high-volume campaigns)

**After deploying all services, update CHANNEL_SERVICE_URL in the Worker** with the Railway URL from 7d.

---

## 8. Alternative: Full Railway Deployment

If you prefer everything on Railway (no Vercel):

1. Create one Railway project
2. Add services:
   - **CRM** (Next.js): `pnpm --filter crm start` (after build)
   - **Worker**: `pnpm --filter crm worker`
   - **Channel Service**: `node dist/index.js`
   - **PostgreSQL**: Add Railway PostgreSQL plugin
   - **Redis**: Add Railway Redis plugin

Railway auto-injects `DATABASE_URL` and `REDIS_URL` from their plugins. Override these with your actual values if needed.

**Environment variables for CRM on Railway:**
```
PORT                  = 3000
OPENAI_API_KEY        = sk-...
CHANNEL_SERVICE_URL   = (internal Railway URL — use private networking)
WEBHOOK_BASE_URL      = https://crm.up.railway.app
WEBHOOK_SECRET        = your-secret
NEXT_PUBLIC_APP_URL   = https://crm.up.railway.app
NODE_ENV              = production
```

**Use Railway private networking** between services (free, no egress cost):
- Channel Service internal URL: `http://channel-service.railway.internal:4000`
- Set `CHANNEL_SERVICE_URL=http://channel-service.railway.internal:4000` on the Worker

---

## 9. Alternative: Self-Hosted VPS (Docker)

For a self-hosted setup on a Linux VPS (e.g., DigitalOcean, Hetzner, Linode):

### Step 1 — Prepare VPS

```bash
# Install Docker & Docker Compose
curl -fsSL https://get.docker.com | sh
sudo apt install docker-compose-plugin

# Install Node.js 20 + pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pnpm
```

### Step 2 — Clone & Configure

```bash
git clone <your-repo> /opt/xeno
cd /opt/xeno
cp .env.example .env
nano .env  # fill in all values; set WEBHOOK_BASE_URL to your VPS domain
pnpm install
```

### Step 3 — Start Infrastructure

```bash
docker compose up -d  # starts Postgres (pgvector) + Redis
```

### Step 4 — Build

```bash
pnpm build
```

### Step 5 — Run Database Migrations & Seed

```bash
pnpm db:migrate
pnpm db:migrate-vectors
pnpm db:seed
```

### Step 6 — Run Processes with PM2

```bash
npm install -g pm2

# CRM
pm2 start "pnpm --filter crm start" --name crm

# Worker
pm2 start "pnpm --filter crm worker" --name worker

# Channel Service
pm2 start "pnpm --filter channel-service start" --name channel-service

# Save + startup
pm2 save
pm2 startup
```

### Step 7 — Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/xeno-crm
server {
    listen 80;
    server_name crm.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Required for SSE (Server-Sent Events) — disable buffering
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        chunked_transfer_encoding on;
    }
}
```

> [!IMPORTANT]
> The `proxy_buffering off` and `proxy_read_timeout 86400s` settings are **critical** for SSE streams to work. Without them, Nginx will buffer the stream and the real-time log panel will appear frozen.

Add TLS with Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d crm.yourdomain.com
```

---

## 10. Post-Deploy Verification Checklist

Run through these checks after every deployment:

### Infrastructure
```bash
# Postgres responds
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Customer\";"
# Expected: 10000

# Redis responds
redis-cli -u $REDIS_URL ping
# Expected: PONG

# Channel service health
curl https://channel-service.railway.app/health
# Expected: {"ok":true,"service":"channel-service","timestamp":"..."}

# CRM responds
curl https://your-crm.vercel.app
# Expected: 200 OK (HTML response)
```

### End-to-End Campaign Test

1. Open the CRM → **New Campaign**
2. Enter a goal: `"Reach Mumbai-based elite tier customers who bought running shoes in the last 90 days"`
3. Watch the **live thinking log** panel — if SSE is working, you'll see streaming steps
4. Approve Segment → Approve Products → Approve Content → Launch
5. After launch, open **Campaign Detail** → **Live Analytics**
6. Within 30 seconds you should see Delivered events incrementing
7. Within 2 minutes you should see Opened, Clicked events
8. Check the worker logs — look for `[WORKER] ✅ Job complete`
9. Check channel service logs — look for `[CHANNEL] ✅ Message accepted`

### Webhook Verification

```bash
# Check CRM logs for webhook receipts:
# You should see entries like:
# [WEBHOOK] DELIVERED for comm-xyz
# [WEBHOOK] OPENED for comm-xyz

# Verify Communication rows are being updated:
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM \"Communication\" GROUP BY status;"
```

---

## 11. Troubleshooting

### SSE Stream Shows Nothing / Campaigns Stuck

**Symptom:** The thinking log panel stays blank or only shows the first entry.

**Cause:** SSE requires a persistent HTTP connection. This breaks on:
- Vercel Edge Runtime (use Node.js runtime — default for `app/` routes)
- Nginx without `proxy_buffering off`
- Load balancers with short idle timeouts

**Fix:** Ensure each SSE route has no 60s timeout limit. On Vercel, increase function timeout:
```typescript
// apps/crm/app/api/orchestrator/[runId]/stream/route.ts
export const maxDuration = 300; // 5 minutes
```

---

### Worker Can't Connect to Channel Service

**Symptom:** Worker logs show `[WORKER] ❌ Could not reach channel service — is it running on port 4000?`

**Cause:** `CHANNEL_SERVICE_URL` points to wrong host/port.

**Fix:**
1. Verify the channel service is running: `curl $CHANNEL_SERVICE_URL/health`
2. Ensure `CHANNEL_SERVICE_URL` in the Worker's env has no trailing slash
3. On Railway, check the channel service has **public networking enabled**
4. If using private Railway networking: `http://channel-service.railway.internal:4000`

---

### Webhook Callbacks Return 401

**Symptom:** Channel service logs show `[CHANNEL] Webhook callback returned non-OK` with status 401.

**Cause:** `WEBHOOK_SECRET` mismatch between CRM and channel service.

**Fix:**
1. Generate a new shared secret: `openssl rand -hex 32`
2. Set **the same value** on both:
   - CRM platform (Vercel/Railway): `WEBHOOK_SECRET=...`
   - Channel Service (Railway): `WEBHOOK_SECRET=...`
3. Redeploy both services

---

### Communications Stuck at `SENT` Status

**Symptom:** Campaign shows all messages sent but no delivered/opened events appear.

**Causes & Fixes:**
1. **Channel service not reachable by worker** → fix `CHANNEL_SERVICE_URL`
2. **Webhook callbacks rejected (401)** → fix `WEBHOOK_SECRET`
3. **CRM URL wrong** → verify `WEBHOOK_BASE_URL` is the public CRM URL (not localhost)
4. **Stale sweep will eventually recover** — the worker's stale-sweep job marks stuck rows as `FAILED` after the timeout

---

### Prisma: `Error: The "vector" extension is not available`

**Cause:** pgvector extension not enabled on the Postgres instance.

**Fix:**
```sql
-- Run in Supabase SQL Editor or Railway query runner:
CREATE EXTENSION IF NOT EXISTS vector;
```
Then run: `pnpm db:migrate-vectors`

---

### Build Fails: Type Errors

```bash
# Run type check to see all errors
pnpm type-check

# Or build only the CRM
pnpm --filter crm build
```

Common issues:
- Missing `?.` optional chaining on nullable DB query results
- `process.env.X` not typed — check `apps/crm/lib/utils/config.ts`

---

### Redis: `maxRetriesPerRequest must be null` Error

This is a BullMQ requirement. The ioredis connection for BullMQ **must** have:
```typescript
new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})
```
Check `apps/crm/lib/queue/worker.ts` — these options should already be set.

---

### Upstash TLS: `connect ECONNREFUSED`

If using Upstash, ensure the URL starts with `rediss://` (double `s` = TLS):
```
REDIS_URL=rediss://default:TOKEN@HOSTNAME.upstash.io:6379
```
Plain `redis://` will be refused by Upstash.

---

## Quick Reference — All Commands

```bash
# ── Local setup ───────────────────────────────────────────────────────────────
docker compose up -d                # start Postgres + Redis
pnpm install                        # install all dependencies
pnpm db:migrate                     # apply Prisma migrations
pnpm db:migrate-vectors             # apply pgvector columns
pnpm db:seed                        # seed 10K customers, 49 products, ~25K orders
pnpm db:reset                       # wipe + re-seed (DESTRUCTIVE)
pnpm db:studio                      # open Prisma Studio GUI

# ── Development ───────────────────────────────────────────────────────────────
pnpm dev                            # CRM + worker (Turbo)
pnpm --filter channel-service dev   # channel service (separate terminal)

# ── Build ─────────────────────────────────────────────────────────────────────
pnpm build                          # build all packages
pnpm --filter crm build             # build CRM only
pnpm --filter channel-service build # build channel service only

# ── Production start ──────────────────────────────────────────────────────────
pnpm --filter crm start             # start CRM (after build)
pnpm --filter crm worker            # start BullMQ worker
pnpm --filter channel-service start # start channel service

# ── Type checking ─────────────────────────────────────────────────────────────
pnpm type-check                     # type check all packages
pnpm --filter crm type-check        # CRM only
```
