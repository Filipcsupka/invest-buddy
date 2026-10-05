# Status, 2026-10-05

Work paused here. Nothing from this branch is deployed. The only cluster change today was suspending `invest-buddy-scan-claude` through the infra repo (PR #14).

## Why this work exists

The 05:30 Claude scan ran 36 `claude -p` sessions (35 tickers plus macro, 2 schema retries, 17 minutes) on the subscription token and used most of the 5h limit. The new design collects data with scripts, lets AI read stored text only, and lets code make the decisions. See `docs/script-first-pipeline.md`.

## Built on this branch

- Collectors for SEC EDGAR (8-K and EX-99.1 earnings text, Form 4 insider trades), GlobeNewswire and FRED, plus 12 keyless sources (XBRL frames, EDGAR current filings, 13F with OpenFIGI, openFDA, ClinicalTrials.gov, USAspending, Fed, Treasury, BLS, VIX, Google News, GDELT), each with `--ping`.
- Storage: migrations 007 to 010 (`source_documents`, `collected_facts`, `collector_runs`, `cusip_map`, `extraction_runs`, `carried_from`, `trade_ideas`, `judge_runs`, `portfolio_baseline`). Raw documents are kept for the evidence window of their type (30 to 100 days), ideas for 90.
- `detect` (which tickers changed), `retention`, and a `CARRY_FORWARD=on` flag (default off) so a partial scan does not blank the other tickers.
- Extractor (`scanner/run-extract.mjs`): AI with no tools reads a stored bundle and returns the scan JSON. Quotes are checked against stored text. One local haiku call on fixtures used 1 turn, 9 in and 7,862 out tokens, about $0.06.
- Judge (`scanner/run-judge.mjs`): `src/engine/signals.ts` decides action, EUR band and ratings in code. The AI only writes wording and may only downgrade to WATCH. Chart numbers come from `src/data/technicals.ts`. Runs on the subscription CLI, not an API key. One local sonnet call cost about $0.10. The ideas page is hidden unless `IDEAS_PAGE=on`.
- Docs: `docs/data.md`, `docs/FINAL-STATE.md`, `docs/tasks-accounts-needed.md` (includes the IBKR findings), `docs/tasks-change-based-scanning.md`.

## Checks

`npm run lint` and `npm run typecheck` are clean. Vitest: 316 passed, 3 skipped. Scanner `node --test`: 54 passed, 0 failed. The database-backed tests were skipped, so migrations 007 to 010 were only applied to throwaway local databases by individual writers.

## Final review items (`final_review.md`)

A fix writer was stopped part way through. On 2026-10-05 a second writer went through the list in the tree. None of it has had a separate review yet.

1. Done. Scanner helper exports and the `USER` env fix are committed and the scanner tests pass.
2. Done in code. `requireSecUserAgent` refuses the `REPLACE_WITH_CONTACT_EMAIL` placeholder at the start of collect and live reconcile, and in the SEC clients. The ConfigMap still holds the placeholder (see setup change 1).
3. Done. A document now expires after the evidence window of its type (100, 60 or 30 days from `freshnessDays`) and the window restarts on every fetch. Facts still expire after 30 days and restart only when their value changes. Tests are in `src/jobs/collect-fixes.test.ts` and `src/jobs/retention.test.ts`.
4. Done. Retention keeps expired documents cited by any unexpired finding, idea or extraction run. The tests that run against Postgres are skipped without `TEST_DATABASE_URL`, so the SQL itself has only been checked as text.
5. Done in the manifests. Order is collect 05:35, detect 06:10, extract 06:25, reconcile 07:00, daily 07:15, judge 07:45, Tuesday to Saturday. Extract and judge CronJobs were added. Every new job, reconcile, daily and both web-search scan jobs are suspended: reconcile and daily stay off until `SEC_USER_AGENT` has a real contact and extract has run. Collect, detect, extract and judge cap `startingDeadlineSeconds` at 300 and the container root filesystems of extract and judge are read-only. `kustomize build` and `kubeconform` pass. `src/jobs/cronjob-order.test.ts` checks the order.
6. Done. The judge input and the ideas page only use documents with `display_allowed`.
7. Done. Request bodies are bounded on every ingest route, the date checks reject impossible days such as 2026-02-30 in query strings and bodies, the judge checks figures against each idea's own context, and the EOF newlines are fixed.

## Not done

- No cluster test. The image builds only on a push to `main`, so a pre-merge test needs a local image build and an approved import. Migrations 007 to 010 must be applied first.
- Extractor excerpts: the first live NVDA run had 7 of 8 fields null because only the start of the 10-Q reached the model. Keyword-window excerpts and separate EX-99.1 documents were added; this has not been re-run live.
- Extract and judge CronJobs exist as manifests but are suspended and have never run. The read-only root filesystem on them is untested; the writable paths are the `/tmp`, `/home/scanner` and `/app/scanner/out` emptyDirs.
- Codex adapter for the judge is not built.

## Setup changes needed before continuing

1. Set a monitored contact in `SEC_USER_AGENT` (ConfigMap still has `REPLACE_WITH_CONTACT_EMAIL`). SEC blocks placeholder agents.
2. Decide the next scan path: the Claude scan stays suspended; Codex needs the account token.
3. Decide whether the ideas page may be public (ADR-001 forbids EUR sizing in the public product).
4. Review the point tables and band percentages in `SIGNAL_RULES` (`src/engine/signals.ts`); they are a first reading of your rules.
5. Enter the private portfolio baseline by hand or from an IBKR MCP session (read-only, interactive OAuth, headless use unverified).
6. Accounts and licences: see `docs/tasks-accounts-needed.md` (Alpha Vantage key and display rights, FRED key, EIA key, Twelve Data plan, Google News and GDELT terms).

## Next steps, in order

1. Have the review items above checked by a separate reviewer, with `TEST_DATABASE_URL` set so the retention tests run.
2. Re-run one live NVDA extraction.
3. Build an image, apply migrations 007 to 010, then run one scoped manual collect Job on khtz. Needs your approval at each step.
4. Wire the CronJobs through the infra repo only after the manual run is proven.
