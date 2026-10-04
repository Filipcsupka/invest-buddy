# Scan runner image with both agent CLIs (claude and codex). Build from the repo root:
#   docker build -f scanner/Dockerfile -t ghcr.io/filipcsupka/invest-buddy-scanner:dev .
# Auth is not baked in. See scanner/README.md, "Auth in a container".
FROM node:22-slim
ENV NODE_ENV=production \
    HOME=/home/scanner \
    CLAUDE_CONFIG_DIR=/home/scanner/.claude \
    CODEX_HOME=/home/scanner/.codex \
    DISABLE_AUTOUPDATER=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bubblewrap \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code @openai/codex && npm cache clean --force \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin scanner
WORKDIR /app/scanner
COPY scanner/run-scan.mjs scanner/validate.mjs scanner/compare.mjs scanner/universe.json ./
COPY scanner/prompts ./prompts
COPY scanner/schema ./schema
RUN mkdir -p /app/scanner/out /home/scanner/.claude /home/scanner/.codex \
    && chown -R scanner:scanner /app/scanner/out /home/scanner
USER 10001
ENTRYPOINT ["node", "/app/scanner/run-scan.mjs"]
