# Open tasks

State on 2026-10-06. A1 to A4 are done (see the notes under each). Each task can be picked up alone or given to one agent. "Approval" means the owner must say yes before the step runs (cluster, push, secrets, money). Pick the lowest open task in a group whose dependencies are done. Tick the box and add one line on what changed.

Groups: A first live run, B web, C pipeline quality, D data and accounts, E operations, F cadence.

## A. First live run on khtz

### A1. Build the images (done 2026-10-06)
- Note: the build and the infra pin are automatic now (`INFRA_BUMP=true`, secret `INFRA_REPO_TOKEN`). Merge to `main` to a running pod takes about 2 minutes (Argo polls every 60 s).
- Depends on: PR #2 (`invest-buddy`) green. GitHub Actions had a major outage on 2026-10-05, so CI had no runner.
- Do: merge PR #2 to `main` once `quality` passes. The `image` job pushes `ghcr.io/filipcsupka/invest-buddy` and `invest-buddy-scanner` with tag `sha-<7 chars>`.
- Fallback if Actions stays down: build both images locally for the cluster architecture (check the node arch first, this Mac is arm64) and import them. Needs approval, because the `gh` token has no `write:packages`.
- DoD: both tags exist and pull on a khtz node. Tag written down in this file.
- Approval: merge, any import.

### A2. Merge infra and pin the tags (done 2026-10-06)
- Depends on: A1.
- Do: update `overlays/prod/kustomization.yaml` in infra PR #15 to the new tag for both images, check `kustomize build` and `kubeconform -strict`, merge. Argo auto-syncs (`selfHeal`); the repo sets `timeout.reconciliation: 300s`, so confirm the live value too.
- DoD: `kubectl -n invest get cronjob` shows collect, detect, extract, judge, reconcile and daily all suspended; the web pod runs the new tag and `/api/health` returns 200.
- Approval: infra merge.

### A3. Apply migrations 007 to 010 (done 2026-10-06)
- Note: the web init container applied 007 to 010 when the new web pod started.
- Depends on: A2.
- Do: run the migrate step from the new web image against the invest Postgres (a one-off Job or the existing migrate path). Take a `pg_dump` first. The data is test data, so a wipe and restart is acceptable.
- DoD: `\dt` lists `source_documents`, `collected_facts`, `collector_runs`, `cusip_map`, `extraction_runs`, `trade_ideas`, `judge_runs`, `portfolio_baseline`; `schema_migrations` shows 010.
- Approval: yes, it writes to the live database.

### A4. First manual collect Job (done 2026-10-06)
- Result: 35 of 35 tickers, 763 documents (735 Form 4, 18 8-K, 6 earnings exhibits, 2 10-Q, 1 10-K, 1 EX-99.2), 109 facts, all `display_allowed = true`. The GlobeNewswire feed times out from the cluster (15 s, repeated), so RSS collects nothing. The collector now treats that as its own failure and continues.
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

### B6. Idea summary on the company page
- Why: the old scan produced a short card per ticker, and that is what makes a WATCH or START useful: action and size band, what happened, why it matters, setup ratings (company, entry, catalyst), 3 to 5 numbers, the plan (when to start or add, when to stop adding, invalidation, opportunity cost) and evidence links. The judge output and `trade_ideas` already hold these fields.
- Do: show the latest idea card on `/company/[ticker]` when the action is WATCH, START_POSITION or ADD (and above), with the date, the evidence links and an "unconfirmed" or "carried from <date>" label when set. Keep the EUR band behind the private flag from B3, since ADR-001 forbids public sizing. Hide the card when the latest action is HOLD and nothing changed.
- DoD: the page renders the card from `trade_ideas` in `DATA_MODE=db`; a test covers WATCH, START and the hidden cases; no EUR amount shows when the flag is off.

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

### E5. Check every Job and CronJob, remove what is not needed
- Do: list every CronJob and Job in `invest` and in the manifests (`ib-*-manual-*` leftovers, `invest-buddy-scan-claude`, `invest-buddy-scan-codex`, `portfolio`, `digest`, `retention`, `backup`, `prices`, and the new collect, detect, extract, judge). For each: is it needed in its current form, who consumes its output, does it still match the script-first design. Remove what is dead (old manual Jobs, replaced scan jobs, unused PVC such as `invest-buddy-codex-home` if Codex stays unused).
- DoD: a table in `deploy/README.md` with job, purpose, schedule, state and owner; dead objects deleted from the manifests and from the cluster through infra; `kubectl -n invest get cronjob,job` matches the table.
- Approval: infra changes and cluster deletions.

### E6. Logging and visibility
- Do: the web logs almost nothing, so a failure is invisible. Add structured logs (JSON, one line per request on the ingest routes and the pages: route, status, duration, request id; errors with a stack) and a log line at the start and end of every job (counts, durations, failures). Log failed ingests with the reason, never tokens or request bodies. Decide where logs go: `kubectl logs` only, or a collector (Loki is in `monitoring/` of the infra repo if it runs).
- DoD: a failed ingest and a failed page render each leave a readable log line; one job run shows start, end and counts; a note says where to read logs and how long they are kept.
- Related: E2 (alerts) builds on this.

## F. Cadence: fewer, change-driven runs

Design and sources: `docs/cadence-design.md`. This group replaces the daily extract and judge schedule. Do F1 before unsuspending extract or judge (A8).

### F1. Watch step
- Do: a daily script (no AI) polls `data.sec.gov/submissions` for the 35 CIKs, stores new accession numbers per CIK (table or `collected_facts`), and keeps the 4 req/s limit. Second poll in earnings weeks.
- DoD: a run lists new filings per ticker since the last run; a rerun with no new filings reports none; a test covers the dedupe by accession number.

### F2. Gate step
- Do: mark a ticker "changed" only for a new 8-K with Item 2.02, 4.02 or 5.02, a 10-Q, a 10-K or an amendment. Add an insider cluster rule (3 or more opportunistic Form 4 buys in 30 days, excluding same-month-every-year traders) and price band rules (drawdown and valuation, thresholds in config). Output is the `--symbols-file` for extract. This replaces `detect`, or extends it.
- DoD: unit tests for each rule; the output for a day with no changes is an empty list and extract exits without a model call.

### F3. Gated extract and judge schedule
- Do: run extract on changed tickers only (haiku, escalate to sonnet when haiku flags a material change). Run judge when at least one ticker changed, and on the fixed schedule in F5. Change the CronJobs in infra (fewer runs, all weekdays stay for the watch step only).
- DoD: a quiet week costs 0 model calls; a run with 3 changed tickers calls the model 3 times; counts and cost are logged per run.

### F4. Token budget guard
- Do: a monthly token and dollar cap. Extract and judge stop with a clear exit code and a log line when the cap is reached. Log processed accession numbers and input hashes. Reprocessing is manual only (`--force`).
- DoD: a test with a tiny cap stops the run; the monthly total is readable from the database.

### F5. Fixed review calendar
- Do: weekly digest of events; a re-score and a "thesis intact, weakened or broken" note after each earnings filing; a full re-screen in May and November (only time new additions are ranked); an annual thesis rewrite. Store the thesis note and the thesis-break checklist per holding.
- DoD: each item has a trigger or schedule in code or a CronJob, and the web shows the last review date per holding.

### F6. Tune the placeholders
- Do: drawdown band, valuation band, turnover target (30% a year) and the insider cluster size are placeholders. Check them against `InvestingGuide.md` and your own rules.
- DoD: owner signs off the values; they live in one config file with a comment on where each came from.

### F7. Discovery of new names
- Why: the old scan found names outside the fixed universe (for example EFXT after a 450 MW data-center contract, PCVX after a Phase 3 result, WULF after a power-capacity amendment) by following beneficiary chains. The script-first pipeline only covers the 35 tickers, so it can never propose a new name.
- Do: a separate, low-frequency discovery step. Sources that cost no tokens first: EDGAR current-filings feed filtered to 8-K Items 1.01 and 2.02 (material agreements), big price and volume movers, 13F changes of a short list of managers, and a themes file (AI power, cooling, networking, biotech catalysts) with beneficiary chains. A cheap model ranks the shortlist; only the top few get a full bundle and a judge run. Run it weekly, plus the semi-annual re-screen from F5.
- DoD: a run produces at most N candidates per week (N in config) with source links; a candidate that passes goes into the same extract and judge path as holdings; a test shows a ticker outside the universe can be added without code changes (universe from a table or file).

### F8. Quality check against the old scans
- Do: take the three old scan cards (EFXT START, PCVX WATCH, WULF START, 2026-10-05 and 06) as test cases. For each, collect the same inputs through the scripts (the filings and facts the old card cited) and run extract and judge. Compare action, band, setup ratings and the plan triggers with the old card, and count tokens and cost.
- DoD: a table in `docs/` with old versus new per card (same action or not, which facts the scripts could not supply, tokens and dollars); gaps become tasks. The target is the same decisions at a fraction of the tokens.

## G. Signals from data only, sizing as a generic guide

Decision 2026-10-06: the product says BUY, ADD, WAIT or REDUCE from data alone. The portfolio does not decide the signal. Readers have different accounts, so size is a separate generic guide that each reader applies to their own account. The owner's own portfolio is a private example, not an input to the public signal. Research and sources: `docs/sizing-guide.md`.

Today `src/engine/signals.ts` ties the action to the portfolio: no baseline forces WATCH EUR 0 for everything, bands are shares of available cash, there is a deploy cap, and held names take a different path (REDUCE, THESIS_BROKEN).

### G1. Data-only action (done 2026-10-06)
- Note: rules `2026-10-06.1`. Buy actions and tiers come from data only; held only turns a no-money outcome into HOLD, REDUCE or THESIS_BROKEN; CSPX_ALLOCATION is dropped from the public path (owner view, G4); a missing baseline no longer stops the judge.
- Do: compute START_POSITION, ADD, HIGH_CONVICTION_ADD, WATCH, REDUCE and THESIS_BROKEN from scores, the three ratings (company, entry, catalyst) and the evidence only. Remove the "no baseline means WATCH" rule and the cash-based deploy cap from the action step. "Held" becomes optional context for the owner's private view (REDUCE and THESIS_BROKEN stay available as signals for any holder). Keep `SIGNAL_RULES` versioned, bump the version.
- DoD: the same inputs give the same action with or without a baseline; tests cover START, ADD, HIGH_CONVICTION_ADD, WATCH, REDUCE, THESIS_BROKEN with no portfolio; the judge still only explains and may only downgrade to WATCH.

### G2. Size tiers, not euro amounts (done 2026-10-06)
- Note: migration 011 adds `trade_ideas.size_tier`; the signature ends with the tier; the public card shows the tier in words and no EUR; owner EUR bands are filled only with a baseline, else 0.
- Do: replace `amountMinEur/amountMaxEur` in the public idea with a tier: STARTER (about 1/3 of a full position), STANDARD (2/3), FULL, and for adds a fraction of a full position. Euro bands stay only in the owner's private view, computed from the baseline.
- DoD: `trade_ideas` stores the tier; the public page and card show tier and wording, no euro amount; the private view still shows bands when the flag is on.

### G3. Generic sizing matrix on the web
- Do: a page or section "How to size this" with a matrix: signal tier by account size bucket (under 5k, 5 to 25k, 25 to 100k, over 100k EUR) and cash level (under 10%, 10 to 30%, over 30%). Percent of the reader's own portfolio per name, a hard cap per name, rules for adding (one add a month, never above the cap, no ADD above cap through drift), cash multiplier, and a line that the guide is illustrative and not advice. Starting numbers are in `docs/sizing-guide.md` and are placeholders.
- DoD: EN and SK text; a pure function from (signal tier, account bucket, cash bucket) to percent with tests; a worked example on the page; no input of real balances is stored on the server.

### G4. Owner view
- Do: the owner's baseline (EUR 200 a month, cash, positions) feeds a private view: the same matrix applied to the owner's account plus the monthly-contribution split (for example a starter as a share of the monthly contribution).
- DoD: private page or flag-gated view; the judge no longer reads the baseline for the action.

### G5. Wording and legal check
- Do: use "screening signal", "illustrative sizing guide", "you decide" and the owner's position disclosure. Before any paid launch ask a lawyer: whether BUY and ADD labels count as investment recommendations under MAR in the EU (SK, CZ), what disclosure is required, and the effect of any calculator that takes the reader's balance.
- DoD: written answer from a lawyer; wording on the site matches it.

## Not planned

- Go or microservice rewrite. The workload is about 35 tickers a day and the jobs share types and logic with the web. Revisit only if one collector gets heavy or the pieces get different owners.
