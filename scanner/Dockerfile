# Scan runner image. Build from the repo root:
#   docker build -f scanner/Dockerfile -t ghcr.io/filipcsupka/invest-buddy-scanner:dev .
FROM node:22-slim
ENV NODE_ENV=production \
    HOME=/home/scanner \
    CLAUDE_CONFIG_DIR=/home/scanner/.claude \
    DISABLE_AUTOUPDATER=1
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin scanner
WORKDIR /app/scanner
COPY scanner/run-scan.mjs scanner/validate.mjs scanner/universe.json ./
COPY scanner/prompts ./prompts
COPY scanner/schema ./schema
RUN mkdir -p /app/scanner/out /home/scanner/.claude \
    && chown -R scanner:scanner /app/scanner/out /home/scanner
USER 10001
ENTRYPOINT ["node", "/app/scanner/run-scan.mjs"]
