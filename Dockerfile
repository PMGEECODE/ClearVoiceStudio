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
# NOTE: there is no public/ directory in this project — do not add that COPY
COPY tsconfig.json next.config.ts ./
COPY src ./src
COPY scripts ./scripts

# Build the Next.js production bundle
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Prune devDependencies to reduce the layer size copied into the runner
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production Runtime (Python 3.11 + Node 20)
# -----------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    PIPER_PORT=5000 \
    PIPER_SERVER_URL=http://127.0.0.1:5000 \
    PIPER_DIR=/app/piper-tts \
    PYTHON_BIN=/usr/local/bin/python3 \
    PYTHONUNBUFFERED=1

# Install Node.js 20, ffmpeg, and espeak-ng
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    ffmpeg \
    espeak-ng \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into the system Python
# (numpy<2 is pinned to avoid the C99 crealf ABI break in numpy 2.x)
COPY piper-tts/requirements.txt ./piper-tts/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r ./piper-tts/requirements.txt

# Copy built Next.js artifacts and pruned node_modules from builder stage
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts ./scripts

# Copy voice models and metadata — .dockerignore excludes piper-tts/.venv
# so the full directory copy is safe and includes all committed model files
COPY piper-tts/ ./piper-tts/

# If the default voice model was not committed to git, download it at build time.
# We download directly from the Hugging Face piper-voices repository using curl.
RUN if [ ! -f ./piper-tts/en_US-lessac-medium.onnx ]; then \
      echo "[Docker] Downloading default voice model..." && \
      curl -fsSL \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx" \
        -o ./piper-tts/en_US-lessac-medium.onnx && \
      curl -fsSL \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json" \
        -o ./piper-tts/en_US-lessac-medium.onnx.json; \
    fi && chmod -R 777 ./piper-tts

# Expose the Next.js port
EXPOSE 3000

# start.mjs orchestrates both the Piper TTS engine and Next.js
CMD ["node", "scripts/start.mjs"]
