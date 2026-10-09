# Scan runner image with both agent CLIs (claude and codex). Build from the repo root:
#   docker build -f scanner/Dockerfile -t ghcr.io/filipcsupka/invest-buddy-scanner:dev .
# Auth is not baked in. See scanner/README.md, "Auth in a container".
# The image holds two entry points. The default entrypoint is the daily scan (run-scan.mjs). The script-first extractor runs with
#   command: ["node", "/app/scanner/run-extract.mjs"]   args: ["--symbols-file", "/work/detect.json"]  (see docs/data.md, Extraction)
#   command: ["node", "/app/scanner/run-judge.mjs"]     (judge step, see docs/data.md, Judge)
# Setting `command` replaces the ENTRYPOINT; `args` alone would be passed to run-scan.mjs.
FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
ENV NODE_ENV=production \
    HOME=/home/scanner \
    CLAUDE_CONFIG_DIR=/home/scanner/.claude \
    CODEX_HOME=/home/scanner/.codex \
    DISABLE_AUTOUPDATER=1
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates bubblewrap \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code @openai/codex && npm cache clean --force \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin scanner
WORKDIR /app/scanner
COPY scanner/run-scan.mjs scanner/run-extract.mjs scanner/run-judge.mjs scanner/gate-db.mjs scanner/quotes.mjs scanner/extraction-log.mjs scanner/ai-budget.mjs scanner/anthropic-cutoff.mjs scanner/claude-usage.mjs scanner/validate.mjs scanner/compare.mjs scanner/figure-tokens.mjs scanner/universe.json ./
COPY scanner/prompts ./prompts
COPY scanner/schema ./schema
RUN mkdir -p /app/scanner/out /home/scanner/.claude /home/scanner/.codex \
    && chown -R scanner:scanner /app/scanner/out /home/scanner
USER 10001
ENTRYPOINT ["node", "/app/scanner/run-scan.mjs"]
