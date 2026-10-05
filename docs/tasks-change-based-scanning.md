# Tasks: cheaper, change-based scanning

Context: the 05:30 Claude CronJob ran 36 `claude -p` sessions (35 tickers + macro) plus 2 schema retries in 17 minutes on 2026-10-05, using the subscription token (`CLAUDE_CODE_OAUTH_TOKEN`). It drew from the same 5h pool as interactive work. The CronJob args are only `--agent claude`, so the model is the CLI default (not confirmed in the cluster).

Goal: both agents keep collecting facts, but only for tickers that changed, with a cheaper model and a turn cap. A separate judgement step turns reconciled facts into trade ideas.

## 0. Stop the drain (blocked on infra repo)
- [ ] Set `suspend: true` on `invest-buddy-scan-claude` in `Filipcsupka/infra` (`gitops/apps/invest-buddy/overlays/prod`). A live patch is reverted by Argo (`selfHeal: true`).
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
- [ ] Today `reconcile.ts` and `daily.ts` expect findings for every ticker per `as_of`. A partial scan leaves the rest missing.
- [ ] Reuse the latest `consensus_findings` row for unscanned tickers, tagged with its origin date.
- [ ] Per-field expiry (examples: earnings facts until next report, `productCatalyst` about 90 days, insider buying about 30 days). Expired fields become unknown (`null`).
- [ ] Show carried-over data as carried in the UI and the score fingerprint, never as fresh.
- [ ] Check whether existing tables are enough or a migration is needed.
- [ ] Update `reconcile.test.ts` and `daily.test.ts`.

## 5. Two agents, split roles
- [ ] Codex (Luna) as second collector once the account token is ready: set `--model gpt-6-luna` on `invest-buddy-scan-codex` and un-suspend. Needs a populated `invest-buddy-codex-auth-seed`.
- [ ] Verify the seed secret has a real `auth.json` without printing it.
- [ ] Local Codex Luna dry run on NVDA passed on 2026-10-05 (macro 65s, NVDA 48s, schema ok). Run a larger sample before the cron.

## 6. Judgement step
- [ ] One call, no web tools, small input: reconciled facts plus portfolio baseline in, trade ideas out, using the alert format from the ChatGPT task prompt.
- [ ] Pick the model for this step (Claude Sonnet/Opus vs Codex).
- [ ] Only notify on actionable changes; no routine HOLD output.

## 7. Billing safety
- [ ] Decide whether the cron stays on the subscription token or moves to its own key, so it stops sharing the 5h pool with interactive work.
- [ ] Log token usage per run (CLI `usage` / `modelUsage`) in the run log so the next surprise shows up in the job output.
