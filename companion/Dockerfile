FROM oven/bun:1 AS base

# Install Node.js (required for Claude CLI)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally via npm
RUN npm install -g @anthropic-ai/claude-code

# oven/bun:1 has built-in user "bun" (uid 1000) — use it
# Claude Code blocks bypassPermissions as root, so non-root is required

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY . .

# Data directory for session persistence
RUN mkdir -p /app/data && chown -R bun:bun /app

EXPOSE 3457

USER bun

CMD ["bun", "run", "src/index.ts"]
