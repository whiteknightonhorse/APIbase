# APIbase.pro — Multi-stage Dockerfile (§12.194, §12.219)
# Produces minimal Node.js image with non-root appuser:1001.

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy Prisma schema and generate client
COPY prisma/ ./prisma/
RUN npx prisma generate

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Production dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY prisma/ ./prisma/
RUN npx prisma generate

# ---------------------------------------------------------------------------
# Stage 3: Runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# Create non-root user (§12.219)
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

WORKDIR /app

# Copy production node_modules
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy Prisma schema + generated client for runtime
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma

# Copy migration files and scripts for entrypoint
COPY prisma/migrations ./prisma/migrations
COPY scripts/ ./scripts/
COPY docker/entrypoint.sh ./entrypoint.sh

# Package.json needed for prisma CLI
COPY package.json ./

RUN chmod +x ./entrypoint.sh && \
    chown -R 1001:1001 /app

USER 1001:1001

EXPOSE 3000 3001 3002

ENTRYPOINT ["./entrypoint.sh"]
