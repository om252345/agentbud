FROM oven/bun:latest AS build-frontend
WORKDIR /app

# Install frontend dependencies
COPY frontend/package.json frontend/bun.lock* ./frontend/
RUN cd frontend && bun install

# Build frontend
COPY frontend/ ./frontend/
RUN cd frontend && bun run build

# ------- Production Stage -------
FROM oven/bun:latest

LABEL org.opencontainers.image.title="AgentBud"
LABEL org.opencontainers.image.description="Open-source AI agent observability proxy with cryptographic tracing, PII redaction, and a real-time dashboard."
LABEL org.opencontainers.image.url="https://github.com/AgentBud/agentbud"
LABEL org.opencontainers.image.source="https://github.com/AgentBud/agentbud"
LABEL org.opencontainers.image.vendor="AgentBud"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install backend dependencies
COPY package.json bun.lock* ./
RUN bun install --production

# Copy backend source
COPY src/ ./src/

# Copy default config (users can override via volume mount)
COPY agent-config.yaml ./

# Copy built frontend from previous stage
COPY --from=build-frontend /app/frontend/dist ./frontend/dist

# Create persistent directories
RUN mkdir -p /app/data /app/keys

# Expose port and set defaults
EXPOSE 3000
ENV PORT=3000
ENV DB_PATH=/app/data/agentbud.db

CMD ["bun", "run", "src/index.ts"]
