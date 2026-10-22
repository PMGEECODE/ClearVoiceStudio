# -----------------------------------------------------------------------------
# Stage 1: Build Next.js Application
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install native build tools required by some npm packages (e.g. node-gyp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first (layer-cache friendly)
COPY package.json package-lock.json ./
COPY scripts/patch-transformers.mjs ./scripts/patch-transformers.mjs

# Install all npm dependencies (skip Electron binary — not needed in Docker)
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci

# Copy project source files
COPY tsconfig.json next.config.ts ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY shared ./shared

# Build the Next.js production bundle
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Prune devDependencies to reduce the layer size copied into the runner
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime (Node 20 + FFmpeg)
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Install ffmpeg for audio/video format conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy built Next.js artifacts and pruned node_modules from builder stage
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public ./public
COPY --from=builder /app/shared ./shared

# Copy bundled voices (includes default af_heart.bin)
COPY voices ./voices

# Expose the Next.js port
EXPOSE 3000

# start.mjs launches the Next.js server
CMD ["node", "scripts/start.mjs"]
