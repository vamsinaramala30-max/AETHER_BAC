# ============================================================================
# Stage 1: Build & Compilation
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma engine compatibility on Alpine
RUN apk add --no-cache openssl libc6-compat

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and build configs
COPY tsconfig.json ./
COPY src ./src/
COPY server.ts ./

# Compile TypeScript to dist/
RUN npx tsc

# ============================================================================
# Stage 2: Production Runtime
# ============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Install runtime OpenSSL and curl/wget for health checks
RUN apk add --no-cache openssl libc6-compat wget curl

ENV NODE_ENV=production
ENV PORT=5001
ENV HOST=0.0.0.0

# Copy package manifests and production dependencies
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies and re-generate Prisma client
RUN npm ci --omit=dev && npx prisma generate

# Copy compiled artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Ensure logs and uploads directories exist with proper permissions
RUN mkdir -p logs uploads && chown -R node:node /app

USER node

EXPOSE 5001

# Production liveness health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health/live || exit 1

CMD ["node", "dist/server.js"]
