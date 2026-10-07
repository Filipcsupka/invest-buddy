# Session handoff, updated 2026-10-07

Read this first in the next session, then `docs/tasks-open.md` (task list with definitions of done). Product rules live in `~/Documents/ops-brain/projects/investing-platform/`.

## Where things stand

Read `docs/STATE-2026-10-07.md` first for the live snapshot (jobs, counts, tickers, what to check).

The pipeline runs by itself at night on khtz, Tuesday to Saturday (Europe/Bratislava): prices 00:30, collect 01:00, detect 01:35, extract 01:50, macro 04:00, reconcile 04:10, daily 04:25, judge 05:30, digest 07:30, portfolio 06:00 UTC. Discovery runs Saturday 09:30. Extract and judge are AI steps behind the change gate, so unchanged tickers cost nothing. Backup, retention and the old scan jobs stay suspended. The first full load by hand is done, and the first real nightly run is the night of 2026-10-07 to 2026-10-08.

- Cluster: khtz (personal Hetzner k3s). Shell access: `export KUBECONFIG=~/.kube/khtz`. The `kubernetes` MCP tool uses context `default` and is read-only.
- Deployed image: pinned in infra `gitops/apps/invest-buddy/overlays/prod/kustomization.yaml`; check it equals the short sha of `main`.
- Database: Postgres in namespace `invest`, migrations 001 to 020 applied. Test data only, safe to wipe and rebuild.
- AI limits: the Claude token is a subscription. The real limits are the five-hour and weekly windows, not USD or tokens. There is no monthly budget. Jobs log `USAGE` lines and `ANTHROPIC CUTOFF`; report with `npm run ai-usage`.
- Repos: app `Filipcsupka/invest-buddy` (this repo, branch `main`), infra `Filipcsupka/infra`.
- Argo CD syncs infra every 60 s (`timeout.reconciliation: 60s`) with automated prune and self-heal.
- Diagrams of the pipeline, deploy path and runtime: `docs/architecture.md`.

## How a change reaches the cluster

1. PR to `main` in this repo. CI runs `quality` and builds the web and scanner images (`ghcr.io/filipcsupka/invest-buddy[-scanner]:sha-<7>`).
2. After merge, the `deploy-gitops` job pins the new tag in infra (repo variable `INFRA_BUMP=true`, secret `INFRA_REPO_TOKEN`). Argo applies it within about a minute. The web pod's init container runs new migrations.
3. Manifest changes under `deploy/gitops/` do not travel by themselves. Copy the changed files into infra `gitops/apps/invest-buddy/base/` by PR. Do not overwrite `backup-cronjob.yaml` or `scan-cronjob.yaml` (infra keeps live suspends the proposal lacks). Sealed secrets go in infra `gitops/sealed-secrets/invest/`.
4. If several PRs merge in a row, the last build to finish decides the pin. Merge them together and check that the pin equals the `main` short sha.

## What a manual run looks like

Create a Job from a CronJob and read its log. To pass arguments, patch them in:
```
kubectl -n invest create job NAME --from=cronjob/invest-buddy-judge --dry-run=client -o json \
  | jq '.spec.template.spec.containers[0].args += ["--force"]' | kubectl -n invest apply -f -
```
Order for a full pass (asOf = last US session): `collect` (SEC filings, 100-day window), `collect --source fred`, `collect-alphavantage` (20 requests a day cap), `extract` (AI, haiku, about $2.5 for 35 tickers), `macro`, `reconcile`, `daily`, `judge` (AI, sonnet, `--force` to rerun the same day), `portfolio`. Delete only the Jobs you created, by name. Never `delete job --all`.

## What was built this session

- Collectors for SEC EDGAR (filings, Form 4, companyfacts), a GlobeNewswire feed (times out from the cluster, now optional), FRED, and Alpha Vantage EPS surprise. Documents and facts go to `source_documents`, `collected_facts`, `collector_runs`.
- Extractor (AI, no tools) with quote check against stored text. Reconcile accepts a single-extractor claim when its quote is verified (`verified_single`), SEC data (revenue growth, Form 4 insider flag) and data rules (EPS beat, macro) override.
- Macro step with no AI: `dataTailwind` (10-year yield change and VIX) and `sectorRotationIntoGrowth` (universe against SPY). Thresholds are placeholders.
- Signals come from data only. Ideas carry a size tier (STARTER, STANDARD, FULL, ADD_THIRD, ADD_HALF) and no EUR amount on the public page. The owner's EUR band exists only with a baseline and only in the flag-gated private view.
- Judge (AI, one call) explains signals that changed. Evidence links come from verified findings plus the earnings release, 10-Q and Form 4. The script tops up links when the model cites fewer than two. A symbol that fails validation is skipped, not fatal.
- Web: company page with idea card, a source line per rule, data sources summary; track record; portfolio with weights, real SPY and own NAV history (`portfolio_nav_history`).
- IBKR: Flex Web Service query ID 1662148, token in sealed secret `invest-buddy-flex-secrets`. The portfolio job converts to EUR, posts a `flex` baseline and stores NAV points.

## Secrets (names only, values are sealed)

`invest-buddy-secrets` (DATABASE_URL, INGEST_TOKEN and others), `invest-buddy-scanner-secrets` (Claude token), `invest-buddy-market-secrets` (Twelve Data), `invest-buddy-source-keys` (FRED, EIA, Alpha Vantage, BLS, OpenFIGI; only FRED and Alpha Vantage are read by code), `invest-buddy-flex-secrets` (Flex token and query ID). Keys were pasted into chat during this session, so rotate them if that matters.

## Needs the owner

1. Flex query 1662148 is set (Breakout by Day = Yes, Period = Last 365 Calendar Days) and the curve is backfilled (231 NAV points). The response has one statement per day; the parser handles that.
2. Decide the ideas page (task B3): ADR-001 keeps EUR sizing out of the public product.
3. Review placeholders (C5, F6): signal tier thresholds, macro thresholds (`MACRO_*`), insider net buy threshold (`INSIDER_MIN_NET_BUY_USD`), the fundamentals policy (`verified_single`), the sizing matrix in `docs/sizing-guide.md`.
4. Lawyer check before any paid launch (G5).
5. Real portfolio baseline is now from Flex, the earlier test baseline (EUR 600 cash, 200 a month) was replaced for the same date. Set `monthlyContributionEur` if the judge should use it.

## Next steps, in order

1. Observe the first nightly runs and go through the list in `docs/STATE-2026-10-07.md`.
2. Alerts (E2): a failed night is only visible in logs and `/api/health`. Pick a delivery channel and build it.
3. Diagnose the tickers with fundamentals or technical 0 (see the state file).
4. F5 fixed review calendar, backups (E1), schema and role split (C2), page render logging.
5. Owner decisions: placeholders (C5, F6), ideas page (B3), owner view access, lawyer check (G5).

## Pitfalls found

- Collect stamps facts with the run date, one day after the scoring date. Rules that need `as_of <= asOf` ignore them (fixed for insider with a 3-day lead).
- Collect window was 30 days, earnings evidence counts 100. Default is 100 now.
- Judge figure check flags label numbers ("200-day", "S&P 500"). Many are handled; a skip now logs the surrounding words.
- `listIdeas` hides ideas whose evidence is not stored display-allowed documents. The public SEC XBRL address is allowed.
- Keep the `sleep` and long loops out of tool calls that time out; use background runs.
- Alpha Vantage free tier is 25 requests a day. Third-party sources (Alpha Vantage, FRED, VIX, RSS) are never shown with links or raw numbers.
- A hard reload in the IBKR portal did not work in Safari; a private window did.
- With Breakout by Day, the Flex response holds one `FlexStatement` per day (261 for a year). Code that assumes one statement fails silently; the portfolio job now logs a short error class per step.
- A CronJob's `activeDeadlineSeconds` also applies to a Job made from it by hand. Set it higher in the patched Job for a full manual pass (`.spec.activeDeadlineSeconds`).
- A manual full extract needs `--force` (or `--only` with a ticker list). `--force` also skips the "already extracted" check, so resume with `--only` for the tickers that are not in `extraction_runs` yet.
- The Claude pool launcher (`~/Documents/ops-brain/agent-tools/claude-pool`) refuses accounts whose managed credential expires within ten minutes. After the Mac sleeps, both accounts can be ineligible and Claude workers fail at `agent_readiness`; log in again to refresh them.
- The repo once tracked a `node_modules` symlink because `.gitignore` had `node_modules/` (a trailing slash does not match a symlink). Fixed.
