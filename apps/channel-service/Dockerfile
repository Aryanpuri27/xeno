# Stage 1: Build stage
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm@9.15.0

# Copy workspace lockfile, config and packages
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/channel-service/package.json ./apps/channel-service/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared-types ./packages/shared-types
COPY apps/channel-service ./apps/channel-service

# Build the Express TypeScript application
RUN pnpm --filter channel-service build

# Stage 2: Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@9.15.0

ENV NODE_ENV=production

# Copy built application and dependencies
COPY --from=builder /app /app

EXPOSE 4000

# Start Express channel service
CMD ["pnpm", "--filter", "channel-service", "start"]
