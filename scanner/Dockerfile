# Scan runner image with both agent CLIs (claude and codex). Build from the repo root:
#   docker build -f scanner/Dockerfile -t ghcr.io/filipcsupka/invest-buddy-scanner:dev .
# Auth is not baked in. See scanner/README.md, "Auth in a container".
# The image holds two entry points. The default entrypoint is the daily scan (run-scan.mjs). The script-first extractor runs with
#   command: ["node", "/app/scanner/run-extract.mjs"]   args: ["--symbols-file", "/work/detect.json"]  (see docs/data.md, Extraction)
#   command: ["node", "/app/scanner/run-judge.mjs"]     (judge step, see docs/data.md, Judge)
# Setting `command` replaces the ENTRYPOINT; `args` alone would be passed to run-scan.mjs.
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
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
COPY scanner/run-scan.mjs scanner/run-extract.mjs scanner/run-judge.mjs scanner/gate-db.mjs scanner/quotes.mjs scanner/extraction-log.mjs scanner/ai-budget.mjs scanner/anthropic-cutoff.mjs scanner/claude-usage.mjs scanner/validate.mjs scanner/compare.mjs scanner/figure-tokens.mjs scanner/trading-calendar.mjs scanner/universe.json ./
COPY scanner/prompts ./prompts
COPY scanner/schema ./schema
RUN mkdir -p /app/scanner/out /home/scanner/.claude /home/scanner/.codex \
    && chown -R scanner:scanner /app/scanner/out /home/scanner
USER 10001
ENTRYPOINT ["node", "/app/scanner/run-scan.mjs"]
