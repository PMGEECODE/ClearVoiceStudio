# -----------------------------------------------------------------------------
# Stage 1: Build Next.js Application
# -----------------------------------------------------------------------------
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Install build tools if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY scripts/patch-transformers.mjs ./scripts/patch-transformers.mjs

# Install dependencies (skipping Electron dev binary download)
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci

# Copy project source
COPY tsconfig.json next.config.ts ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts

# Build Next.js production bundle
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Prune devDependencies to keep container light
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime (Python 3.11 + Node 20)
# -----------------------------------------------------------------------------
FROM python:3.11-slim-bullseye AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    PIPER_SERVER_URL=http://127.0.0.1:5000 \
    PYTHONUNBUFFERED=1

# Install Node.js 20 & ffmpeg (required for audio conversion & synthesis)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements (Piper TTS, ONNX Runtime, Flask, NumPy < 2)
COPY piper-tts/requirements.txt ./piper-tts/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r ./piper-tts/requirements.txt

# Copy built Next.js artifacts & dependencies from builder
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts

# Copy voice models & metadata from repository
COPY piper-tts/ ./piper-tts/

# If no voice model was included in git, download default high-quality voice
RUN if [ ! -f ./piper-tts/en_US-lessac-medium.onnx ]; then \
      python3 -m piper.download_voices --download-dir ./piper-tts en_US-lessac-medium; \
    fi

# Expose Next.js port
EXPOSE 3000

# Start script orchestrates both Piper TTS and Next.js
CMD ["node", "scripts/start.mjs"]
