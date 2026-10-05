# Status, 2026-10-05

Work paused here. Nothing from this branch is deployed. The only cluster change today was suspending `invest-buddy-scan-claude` through the infra repo (PR #14).

## Why this work exists

The 05:30 Claude scan ran 36 `claude -p` sessions (35 tickers plus macro, 2 schema retries, 17 minutes) on the subscription token and used most of the 5h limit. The new design collects data with scripts, lets AI read stored text only, and lets code make the decisions. See `docs/script-first-pipeline.md`.

## Built on this branch

- Collectors for SEC EDGAR (8-K and EX-99.1 earnings text, Form 4 insider trades), GlobeNewswire and FRED, plus 12 keyless sources (XBRL frames, EDGAR current filings, 13F with OpenFIGI, openFDA, ClinicalTrials.gov, USAspending, Fed, Treasury, BLS, VIX, Google News, GDELT), each with `--ping`.
- Storage: migrations 007 to 010 (`source_documents`, `collected_facts`, `collector_runs`, `cusip_map`, `extraction_runs`, `carried_from`, `trade_ideas`, `judge_runs`, `portfolio_baseline`). Retention is 30 days for raw data, 90 for ideas.
- `detect` (which tickers changed), `retention`, and a `CARRY_FORWARD=on` flag (default off) so a partial scan does not blank the other tickers.
- Extractor (`scanner/run-extract.mjs`): AI with no tools reads a stored bundle and returns the scan JSON. Quotes are checked against stored text. One local haiku call on fixtures used 1 turn, 9 in and 7,862 out tokens, about $0.06.
- Judge (`scanner/run-judge.mjs`): `src/engine/signals.ts` decides action, EUR band and ratings in code. The AI only writes wording and may only downgrade to WATCH. Chart numbers come from `src/data/technicals.ts`. Runs on the subscription CLI, not an API key. One local sonnet call cost about $0.10. The ideas page is hidden unless `IDEAS_PAGE=on`.
- Docs: `docs/data.md`, `docs/FINAL-STATE.md`, `docs/tasks-accounts-needed.md` (includes the IBKR findings), `docs/tasks-change-based-scanning.md`.

## Checks at the time of the pause

`npm run lint` and `npm run typecheck` clean. Vitest 304 passed, 3 skipped. Scanner `node --test` 0 failures. The database-backed tests were skipped, so migrations 007 to 010 were only applied to throwaway local databases by individual writers.

## Open from the final review (`final_review.md`)

A fix writer was stopped part way through. Some items are in the tree, but none were re-reviewed. Treat all of them as open until checked:

1. Scanner helper exports and the `USER` env fix in `scanner/run-scan.mjs` (now committed, scanner tests pass).
2. Refuse the placeholder `SEC_USER_AGENT` at startup (`src/collectors/sec-user-agent.ts` was added; wiring not confirmed).
3. Document expiry must follow the evidence window and refresh on re-fetch.
4. Retention must keep documents cited by any unexpired finding, idea or extraction run.
5. CronJob order: scan jobs at 05:30 run before collect at 05:35. Desired order is collect, detect, extract, reconcile, daily, judge. New jobs must stay suspended until then.
6. Filter judge input and the ideas page to documents with `display_allowed`.
7. Smaller items: per-item number check in the judge, date validation in two routes, bounded request bodies, an EOF whitespace fix.

## Not done

- No cluster test. The image builds only on a push to `main`, so a pre-merge test needs a local image build and an approved import. Migrations 007 to 010 must be applied first.
- Extractor excerpts: the first live NVDA run had 7 of 8 fields null because only the start of the 10-Q reached the model. Keyword-window excerpts and separate EX-99.1 documents were added; this has not been re-run live.
- Extract and judge CronJobs do not exist yet.
- Codex adapter for the judge is not built.

## Setup changes needed before continuing

1. Set a monitored contact in `SEC_USER_AGENT` (ConfigMap still has `REPLACE_WITH_CONTACT_EMAIL`). SEC blocks placeholder agents.
2. Decide the next scan path: the Claude scan stays suspended; Codex needs the account token.
3. Decide whether the ideas page may be public (ADR-001 forbids EUR sizing in the public product).
4. Review the point tables and band percentages in `SIGNAL_RULES` (`src/engine/signals.ts`); they are a first reading of your rules.
5. Enter the private portfolio baseline by hand or from an IBKR MCP session (read-only, interactive OAuth, headless use unverified).
6. Accounts and licences: see `docs/tasks-accounts-needed.md` (Alpha Vantage key and display rights, FRED key, EIA key, Twelve Data plan, Google News and GDELT terms).

## Next steps, in order

1. Re-review the open items above and finish them with one writer.
2. Re-run the full suite and one live NVDA extraction.
3. Build an image, apply migrations 007 to 010, then run one scoped manual collect Job on khtz. Needs your approval at each step.
4. Wire the CronJobs through the infra repo only after the manual run is proven.
