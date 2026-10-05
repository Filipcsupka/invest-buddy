# Open tasks

State on 2026-10-05. Each task can be picked up alone or given to one agent. "Approval" means the owner must say yes before the step runs (cluster, push, secrets, money). Pick the lowest open task in a group whose dependencies are done. Tick the box and add one line on what changed.

Groups: A first live run, B web, C pipeline quality, D data and accounts, E operations.

## A. First live run on khtz

### A1. Build the images
- Depends on: PR #2 (`invest-buddy`) green. GitHub Actions had a major outage on 2026-10-05, so CI had no runner.
- Do: merge PR #2 to `main` once `quality` passes. The `image` job pushes `ghcr.io/filipcsupka/invest-buddy` and `invest-buddy-scanner` with tag `sha-<7 chars>`.
- Fallback if Actions stays down: build both images locally for the cluster architecture (check the node arch first, this Mac is arm64) and import them. Needs approval, because the `gh` token has no `write:packages`.
- DoD: both tags exist and pull on a khtz node. Tag written down in this file.
- Approval: merge, any import.

### A2. Merge infra and pin the tags
- Depends on: A1.
- Do: update `overlays/prod/kustomization.yaml` in infra PR #15 to the new tag for both images, check `kustomize build` and `kubeconform -strict`, merge. Argo auto-syncs (`selfHeal`); the repo sets `timeout.reconciliation: 300s`, so confirm the live value too.
- DoD: `kubectl -n invest get cronjob` shows collect, detect, extract, judge, reconcile and daily all suspended; the web pod runs the new tag and `/api/health` returns 200.
- Approval: infra merge.

### A3. Apply migrations 007 to 010
- Depends on: A2.
- Do: run the migrate step from the new web image against the invest Postgres (a one-off Job or the existing migrate path). Take a `pg_dump` first. The data is test data, so a wipe and restart is acceptable.
- DoD: `\dt` lists `source_documents`, `collected_facts`, `collector_runs`, `cusip_map`, `extraction_runs`, `trade_ideas`, `judge_runs`, `portfolio_baseline`; `schema_migrations` shows 010.
- Approval: yes, it writes to the live database.

### A4. First manual collect Job
- Depends on: A3, `SEC_USER_AGENT` set (done in the repo, check it in the live ConfigMap).
- Do: create one Job from the collect CronJob (`kubectl create job --from=cronjob/invest-buddy-collect`). Run `collect --ping` first from a pod to prove egress to sec.gov, data.sec.gov and the keyless sources from `k8s-worker-01`.
- DoD: `collector_runs` has a row with no unexplained failures; `source_documents` has rows for at least 10 symbols with `meta.display_allowed` set (true for edgar and sec, false for rss); a note lists each source that failed or was skipped and why (missing key, 429, egress).
- Approval: yes.

### A5. Live extraction check
- Depends on: A4.
- Do: re-run one live NVDA extraction with the keyword-window excerpts. The first live run left 7 of 8 fields null.
- DoD: at least 5 of 8 fields filled, every positive claim passes the quote check, the token use and cost are noted here.
- Approval: model usage on the subscription token.

### A6. Detect, extract and the web
- Depends on: A5.
- Do: run detect, then extract for all symbols, then reconcile and daily by hand. Unsuspend reconcile and daily last, as the deploy README says.
- DoD: `scan_findings`, `consensus_findings` and `score_results` hold rows from this run; `/api/health` shows today's scan, reconcile and score dates; `/en/dashboard` and `/en/company/NVDA` render those scores with no sample stamp.
- Approval: yes for each Job.

### A7. Judge run
- Depends on: A6.
- Do: one manual judge Job. Check that edgar-backed evidence reaches the judge input (finding fixed on 2026-10-05).
- DoD: `judge_runs` has a row, `trade_ideas` has ideas that each have at least two evidence links, and the figure check passes. `/ideas` stays hidden until B3 is decided.
- Approval: yes.

### A8. Switch on the schedule
- Depends on: A6 and A7 each ran cleanly once.
- Do: unsuspend collect, detect, extract, reconcile, daily and judge in infra one at a time, in schedule order, over several days.
- DoD: three consecutive weekdays with no failed Job and a fresh `/api/health`.
- Approval: each infra change.

## B. Web

### B1. Real benchmark for `/track-record`
- Do: store a benchmark series (SPY or CSPX bars in `daily_bars`; migration 006 seeds a benchmark instrument) and replace `fixtureBenchmark()` in `src/app/[locale]/track-record/page.tsx`.
- DoD: the page shows a real benchmark line in `DATA_MODE=db`; a test fails if the fixture benchmark appears in db mode.

### B2. Portfolio page benchmark and sample check
- Do: trace what `benchmarkSample` does in `src/db/portfolio.ts` and `/portfolio`. Make live mode use real data or hide the block.
- DoD: no fixture figure is reachable in `DATA_MODE=db`; test added.

### B3. Decide the ideas page
- Owner decision. ADR-001 forbids EUR sizing in the public product, and the ideas page shows EUR bands sized to one private portfolio.
- Options: keep it hidden; put it behind auth or an IP allowlist and set `IDEAS_PAGE=on`; show ideas without EUR.
- DoD: decision recorded as an ADR line, `IDEAS_PAGE` set or left unset in `web.yaml` to match, and a test for the chosen behaviour.

### B4. Sample stamp test
- Do: add a test that the sample stamp and fixture labels never render with `DATA_MODE=db`.
- DoD: test in `src/`, runs in CI.

### B5. Empty and stale states
- Do: check each page when `score_results` is empty or older than 3 days. `/api/health` already returns null dates for an empty database.
- DoD: each page shows a clear "no data yet" or "stale since <date>" message, with a screenshot or test per page.

## C. Pipeline quality

### C1. Run the database tests in CI
- Do: add a Postgres service to the `quality` job, run migrations and set `TEST_DATABASE_URL`. Today the retention and DB tests are skipped in CI, and a fixture bug (missing `sector`) sat unseen until a local run.
- DoD: CI log shows 0 skipped DB tests.

### C2. Postgres schema and role split
- Do: new migration with a `web_ro` role (`SELECT` on score, alert, instrument, idea, portfolio and bar tables) and a second writer connection (`INGEST_DATABASE_URL`) for the ingest routes. Collectors, prices and reconcile jobs keep a writer role. Add the sealed secrets through the approved flow. Raw `source_documents` stay unreadable by `web_ro`.
- DoD: the web runs with `web_ro` and all pages work; an `INSERT` as `web_ro` fails; a test shows it.
- Approval: new secrets and a live migration.

### C3. Daily job deadline and digest
- Do: the daily CronJob has a 3600 s deadline and can overlap digest (07:30) and judge (07:45). Lower the deadline or move the later jobs. Decide whether `digest` stays unsuspended: it needs `DIGEST_TO`.
- DoD: `cronjob-order.test.ts` covers daily with no exclusion; digest suspended or `DIGEST_TO` set.

### C4. Choose the scan and judge agent
- Do: the web-search scan stays suspended. Pick the extract and judge agent: the subscription Claude CLI (works) or Codex (adapter for the judge is not built, needs the account token).
- DoD: decision noted; if Codex, a judge adapter with tests and a CronJob arg.

### C5. Review the scoring rules
- Owner task. Check the point tables and band percentages in `SIGNAL_RULES` (`src/engine/signals.ts`) against `InvestingGuide.md`.
- DoD: owner signs off or lists changes; golden tests updated.

### C6. Cost and quota guard for extract
- Do: log tokens and cost per symbol in `extraction_runs`, add a daily token ceiling to the Job, and alert when the 5 h Claude limit passes a set share.
- DoD: one run shows per-symbol cost in the table; the ceiling stops the Job with a clear exit code.

### C7. Foreign issuers
- Do: ASML, SE, MELI and similar file 20-F and 6-K. Add collection for them or leave their SEC-based fields unknown with a stated reason.
- DoD: each foreign symbol has a documented behaviour and a test; no field is guessed.

### C8. Price freshness rule
- Do: `daily.ts` needs a bar dated exactly the scoring date, so Monday scores stay `stale_prices` (no Monday price run). Add the planned 3 calendar day rule. Check the `SQ` to `XYZ` mapping against the live Twelve Data API.
- DoD: Monday scores are not stale on a normal weekend; mapping confirmed with one live call.

## D. Data and accounts (owner)

### D1. Accounts and licences
- See `docs/tasks-accounts-needed.md`: Alpha Vantage key and display rights, FRED key, EIA key, Twelve Data plan, Google News and GDELT terms.
- DoD: each source is marked usable or dropped, with the terms link.

### D2. EPS consensus source
- Do: no free verified source exists, so `epsBeat` stays unknown. Find one or accept unknown.
- DoD: decision recorded; if a source is chosen, a collector and a test.

### D3. Portfolio baseline
- Do: enter the private baseline by hand through `POST /api/ingest/portfolio-baseline`, or try an interactive IBKR MCP session (read-only; headless use unverified).
- DoD: one baseline row for the latest date; the judge reads it and never reads `costEur`.

### D4. RSS and news display rights
- Do: rss documents are stored with `display_allowed: false`. Decide which feeds may be shown or quoted.
- DoD: per-feed decision in `docs/data.md`.

## E. Operations

### E1. Postgres backups
- Do: the `invest-buddy-backup` CronJob is suspended in infra ("enable after secrets / plan switch"). Postgres sits on a 5 Gi `local-path` volume on one node. Enable the backup and restore a dump into a scratch database.
- DoD: one dump stored off the node and one restore test written up.
- Approval: secrets and infra change.

### E2. Job monitoring
- Do: alert when a CronJob fails or does not run, and when `/api/health` dates go stale.
- DoD: a test alert fires and reaches you.

### E3. Egress and NetworkPolicy
- Do: test outbound HTTPS from a Job on `k8s-worker-01` to sec.gov, data.sec.gov and the cited public pages. The infra repo has no NetworkPolicy resources.
- DoD: results listed; a policy proposed only if you want one.

### E4. Tidy the infra repo copy
- Do: the proposal in `deploy/gitops/` lost two live edits (backup and scan suspends). Sync the proposal with infra, or delete the proposal and treat infra as the source.
- DoD: one source of truth, noted in `deploy/README.md`.

## Not planned

- Go or microservice rewrite. The workload is about 35 tickers a day and the jobs share types and logic with the web. Revisit only if one collector gets heavy or the pieces get different owners.
