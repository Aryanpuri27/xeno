# Xeno CRM — AI-Native Campaign Hub (Nike Edition)

Xeno CRM is a premium, AI-native marketing campaign orchestration platform built specifically for Nike. It leverages autonomous multi-agent pipelines, PostgreSQL vector similarity search, and BullMQ background execution to transform natural language objectives into highly optimized, channel-specific message dispatches.

Designed with a premium **Obsidian-Carbon dark identity**, Xeno implements a **Human-in-the-Loop (HITL)** state machine that pauses execution at each critical stage (Audience Segmentation, Product Recommendations, Content Generation, Channel Selection) for marketer review and manual tuning before final launch.

---

## 1. Project Features & Core Architecture

Xeno splits the campaign lifecycle into 4 sequential stages, utilizing specialized GPT-powered agents to generate artifacts:

*   **Stage 1: Segment Agent**: Translates natural language objectives into raw PostgreSQL queries. Matches target groups in a read-only transaction and shows matching customer samples.
*   **Stage 2: Product Agent**: Matches target cohorts with relevant inventory. Uses **pgvector** similarity search (`<=>` cosine distance) to query the Nike catalog using embeddings.
*   **Stage 3: Content Agent**: Generates brand-compliant, channel-specific messages. Adheres strictly to Nike's brand tone guidelines (bold, motivational, conversational, "Just Do It") and handles SMS character limit retries.
*   **Stage 4: Channel Agent**: Optimizes delivery channels (WhatsApp, Email, SMS, RCS) using historical conversion, click-through, and open rates from the database.

### System Topology

```
                  ┌───────────────────────────────────────────────┐
                  │                                               │
                  │             Marketer Dashboard                │
                  │            (Next.js App Router)               │
                  │                       ▲                       │
                  │   Start Run           │ SSE Log Streams       │
                  │        │              │                       │
                  │        ▼              │                       │
                  │ ┌──────────────┐      │                       │
                  │ │  Next.js API │──────┘                       │
                  │ └──────┬───────┘                              │
                  │        │ Enqueue Jobs                         │
                  │        ▼                                      │
                  │ ┌──────────────┐       ┌─────────────────┐    │
                  │ │ Redis Broker │──────▶│  BullMQ Worker  │    │
                  │ │   (BullMQ)   │       │  (Standalone)   │    │
                  │ └──────────────┘       └────────┬────────┘    │
                  │                                 │ POST /send  │
                  │                                 ▼             │
                  │                        ┌─────────────────┐    │
                  │                        │ Channel Service │    │
                  │                        │ (Express Port:  │    │
                  │                        │      4000)      │    │
                  │                        └────────┬────────┘    │
                  │                                 │ Webhooks    │
                  │                                 ▼             │
                  │                       ┌──────────────────┐    │
                  │                       │  PostgreSQL DB   │    │
                  │                       │  (with pgvector) │    │
                  │                       └──────────────────┘    │
                  └───────────────────────────────────────────────┘
```

---

## 2. Local Development Setup

### Prerequisites
*   **Node.js**: `v20.x` or higher
*   **pnpm**: `v9.x` or higher
*   **Docker Desktop**: Required to run database and message broker containers

### Installation Steps

1.  **Clone & Install Dependencies**:
    ```bash
    git clone <your-repo-url> xeno
    cd xeno
    pnpm install
    ```

2.  **Start Dev Infrastructure (PostgreSQL + Redis)**:
    ```bash
    # Launches Postgres (configured with pgvector extension) and Redis
    docker compose up -d
    
    # Confirm both services are running and healthy
    docker compose ps
    ```

3.  **Configure Environment Variables**:
    Copy the example file to `.env` in the root:
    ```bash
    cp .env.example .env
    ```
    Add your `OPENAI_API_KEY` inside `.env`. The other parameters are pre-configured to point to local Docker services:
    - `DATABASE_URL`: `postgresql://xeno:xeno_secret@localhost:5432/xeno_crm`
    - `REDIS_URL`: `redis://localhost:6379`
    - `CHANNEL_SERVICE_URL`: `http://localhost:4000`
    - `WEBHOOK_BASE_URL`: `http://localhost:3000`
    - `WEBHOOK_SECRET`: A secure random secret string (must match between services)

4.  **Run Migrations and Seed Data**:
    Apply the database schema, enable the pgvector columns, and load the 10,000-customer Nike seed file:
    ```bash
    # 1. Apply Prisma migrations
    pnpm db:migrate
    
    # 2. Add raw pgvector table columns for CampaignMemory & Product
    pnpm db:migrate-vectors
    
    # 3. Populate database with 10K Customers, 49 Products, and ~25K Orders
    pnpm db:seed
    ```

5.  **Start the Services**:
    Run all three service layers concurrently in development mode:
    ```bash
    # Starts Next.js app (Port 3000) and BullMQ worker concurrently
    pnpm dev
    
    # In a separate terminal, start the Channel mock service (Port 4000)
    pnpm --filter channel-service dev
    ```

6.  **Verify Setup**:
    Verify that components are running by hitting their health check endpoints:
    - **CRM web portal**: Open [http://localhost:3000](http://localhost:3000)
    - **Channel Service API**: `curl http://localhost:4000/health` (should return `{"ok":true}`)
    - **CRM Server API**: `curl http://localhost:3000/api/health`

---

## 3. Production Deployment & AWS Hosting

For high-availability, zero-downtime hosting, split the application layer across the following cloud resources:

*   **Web Portal**: Deploy [apps/crm](file:///c:/Users/puria/Desktop/xeno/apps/crm) to Vercel or run a Next.js server on AWS ECS Fargate behind an Application Load Balancer. Ensure `maxDuration` supports longer HTTP streaming limits if streaming SSE.
*   **Background Worker & Channel Service**: Deploy both [apps/crm/lib/queue/worker.ts](file:///c:/Users/puria/Desktop/xeno/apps/crm/lib/queue/worker.ts) and [apps/channel-service](file:///c:/Users/puria/Desktop/xeno/apps/channel-service) to AWS ECS Fargate or a self-hosted VM (DigitalOcean, Hetzner, EC2) using PM2 for process monitoring.
*   **PostgreSQL**: Use AWS RDS or Supabase. Ensure pgvector is active:
    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;
    ```
*   **Redis Broker**: Set up Amazon ElastiCache Redis (cluster mode) or use Upstash Serverless Redis. Use a `rediss://` TLS URL pattern in production.

### Reverse Proxy Configuration (Nginx for SSE support)
Ensure Nginx disables response buffering so real-time SSE thinking logs stream continuously in the client UI:
```nginx
server {
    listen 80;
    server_name crm.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        
        # CRITICAL: Disable buffering for SSE stream support
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        chunked_transfer_encoding on;
    }
}
```

---

## 4. Troubleshooting Checklist

*   **Problem**: Real-time log streams or campaign analytics update counters are stuck or freeze in the browser.
    - *Fix*: Next.js Server-Sent Events (SSE) require buffering disabled. Turn off buffering on your load balancer or reverse proxy (`proxy_buffering off`).
*   **Problem**: Campaign metrics stuck at `SENT` state and never update to `DELIVERED`, `OPENED`, or `CONVERTED`.
    - *Fix*: Check the logs of the `channel-service` or the CRM app. Webhook receipt calls return `401 Unauthorized` if the `WEBHOOK_SECRET` variable is not identical between the CRM and the Channel Service.
*   **Problem**: Background worker logs show `Could not reach channel service`.
    - *Fix*: Ensure the worker's `CHANNEL_SERVICE_URL` variable does not have a trailing slash and points to the correct private internal port (e.g. `http://localhost:4000` or ECS service discovery hostname).
*   **Problem**: Prisma throws `The "vector" extension is not available`.
    - *Fix*: Enable the vector extension in the database before running migrations. Connect directly to Postgres and execute `CREATE EXTENSION IF NOT EXISTS vector;`.

---
