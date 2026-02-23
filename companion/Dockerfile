FROM node:22-slim AS node-base

FROM oven/bun:1

# Copy Node.js from official image (guaranteed working binary)
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
COPY --from=node-base /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

# Install Claude Code CLI globally
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
