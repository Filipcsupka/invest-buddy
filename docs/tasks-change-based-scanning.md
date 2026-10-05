# Tasks: cheaper, change-based scanning

Context: the 05:30 Claude CronJob ran 36 `claude -p` sessions (35 tickers + macro) plus 2 schema retries in 17 minutes on 2026-10-05, using the subscription token (`CLAUDE_CODE_OAUTH_TOKEN`). It drew from the same 5h pool as interactive work. The CronJob args are only `--agent claude`, so the model is the CLI default (not confirmed in the cluster).

Goal: both agents keep collecting facts, but only for tickers that changed, with a cheaper model and a turn cap. A separate judgement step turns reconciled facts into trade ideas.

## 0. Stop the drain (blocked on infra repo)
- [x] Set `suspend: true` on `invest-buddy-scan-claude` in `Filipcsupka/infra` (`gitops/apps/invest-buddy/overlays/prod`). A live patch is reverted by Argo (`selfHeal: true`). Done through infra PR #14.
- [ ] Verify with `kubectl -n invest get cronjob` after sync.

## 1. Measure before changing
- [ ] Read `runner.model` of the 2026-10-05 Claude scan from the invest DB (`scan_findings.runner`) to confirm which model ran.
- [ ] Local A/B on NVDA, CRWD, ASML: Haiku vs Sonnet. Record CLI `usage` (tokens), turns, wall time, schema pass/fail.
- [ ] Decide the Claude collector model from that result.

## 2. Cap the per-ticker loop
- [ ] Add `--max-turns` (start around 10) to the claude args in `scanner/run-scan.mjs`.
- [ ] Trim `scanner/prompts/ticker-scan.md`: earnings 8-K exhibit first, no full filings or PDFs.
- [ ] Look at why CRWD took 431s and why CRWD and ASML failed `missing https evidence for fundamentals.productCatalyst` on the first try.

## 3. Change detector (no tokens)
- [ ] New script that picks tickers to scan: new 8-K/10-Q/10-K/Form 4 on EDGAR since the last scan, earnings date passed, large price or volume move (use the prices job data).
- [ ] Output a symbol list passed to `run-scan.mjs --only`.
- [ ] Keep the macro scan daily (two fields depend on it).
- [ ] Weekly full sweep of all 35 tickers on one weekday, to catch news-only catalysts.

## 4. Carry-forward in reconcile and daily
- [x] Today `reconcile.ts` and `daily.ts` expect findings for every ticker per `as_of`. A partial scan leaves the rest missing. (`CARRY_FORWARD=on`, default off)
- [x] Reuse the latest `consensus_findings` row for unscanned tickers, tagged with its origin date. (`carried_from`)
- [x] Per-field expiry. Uses the evidence windows in `freshnessDays` (100, 60, 30 days), not the examples listed here. Expired fields become unknown (`null`).
- [x] Show carried-over data as carried in the UI and the score fingerprint, never as fresh.
- [x] Check whether existing tables are enough or a migration is needed. Migration 009 adds `consensus_findings.carried_from`.
- [x] Update `reconcile.test.ts` and `daily.test.ts`. New cases are in `src/jobs/carry-forward.test.ts` and `src/data/carry-forward.test.ts`; the old files are unchanged.

## 5. Two agents, split roles
- [ ] Codex (Luna) as second collector once the account token is ready: set `--model gpt-6-luna` on `invest-buddy-scan-codex` and un-suspend. Needs a populated `invest-buddy-codex-auth-seed`.
- [ ] Verify the seed secret has a real `auth.json` without printing it.
- [ ] Local Codex Luna dry run on NVDA passed on 2026-10-05 (macro 65s, NVDA 48s, schema ok). Run a larger sample before the cron.

## 6. Judgement step
- [x] One call, no web tools, small input: reconciled facts plus portfolio baseline in, trade ideas out. `scanner/run-judge.mjs`, `scanner/prompts/judge.md`, `docs/data.md` (Judge).
- [x] Pick the model for this step: Claude Sonnet on the subscription CLI, set with `--model` or `JUDGE_MODEL`. Codex adapter not built.
- [x] Only notify on actionable changes; no routine HOLD output. Only ideas whose deterministic signature changed are stored.
- [x] Code decides action, amount band and ratings (`src/engine/signals.ts`); the AI writes wording and may only downgrade to WATCH EUR 0.
- [x] Chart numbers from stored bars (`src/data/technicals.ts`), no raw series sent to the model or the page.
- [x] Portfolio baseline shape and routes (`portfolio_baseline`, `/api/ingest/portfolio-baseline`).
- [x] Web page `/ideas` with nav link, behind `IDEAS_PAGE=on` (ADR-001).
- [x] Hook `purgeIdeas` into `src/jobs/retention.ts`.
- [ ] Run the judge as a CronJob after reconcile and daily. The manifest `invest-buddy-judge` exists (07:45, suspended); it has not run on a cluster.
- [ ] Decide whether the ideas page may be public (ADR-001 says no EUR sizing in the public product).

## 7. Billing safety
- [ ] Decide whether the cron stays on the subscription token or moves to its own key, so it stops sharing the 5h pool with interactive work.
- [x] Log token usage per run (CLI `usage` / `modelUsage`) in the run log so the next surprise shows up in the job output. Table `extraction_runs`, its route and `scanner/extraction-log.mjs` exist, and `run-extract.mjs` records each ticker's tokens and prints the run totals. The judge logs and stores its tokens, turns and cost in `judge_runs`.
