# Open tasks

State on 2026-10-09. Live state was read from khtz on 2026-10-09; see the open list in section H. A1 to A7 are done (see the notes under each). Each task can be picked up alone or given to one agent. "Approval" means the owner must say yes before the step runs (cluster, push, secrets, money). Pick the lowest open task in a group whose dependencies are done. Tick the box and add one line on what changed.

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

### A5. Live extraction check (done 2026-10-07)
- Note: first full extract ran on all tickers (72 `extraction_runs` rows with status ok across 36 tickers, about 2.9 USD on the CLI meter, per `docs/STATE-2026-10-07.md`).
- Depends on: A4.
- Do: re-run one live NVDA extraction with the keyword-window excerpts. The first live run left 7 of 8 fields null.
- DoD: at least 5 of 8 fields filled, every positive claim passes the quote check, the token use and cost are noted here.
- Approval: model usage on the subscription token.

### A6. Detect, extract and the web (done 2026-10-07)
- Note: manual chain ran (`ib-*-manual-10071013`, all Complete); scores for 2026-10-06 are stored and the web renders them.
- Depends on: A5.
- Do: run detect, then extract for all symbols, then reconcile and daily by hand. Unsuspend reconcile and daily last, as the deploy README says.
- DoD: `scan_findings`, `consensus_findings` and `score_results` hold rows from this run; `/api/health` shows today's scan, reconcile and score dates; `/en/dashboard` and `/en/company/NVDA` render those scores with no sample stamp.
- Approval: yes for each Job.

### A7. Judge run (done 2026-10-07)
- Note: `judge-manual-8` and `ib-judge-manual-10071013` Complete; ten ideas stored for 2026-10-06. Two earlier manual extract Jobs and one judge Job failed on 2026-10-07 and were re-run.
- Depends on: A6.
- Do: one manual judge Job. Check that edgar-backed evidence reaches the judge input (finding fixed on 2026-10-05).
- DoD: `judge_runs` has a row, `trade_ideas` has ideas that each have at least two evidence links, and the figure check passes. `/ideas` stays hidden until B3 is decided.
- Approval: yes.

### A8. Switch on the schedule (live; daily chain ran on schedule on 2026-10-08 and 2026-10-09)
- Note: all scheduled steps are unsuspended. The 2026-10-08 night (prices, collect, detect, extract, macro, reconcile, daily, judge, digest, portfolio) finished with no failed Job. Collect ended `partial` because the RSS source failed with no reason in the log; the log line now prints the reason. Status 2026-10-09: collect, detect, extract, macro, reconcile and daily completed on schedule overnight (extract: 35 Haiku calls, 34 tickers ok, 0 failed, $0.31). The scheduled judge run at 05:30 failed its figure check (see H1) and was fixed by PR #57; no scheduled judge run on the fixed image has been seen yet. Close A8 after one clean scheduled judge run.
- Depends on: A6 and A7 each ran cleanly once.
- Do: unsuspend collect, detect, extract, reconcile, daily and judge in infra one at a time, in schedule order, over several days.
- DoD: three consecutive weekdays with no failed Job and a fresh `/api/health`.
- Approval: each infra change.

## B. Web

### B1. Real benchmark for `/track-record` (done 2026-10-09)
- DB mode charts SPY `daily_bars` from the first through the last stored record date, indexed to 100 at the first available SPY bar. It shows the no-data state if fewer than two bars are available. The synthetic chart stays in fixture mode. Tests cover the series and DB rendering.

### B2. Portfolio page benchmark and sample check (done 2026-10-06)
- Status 2026-10-08: confirmed; db mode builds the chart from `portfolio_nav_history` and SPY bars.
- Do: trace what `benchmarkSample` does in `src/db/portfolio.ts` and `/portfolio`. Make live mode use real data or hide the block.
- DoD: no fixture figure is reachable in `DATA_MODE=db`; test added.
- Note (2026-10-06): done on branch `portfolio-history`. `benchmarkSample` is removed; db mode builds the chart from `portfolio_nav_history` (migration 015) and real SPY bars from `daily_bars`, and the SAMPLE badge shows only in fixture mode. The page still needs a deploy plus a migrate run.

### B2a. Daily NAV in the Flex query (done)
- Status 2026-10-08: `portfolio_nav_history` holds 233 `flex-daily` rows from 2025-11-17 to 2026-10-07. Owner enabled Breakout by Day.
- Do: in Flex Web Service query settings (General Configuration), set 'Breakout by Day' to Yes and the period to 365 days (or the longest the account allows), so the next portfolio run backfills `portfolio_nav_history`. Until then the page shows 'History builds from ...' and only gains two points per run.
- DoD: `portfolio_nav_history` holds one `flex-daily` row per statement day since inception; `/portfolio` draws the line. Check that the report returns EUR base values (non-EUR rows are skipped).

### B3. Mark possible paywall segments (decided 2026-10-08)
- Owner decision: do not gate content now. Mark detailed page sections that may become subscriber content when marketing starts; keep the basic screen and public methodology free.
- The current markers render all content. See `docs/paywall-segments.md` for the segment list, company page recommendations, and the later gate design. ADR-001 still limits public output to informational screening and keeps owner EUR amounts private.

### B4. Sample stamp test (done 2026-10-08)
- Do: add a test that the sample stamp and fixture labels never render with `DATA_MODE=db`.
- DoD: test in `src/`, runs in CI.

### B5. Empty and stale states (done 2026-10-08)
- Do: check each page when `score_results` is empty or older than 3 days. `/api/health` already returns null dates for an empty database.
- DoD: each page shows a clear "no data yet" or "stale since <date>" message, with a screenshot or test per page.

### B6. Idea summary on the company page (done; card now follows the page language, 2026-10-08)
- Status: the card was already built. The judge now writes English and Slovak, stored in `trade_ideas.translations` (migration 021). `npm run backfill:idea-translations` fills the ideas stored before this change (dry run by default).
- Why: the old scan produced a short card per ticker, and that is what makes a WATCH or START useful: action and size band, what happened, why it matters, setup ratings (company, entry, catalyst), 3 to 5 numbers, the plan (when to start or add, when to stop adding, invalidation, opportunity cost) and evidence links. The judge output and `trade_ideas` already hold these fields.
- Do: show the latest idea card on `/company/[ticker]` when the action is WATCH, START_POSITION or ADD (and above), with the date, the evidence links and an "unconfirmed" or "carried from <date>" label when set. Keep the EUR band behind the private flag from B3, since ADR-001 forbids public sizing. Hide the card when the latest action is HOLD and nothing changed.
- DoD: the page renders the card from `trade_ideas` in `DATA_MODE=db`; a test covers WATCH, START and the hidden cases; no EUR amount shows when the flag is off.

## C. Pipeline quality

### C1. Run the database tests in CI (done, Postgres service and migrate step in `quality`)
- Do: add a Postgres service to the `quality` job, run migrations and set `TEST_DATABASE_URL`. Today the retention and DB tests are skipped in CI, and a fixture bug (missing `sector`) sat unseen until a local run.
- DoD: CI log shows 0 skipped DB tests.

### C2. Postgres schema and role split (open)
- Status 2026-10-08: not started. The only database role is the superuser `invest`, and the web uses it.
- Do: new migration with a `web_ro` role (`SELECT` on score, alert, instrument, idea, portfolio and bar tables) and a second writer connection (`INGEST_DATABASE_URL`) for the ingest routes. Collectors, prices and reconcile jobs keep a writer role. Add the sealed secrets through the approved flow. Raw `source_documents` stay unreadable by `web_ro`.
- DoD: the web runs with `web_ro` and all pages work; an `INSERT` as `web_ro` fails; a test shows it.
- Approval: new secrets and a live migration.

### C3. Daily job deadline and digest
- Done in the app manifest: daily starts at 04:25, has a five-minute start window and a 60-minute deadline, so its latest end is 05:30 when judge starts. `cronjob-order.test.ts` checks this. Digest is suspended because `ConsoleMailer` only writes to the log; delivery and `DIGEST_TO` remain unset.

### C4. Choose the scan and judge agent (decided in practice: Claude subscription)
- Status 2026-10-08: extract runs `--agent claude --model haiku` and judge `--model sonnet`, both on the subscription token. No Codex judge adapter exists. The unused `invest-buddy-codex-home` PVC is Pending and never bound.
- Do: the web-search scan stays suspended. Pick the extract and judge agent: the subscription Claude CLI (works) or Codex (adapter for the judge is not built, needs the account token).
- DoD: decision noted; if Codex, a judge adapter with tests and a CronJob arg.

### C5. Review the scoring rules
- Owner task. Check the point tables and band percentages in `SIGNAL_RULES` (`src/engine/signals.ts`) against `InvestingGuide.md`.
- Also review the single-extractor policy (2026-10-06, `docs/data.md`): one extractor's true/false claim counts as `verified_single` when a cited quote is found in a stored, display-allowed document. Decide whether that is enough, and whether `signals.ts` should count `verified_single` and `data_rule` (it counts only `agree` and `xbrl_override` today). Also check the `EPS_BEAT_MIN_SURPRISE_PCT` placeholder (0).
- DoD: owner signs off or lists changes; golden tests updated.

### C6. Cost and quota guard for extract
- App change: per-symbol token and cost columns already exist in `extraction_runs` (migration 016), and Claude usage already logs the five-hour and seven-day percentages. The report now lists recent extraction rows. `AI_DAILY_TOKEN_CEILING` defaults to 0 (off); when set, extract checks completed subscription tokens for the UTC day before each model call and exits 5 at the ceiling, leaving the gate pending. Live proof 2026-10-09: a one-off Job with `AI_DAILY_TOKEN_CEILING=1` (`--only NVDA --force --concurrency 1`) read 806,713 tokens used that day, logged `DAILY TOKEN CEILING: 806713/1 tokens after 0 tickers; remaining work pending`, made no model call and exited 5. Done.

### C7. Foreign issuers (done 2026-10-09)
- Do: ASML, SE, MELI and similar file 20-F and 6-K. Add collection for them or leave their SEC-based fields unknown with a stated reason.
- DoD: each foreign symbol has a documented behaviour and a test; no field is guessed.
- Done: live SEC check shows ASML and SE file 20-F and 6-K; MELI files 10-K, 10-Q and 8-K, so it is not foreign. Collection already stored 20-F and 6-K. New fact `sec_filer_status` lists the unknown SEC fields with reasons and reaches the bundle. See `docs/data.md`.

### C8. Price freshness rule (done 2026-10-09)
- Done: `daily.ts` accepts a latest bar up to 3 calendar days older than the scoring date, so Monday scores after a normal weekend are not `stale_prices`; older bars stay stale. Tests in `src/jobs/daily.test.ts` cover Friday to Monday and the day 3 / day 4 boundary.
- Mapping in code: `DEFAULT_SYMBOL_MAP = { SQ: "XYZ" }` in `src/data/twelvedata.ts`; `marketTicker` in `src/collectors/sources/common.ts` and `collect.ts` reuse it for SEC and OpenFIGI.
- Live check 2026-10-09: the nightly prices job stored 264 `daily_bars` for `SQ`, latest 2026-10-08, so the `SQ` to `XYZ` mapping works against Twelve Data.
- DoD: Monday scores are not stale on a normal weekend; mapping confirmed live. Both done.

## D. Data and accounts (owner)

### D1. Accounts and licences
- See `docs/tasks-accounts-needed.md`: Alpha Vantage key and display rights, FRED key, EIA key, Twelve Data plan, Google News and GDELT terms.
- DoD: each source is marked usable or dropped, with the terms link.

### D1b. Macro rule thresholds
- Status 2026-10-09: `invest-buddy-macro` is unsuspended and runs daily. All 36 tickers score 2 of 5: the market-wide `sectorRotationIntoGrowth=true` adds 2 points, while `dataTailwind=false` adds none. The 10-year yield rule is the binding condition.
- Do: review the placeholder rules in `docs/data.md` (Macro rules): 10-year yield 20-observation change at or below 0 pp, VIX below 25, universe minus SPY 20-session return above 2 pp, 5 day staleness. Decide the thresholds, whether one missing input should leave the flag unknown, and the FRED and Cboe display terms.
- DoD: thresholds confirmed or changed through `MACRO_*` variables; the market-wide 2 of 5 result is understood and accepted or corrected.

### D2. EPS consensus source
- Do: no free verified source exists, so `epsBeat` stays unknown. Find one or accept unknown.
- Note (2026-10-06): the `alphavantage` source and the `data_rule` for `epsBeat` are in place (`docs/data.md`). Open: put `ALPHA_VANTAGE_API_KEY` into secret `invest-buddy-source-keys`, unsuspend `invest-buddy-collect-alphavantage`, and get the display terms in writing (D1). Until then the page shows only the derived yes/no with the source name.
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

### E3. Egress and NetworkPolicy (tested 2026-10-09, no policy proposed)
- Status 2026-10-08: no NetworkPolicy exists in `invest`. Outbound HTTPS to SEC, FRED and Twelve Data works, as shown by the successful nightly collect, prices and macro Jobs. A deliberate test of a policy is still open.
- Do: test outbound HTTPS from a Job on `k8s-worker-01` to sec.gov, data.sec.gov and the cited public pages. The infra repo has no NetworkPolicy resources.
- Result 2026-10-09 (one-off Job `egress-test-1009` on `k8s-worker-01`, removed afterwards): HTTPS reached www.sec.gov (200), data.sec.gov (200), api.stlouisfed.org (200), api.twelvedata.com, api.openfigi.com and api.fda.gov (404 on the root path, host reached), clinicaltrials.gov, api.usaspending.gov, news.google.com and www.treasury.gov (200). A made-up host failed with ENOTFOUND. No NetworkPolicy exists; one is proposed only if you want it.
- DoD: results listed; a policy proposed only if you want one. Done.

### E4. Tidy the infra repo copy (done 2026-10-08, infra branch pending merge)
- Note: infra `main` is the source of truth; `deploy/gitops/` is a mirror, synced and documented in `deploy/README.md`.
- Do: the proposal in `deploy/gitops/` lost two live edits (backup and scan suspends). Sync the proposal with infra, or delete the proposal and treat infra as the source.
- DoD: one source of truth, noted in `deploy/README.md`.

### E5. Check every Job and CronJob, remove what is not needed (manifests done 2026-10-08; live deletes need approval)
- Note: table updated in `deploy/README.md`. Infra branch `invest-buddy-cleanup-0810` removes `scan-claude`, `scan-codex` and the dead `AI_MONTHLY_*` env (Argo `prune: true`, so merge deletes the live objects). `invest-buddy-codex-home` PVC and the codex seed secret are kept until C4 is decided. Old `ib-*-manual-*` and `av-manual-1`, `judge-manual-8`, `ib-portfolio-manual-*` Jobs are still in the cluster.
- Do: list every CronJob and Job in `invest` and in the manifests (`ib-*-manual-*` leftovers, `invest-buddy-scan-claude`, `invest-buddy-scan-codex`, `portfolio`, `digest`, `retention`, `backup`, `prices`, and the new collect, detect, extract, judge). For each: is it needed in its current form, who consumes its output, does it still match the script-first design. Remove what is dead (old manual Jobs, replaced scan jobs, unused PVC such as `invest-buddy-codex-home` if Codex stays unused).
- DoD: a table in `deploy/README.md` with job, purpose, schedule, state and owner; dead objects deleted from the manifests and from the cluster through infra; `kubectl -n invest get cronjob,job` matches the table.
- Approval: infra changes and cluster deletions.

### E6. Logging and visibility (done 2026-10-08, page render and ingest JSON logs; alerts remain E2)
- Note: see `docs/logging.md` for where logs are read and kept. Collect now prints the failure reason per source.
- Do: the web logs almost nothing, so a failure is invisible. Add structured logs (JSON, one line per request on the ingest routes and the pages: route, status, duration, request id; errors with a stack) and a log line at the start and end of every job (counts, durations, failures). Log failed ingests with the reason, never tokens or request bodies. Decide where logs go: `kubectl logs` only, or a collector (Loki is in `monitoring/` of the infra repo if it runs).
- DoD: a failed ingest and a failed page render each leave a readable log line; one job run shows start, end and counts; a note says where to read logs and how long they are kept.
- Related: E2 (alerts) builds on this.

## F. Cadence: fewer, change-driven runs

Design and sources: `docs/cadence-design.md`. This group replaces the daily extract and judge schedule. Do F1 before unsuspending extract or judge (A8).

### F1. Watch step (done 2026-10-08)
- Status: the job existed (`src/jobs/watch.ts`) but no CronJob ran it, so `filing_watch` stayed empty and new 10-Q and 8-K filings could not trigger the gate. `invest-buddy-watch` now runs Tue to Sat at 00:45 (no AI, ends before collect). Infra copy needed.
- Do: a daily script (no AI) polls `data.sec.gov/submissions` for the 35 CIKs, stores new accession numbers per CIK (table or `collected_facts`), and keeps the 4 req/s limit. Second poll in earnings weeks.
- DoD: a run lists new filings per ticker since the last run; a rerun with no new filings reports none; a test covers the dedupe by accession number.

### F2. Gate step (done)
- Status 2026-10-08: `detect` runs nightly and stores `scheduled_gates` (revision 1 for 2026-10-07, empty list, extract made 0 model calls). It depends on F1 for the filing rule.
- Do: mark a ticker "changed" only for a new 8-K with Item 2.02, 4.02 or 5.02, a 10-Q, a 10-K or an amendment. Add an insider cluster rule (3 or more opportunistic Form 4 buys in 30 days, excluding same-month-every-year traders) and price band rules (drawdown and valuation, thresholds in config). Output is the `--symbols-file` for extract. This replaces `detect`, or extends it.
- DoD: unit tests for each rule; the output for a day with no changes is an empty list and extract exits without a model call.

### F3. Gated extract and judge schedule (done)
- Status 2026-10-08: live. Extract and judge both logged `nothing changed; 0 model calls` on the quiet night.
- Do: run extract on changed tickers only (haiku, escalate to sonnet when haiku flags a material change). Run judge when at least one ticker changed, and on the fixed schedule in F5. Change the CronJobs in infra (fewer runs, all weekdays stay for the watch step only).
- DoD: a quiet week costs 0 model calls; a run with 3 changed tickers calls the model 3 times; counts and cost are logged per run.
- Status: app repo gate persistence, scanner `--gate-from-db`, and suspended CronJob args are implemented. The infra owner still needs to copy and enable the manifests; F5 owns the separate fixed review schedule.

### F4. Token budget guard (done, guard dropped on purpose)
- Decision: the monthly token and dollar guard was dropped because the Claude subscription is limited by rolling five-hour and weekly usage windows. Extract and judge record per-call tokens and live window samples. Real cutoffs leave unfinished gate work for the next run; optional soft stops preserve daytime capacity.
- DoD: cutoff and usage samples are readable through the owner ingest endpoint, and a stopped run retries unapplied work.

### F5. Fixed review calendar
- App change: a Saturday 11:00 review selects at most six symbols whose applied extraction or stored idea is older than 30 days, then runs extract, reconcile, daily scoring, and a forced judge in order. It runs after discovery and outside the weekday chain. The per-earnings thesis note, semi-annual re-screen, annual rewrite, and stored checklist remain open. The company page shows the last review date (the older of the applied extraction and the stored idea) and the next fixed review, 30 days later.

### F6. Tune the placeholders
- Do: drawdown band, valuation band, turnover target (30% a year) and the insider cluster size are placeholders. Check them against `InvestingGuide.md` and your own rules.
- DoD: owner signs off the values; they live in one config file with a comment on where each came from.

### F7. Discovery of new names (built; first scheduled run done Saturday 2026-10-10)
- Status 2026-10-09: a one-off Job ran 2.5 minutes and returned no candidates, because the SEC frames source threw on a 404 for the retired `SalesRevenueNet` concept. Fixed in PR #59 (a 404 for one concept and quarter is now an empty frame). The fix is not yet built into a live image. Twelve Data also rejected two preferred-share symbols (BHR-PD, STWI). Check `discovery_candidates` after the Saturday run.
- Update 2026-10-09: PR #62 skips warrant, unit and preferred symbols, and PR #64 filters them before the shortlist is cut so it fills from lower-ranked names; a Twelve Data "symbol not accepted" answer is now a skip with a reason, not a failure. Both are merged, not yet seen on a scheduled run.
- Manual run 2026-10-09 on image `sha-6121f94` (Job `prove-discovery-sat`, after #64): 0 failures, 0 candidates, 32 skipped (13 warrant, 7 unit, 6 rights, 5 preferred, 1 rejected by Twelve Data: STWI). The filter works, but after it only one real symbol reached screening, so the source pool is the open problem. The run log now prints rows per source (`sourceRows`, `uniqueSymbols`, `shortlisted`) so the next empty week shows which source returned nothing. Next: read those counts, then decide whether to widen the sources or lower the thresholds in `discovery-config.ts`; check what STWI is.
- Update 2026-10-09 evening, on `sha-fe80043` (Job `prove-discovery-sat2`): 366 unique symbols came in (themes 6, growth-frames 24, edgar-8k 104, ownership 258, 13f 0, biotech 11, movers 2), 12 were shortlisted, 11 were screened without error and none passed the rule gate (score at least 12, no rejection, fresh signal, SPY close). So the pool is not the problem; the gate drops names silently. A follow-up PR adds `notPassed` (symbol and reason) to the run log. 13f returning 0 rows is expected in October (the Q3 13F deadline is mid-November). STWI is StageWise Strategies Corp. in the SEC ticker list; Twelve Data does not accept it, so the skip stands.
- Run 2026-10-09 on `sha-e550a4d` (Job `prove-discovery-sat3`) with `notPassed` in the log: of 12 shortlisted, 11 were screened and none passed, and the reasons are legitimate. Six were rejected for a long-term downtrend (ANGO, HESM, LRN, XFOR, ACTG, ARVN, close below MA200), and five scored 2 to 8 against the minimum of 12 (LLY 2, ODC 2, CRGY 2, SWKS 8, AGIO 4). The gate works as designed. Open question: the shortlist is ranked by source score only and cut to `maxScreenedPerWeek` = 12 out of about 367 symbols, so most names are never screened. Change 2026-10-09 (PR for growth-first ranking): names with measured SEC revenue growth (growth-frames, at least 15% and accelerating) now rank before filings-only names (13D/G, movers), and `maxScreenedPerWeek` is 24, so every growth-frames name (24 rows this week) is screened first. Expect about 5 minutes of Twelve Data calls against the 30-minute Job deadline. Still open: a cheap pre-screen on price above MA200 before the cut (needs bars, so one call per name), and fundamentals beyond revenue growth (EPS beat, guidance) as ranking input; both need time and a look at the Twelve Data quota, so they stay tasks. Check the Saturday log for how many growth-frames names reached the scoring gate and how many passed. Result of the manual run on `sha-424fe1f` (Job `prove-discovery-sat4`): 373 symbols in, 24 screened, 5 candidates stored for week 2026-10-05: MU 16 (Watch), TXO 14, BDCO 12, PGEN 12, SDSYA 12 (Wait); 15 rejected for a long-term downtrend, 3 under the score minimum, 0 failures. Side effect: `saveCandidates` caps a week at 5 rows and Saturday 2026-10-10 falls in the same week (starts Monday 2026-10-05), so the scheduled run will find no free slots and store nothing new. The table is not empty, which is what H2 asked for, but the scheduled run proves only that the Job completes. The owner decides whether to clear the five rows before Saturday (a database write, not done) to get a clean scheduled result.
- Scheduled run 2026-10-10 09:30 on `sha-ed2991b` (Job `invest-buddy-discovery-29860290`, 4 min 33 s): 0 failures, 275 unique symbols, 48 ranked, the MA200 pre-screen dropped 34 before screening (23 Twelve Data requests), 12 fully screened, 10 listed with reasons in `notPassed`. It stored no new candidate because the manual run on 2026-10-09 had already filled the five slots of week 2026-10-05 (BDCO, MU, PGEN, SDSYA, TXO, all pending). So the scheduled path is proven to run; a scheduled run that adds candidates is proven next week.
- Why: the old scan found names outside the fixed universe (for example EFXT after a 450 MW data-center contract, PCVX after a Phase 3 result, WULF after a power-capacity amendment) by following beneficiary chains. The script-first pipeline only covers the 35 tickers, so it can never propose a new name.
- Do: a separate, low-frequency discovery step. Sources that cost no tokens first: EDGAR current-filings feed filtered to 8-K Items 1.01 and 2.02 (material agreements), big price and volume movers, 13F changes of a short list of managers, and a themes file (AI power, cooling, networking, biotech catalysts) with beneficiary chains. A cheap model ranks the shortlist; only the top few get a full bundle and a judge run. Run it weekly, plus the semi-annual re-screen from F5.
- DoD: a run produces at most N candidates per week (N in config) with source links; a candidate that passes goes into the same extract and judge path as holdings; a test shows a ticker outside the universe can be added without code changes (universe from a table or file).

### F8. Quality check against the old scans
- Status 2026-10-09: offline part done in `docs/f8-old-vs-new-scans.md`. Only PCVX has old card data and its new output is Ignore, no idea. EFXT and WULF are not in `instruments`, so nothing exists to compare. The extract and judge re-run is still open.
- Do: take the three old scan cards (EFXT START, PCVX WATCH, WULF START, 2026-10-05 and 06) as test cases. For each, collect the same inputs through the scripts (the filings and facts the old card cited) and run extract and judge. Compare action, band, setup ratings and the plan triggers with the old card, and count tokens and cost.
- DoD: a table in `docs/` with old versus new per card (same action or not, which facts the scripts could not supply, tokens and dollars); gaps become tasks. The target is the same decisions at a fraction of the tokens.

### F9. Old card data for EFXT and WULF
- Do: the owner supplies the 2026-10-05 and 06 scan cards (action, band, ratings, triggers, filings cited), and for PCVX says whether the old action was START or WATCH. Store them in `docs/comparison-log.md`.
- DoD: all three old cards are written down with their sources.

### F10. Run EFXT and WULF through the pipeline
- Do: add both to `instruments` (as discovery names), collect, extract and judge, then fill the old-versus-new table with action, band, ratings, plan triggers, tokens and cost. Needs model calls and a cluster write, so it needs approval.
- DoD: rows for EFXT and WULF in `docs/f8-old-vs-new-scans.md` with real numbers.

### F11. Clinical readouts and 424B5 for PCVX
- Do: the catalyst rule misses clinical readouts, and the 424B5 financing is seen by the watch step but not stored as a document. This is already in the open list of `docs/comparison-log.md`; make it a task once the owner decides on a pre-revenue profile.
- DoD: PCVX 2026-10-05 card inputs reach the extractor with the readout and the financing.

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

### G3. Generic sizing matrix on the web (done)
- Status 2026-10-08: `/sizing` page exists, EN and SK.
- Do: a page or section "How to size this" with a matrix: signal tier by account size bucket (under 5k, 5 to 25k, 25 to 100k, over 100k EUR) and cash level (under 10%, 10 to 30%, over 30%). Percent of the reader's own portfolio per name, a hard cap per name, rules for adding (one add a month, never above the cap, no ADD above cap through drift), cash multiplier, and a line that the guide is illustrative and not advice. Starting numbers are in `docs/sizing-guide.md` and are placeholders.
- DoD: EN and SK text; a pure function from (signal tier, account bucket, cash bucket) to percent with tests; a worked example on the page; no input of real balances is stored on the server.

### G4. Owner view (built, flag off in production)
- Status 2026-10-08: `/owner-allocation` is behind `OWNER_VIEW`, which is unset in production.
- Do: the owner's baseline (EUR 200 a month, cash, positions) feeds a private view: the same matrix applied to the owner's account plus the monthly-contribution split (for example a starter as a share of the monthly contribution).
- DoD: private page or flag-gated view; the judge no longer reads the baseline for the action.

### G5. Wording and legal check
- Do: use "screening signal", "illustrative sizing guide", "you decide" and the owner's position disclosure. Before any paid launch ask a lawyer: whether BUY and ADD labels count as investment recommendations under MAR in the EU (SK, CZ), what disclosure is required, and the effect of any calculator that takes the reader's balance.
- DoD: written answer from a lawyer; wording on the site matches it.

### G6. Owner monthly allocation (implemented locally; owner values open)
- Do: calculate each proposed order from the current free broker cash, including cash carried from earlier months. Use a tier share with an order floor and ceiling, keep a reserve for adds, rank competing signals by score, and enforce the existing per-name portfolio cap. Show the amount and its reason only in the flag-gated owner view. Carry unused cash forward; show a cash-drag note above the configured month threshold without forcing a trade. An add needs confirmed execution history so the one-add-per-ticker-per-month rule can be checked. Keep stop-loss sizing out of this long-term thesis process.
- DoD: one documented placeholder config holds the owner and broker choices; the pure allocation function covers no signals, zero cash, cap and minimum limits, add history, and competing signals in tests. The private EN/SK view reads the Flex baseline and stored signals, while public pages expose no owner amounts. The owner confirms the tier shares, reserve, cap treatment, IBKR fee and minimum, and how executed adds will be recorded before using the suggestions.

## H. Found on 2026-10-09 (not written down before)

Evidence: `kubectl -n invest get cronjob,jobs`, `judge_runs`, `scheduled_gates` and the one-off Jobs run on 2026-10-09.

### H1. Scheduled judge failed its figure check (fixed; scheduled judge stored ideas 2026-10-10)
- The 05:30 judge on 2026-10-09 stored nothing: "Slovak prose figures differ from English" and "figures not in the input" (cost $0.20). PR #57 relaxed the check; a manual run on the fixed image stored 4 ideas ($0.12).
- Update 2026-10-09: Job `prove-review-sat` on `sha-6121f94` ran the judge forced for 6 tickers and stored 6 ideas ($0.16), all WATCH. The scheduled run is still the proof.
- Result 2026-10-10: the 05:30 judge made no model call (no signal had changed). The judge in the 11:00 review calendar (scheduled) stored 6 ideas; one failed the figure check on attempt 1 ("figures not in the input: 60") and passed on the retry. DoD met by the 11:00 run; the weekday 05:30 path with a model call is proven the next day a signal changes. Nothing alerts on a failed judge Job today, which is E2.

### H2. Discovery returns no candidates (fixed in PRs #59, #62, #64, #77 and #86; ran on the schedule 2026-10-10)
- See F7. Manual runs 2026-10-09: the first three returned no candidates; after PR #77 (growth-evidence names first, 24 screened) the run stored 5 candidates (MU, TXO, BDCO, PGEN, SDSYA). DoD: after the Saturday run, `discovery_candidates` has rows or a logged reason for none.

### H3. Weekly jobs have only run as one-off Jobs (done: both ran on the schedule 2026-10-10)
- Discovery and the review calendar ran as one-off Jobs on 2026-10-09 (review calendar: 6 tickers ok, 0 failed, $0.035). The scheduled runs are Saturday 09:30 and 11:00.
- Manual run 2026-10-09 on `sha-6121f94`: both Jobs (`prove-discovery-sat`, `prove-review-sat`) completed; the review chain (extract 6 ok, reconcile, daily, judge) ran without errors.
- Result 2026-10-10: discovery (09:30, 4 min 33 s) and the review calendar (11:00, 3 min 55 s) both completed on the schedule. Review calendar: extract 6 of 6 ok ($0.036), reconcile 48 fields, daily 36 instruments, judge stored 6 ideas ($0.2152, one idea passed on the retry after a figure check failure on attempt 1).
- DoD: both Jobs complete on the schedule. Met.

### H8. Saturday 2026-10-10 readiness (live on `sha-424fe1f`, infra pin commit `b12c9d7`, 2026-10-09 evening)
- State: PRs #74, #75 and #77 merged; the infra overlay pins `sha-424fe1f` for both images; Argo is on the matching revision; all 16 CronJobs and the web pod run the new tag; `/api/health` returns 200. Discovery ran by hand on the new tag; the review chain passed by hand on `sha-6121f94`. Any later docs-only merge re-pins the tag, which is harmless.
- Saturday timeline (Europe/Bratislava): 08:00 collect-alphavantage, 09:30 discovery, 11:00 review calendar (extract, reconcile, daily, forced judge).
- Check after the runs: `kubectl -n invest get jobs` for the three Jobs; `kubectl -n invest logs job/<discovery job>` for `sourceRows`, `shortlisted`, `notPassed`; `SELECT * FROM discovery_candidates WHERE week_start='2026-10-05'`; no "could not record extraction run" in the extract logs; `judge_runs` for the 11:00 run. Then update H1, H2, H3, H7 and F7 with the result.
- The Tue to Sat weekday chain also runs on Saturday (cron days 2-6): collect 01:00, extract 01:50, reconcile 04:10, daily 04:25, judge 05:30, all on the new tag. The Saturday 05:30 judge is the scheduled proof for H1.

### H7. Extraction usage was never stored (fixed in PR #65, proven on the schedule 2026-10-10)
- Every extract run logged `could not record extraction run: extraction-runs HTTP 400`. Many tickers carry more than 100 accessions (AMD 137, MELI 198 in the 2026-10-09 run) and the route accepted at most 100. PR #65 raises the limit to 500. Manual review run 2026-10-09 on `sha-6121f94`: 0 "could not record extraction run" lines across 6 extracted tickers.
- Result 2026-10-10: the weekday extract (01:50) and the review calendar extract (11:00) logged no `could not record` line, and the review calendar extract posted 6 of 6 runs with HTTP 200.
- DoD: after the next scheduled extract, `extraction_runs` has rows for the day and the job log has no `could not record` line. Met.

### H4. Digest is suspended
- `invest-buddy-digest` is suspended in infra and `ConsoleMailer` only logs (C3). DoD: owner picks a real mailer or leaves it off.

### H5. Dependabot opens many major bumps (done 2026-10-09, majors are ignored since #63)
- `.github/dependabot.yml` groups only minor and patch updates, so each major bump is its own PR (11 opened at once on 2026-10-08). Five CI-action bumps were merged on 2026-10-09; the Node, TypeScript, ESLint, vitest and `@types/node` majors were closed.
- DoD: config limited to minor and patch, or a monthly grouped run.

### H6. Judge one-off Jobs need a gate
- The judge reads `scheduled_gates` and returns 404 "No detect gate" when the day's gate does not exist or was already judged. A manual judge Job outside that window fails by design; use `--symbols-file` or wait for the gate.

## I. Web

### I1. Web presentable
- Done in the `web-presentable` PR: empty operator disclosure no longer renders; live home and dashboard drop fixture labels; `/robots.txt` points to the sitemap; unavailable pages and unknown tickers return HTTP 404; stored signal and action codes have EN/SK labels.
- Remains: publish real operator disclosure text when ready. Judge-written verdicts, event and rationale bullets, number labels, plan text, evidence labels, and conflict or downgrade explanations can still appear in English on SK pages when a Slovak translation is absent. The card marks that fallback; it does not invent a translation.

## J. Q4 roadmap

Owner decision 2026-10-09: the weeks to 2026-12-31 go to collecting data so history accumulates, owner portfolio features, a finished web with free and paid tiers built and tested (payment off), and a marketing and waitlist launch at the end of the year. This replaces the earlier plan to open a waitlist first (PR #83, closed). The plan, owner decisions, schedule and gates are in `docs/roadmap/README.md`; the tasks (D, W, EN, PL) are in the lane files next to it. After each merged roadmap task, add one status line here with the task ID, the PR and the live proof.

### Progress log
- W34 scanner filters: the flagged route filters stored scores by score, sector, F/T/M, state, held status and source; the free row limit awaits W30 and the owner's plan decision.
2026-10-09 and 2026-10-10 (all merged and live on the cluster, checked on the site and in the database):
- Presentable web: #81 and #82. Banner hidden while the disclosure text is empty (`OPERATOR_DISCLOSURE_EN` and `_SK` set the text), no sample labels, `robots.txt`, real 404 for unknown tickers and disabled pages, Slovak labels instead of raw codes, a Slovak fallback label when a translation is missing, no more "AMD, AMD" title, og:image and favicon.
- Engine: #80 buy threshold. START_POSITION needs score 18, ADD stays at 15 (Guide sections 6 and 8), rules version 2026-10-09.1. EN1 (#90) golden fixtures pin the behaviour. C5 review result: score.ts matches the Guide; the parallel point tables, deep add, breakout retest and EUR bands in signals.ts are still open (EN lane).
- Discovery: #77 growth-evidence names first and 24 screened, #79 extraction-runs route reads the instruments table (approved names like MU no longer get HTTP 400), EN36 (#86) MA200 pre-screen before the cut. A manual run stored 5 candidates for week 2026-10-05.
- Data foundation, migrations 022 to 041 applied: D1 inventory script (#93), D2 source registry with licence classes (#91), D3 row provenance on bars, facts and documents (#97), D5 retention archives public SEC rows instead of deleting (#100; the retention CronJob stays suspended), D6 point-in-time design note (#87), D7 NYSE trading calendar (#94), D8 API usage ledger and cost caps (#95), D10 security master (#96), D12 daily bar revision log (#102), D14 score input snapshots (#104), D15 consensus history (#92), D16 data quality checks (#103), D17 raw snapshot store (#99), D34 resumable backfill runner (#101), D42 terms-check pack for the owner (#98).
- Platform: PL1 CI uses the runner's PostgreSQL instead of Docker Hub (#85), W1 typed feature flags (#88), W2 one shared database pool with per-request cached loaders (#89).
- Research: market homework (28 site notes, ranking, lessons, Slovak demand, advisory networks, positioning and business model) in the vault under `research/market-homework/`; the free scraper is at `~/tools/crawl4ai`.
- Live checks 2026-10-10: `/api/health` 200, pages 0.5 to 1.8 s, 16 CronJobs and the web pod on the same image, 08:00 Alpha Vantage collect ok. Open proof: the 05:30 judge made no model call (no signal had changed), so H1 still needs a scheduled run that stores ideas; discovery 09:30 and review calendar 11:00 on the new image are checked next.
- Next in the roadmap: D11 universe membership, D18 to D20 SEC fundamentals and filings backfills, EN2 to EN5 engine alignment, W3 and W4 web performance and design baseline, PL2 onward platform tasks, and the owner decisions list in `docs/roadmap/README.md` section b.

## Not planned

- Go or microservice rewrite. The workload is about 35 tickers a day and the jobs share types and logic with the web. Revisit only if one collector gets heavy or the pieces get different owners.
