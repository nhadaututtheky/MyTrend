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

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY . .

# Data directory for session persistence
RUN mkdir -p /app/data

EXPOSE 3457

CMD ["bun", "run", "src/index.ts"]
