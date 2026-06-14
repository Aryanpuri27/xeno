# Stage 1: Build stage
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
RUN npm install -g pnpm@9.15.0

# Copy workspace lockfile, config and packages
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/crm/package.json ./apps/crm/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared-types ./packages/shared-types
COPY apps/crm ./apps/crm

# Generate Prisma client and build Next.js application
ENV DATABASE_URL="postgresql://localhost:5432/mock"
ENV DIRECT_URL="postgresql://localhost:5432/mock"
ENV REDIS_URL="redis://localhost:6379"
ENV OPENAI_API_KEY="mock-openai-key-for-build-validation-only-12345"
ENV CHANNEL_SERVICE_URL="http://localhost:4000"
ENV WEBHOOK_BASE_URL="http://localhost:3000"
ENV WEBHOOK_SECRET="mock-webhook-secret-for-build-validation-only-12345"

RUN pnpm --filter crm exec prisma generate
RUN pnpm --filter crm build

# Stage 2: Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm@9.15.0

ENV NODE_ENV=production

# Copy built app and dependencies from builder stage
COPY --from=builder /app /app

EXPOSE 3000

# Default command runs the web app. Can be overridden in docker-compose for the worker.
CMD ["pnpm", "--filter", "crm", "start"]
