# Lane ENGINE, AI and PORTFOLIO (IDs EN1 to EN44)

Synthesis 2026-10-09: this copy is the working version for the window. The master plan is `docs/roadmap/README.md`. Lines starting with "Synthesis note" and the section "Changes by the synthesis" at the end are the only additions to the lane draft in ops-brain. Migration numbers written below (022, 023 and so on) are placeholders: several lanes claim the same numbers, so each PR takes the next free number when it opens (PL7 rule, PL15 lint). IDs from `docs/tasks-open.md` (A1 to I1, for example E1, C2, D1b, D2) are written with the prefix "tasks-open" where they could be read as a data lane ID.

Planning only. Written 2026-10-09 from the repo at `/Users/filipcsupka/moje/invest-buddy` (main at 8c844e6), read-only SELECTs on the khtz Postgres, and the vault notes named in the brief. No repo edits were made. The prefix is EN because the repo already uses E1 to E6 for operations tasks.

## Goal of the lane

Make the strategy and the AI automation correct, deep and useful for the owner's own portfolio and for the product, by 2026-12-31. Concretely: one rule set that matches `InvestingGuide.md` (or a written, owner-signed list of differences), owner sizing and portfolio analytics built on IBKR Flex data, an honest replay and track record, a more reliable and cheaper extract and judge flow, and a discovery and review cycle that keeps history accumulating.

## Facts the plan rests on (checked 2026-10-09)

- `src/engine/score.ts` already matches Guide section 6 (4/3/2/1, 3/3/2/2, 2/3; thresholds 18/15/12). `src/engine/signals.ts` has a second, private point system (companyPoints, catalystPoints, entryPoints) and decides every action. Source: C5 report (scratchpad c5-report.md, 2026-10-08) and the code.
- PR #80 (open) moves `minScoreForBuy` from 15 to 18 and applies it to ADD too. Guide section 8 says an ADD alert needs score 15 or more, so that part needs the owner.
- `signals.ts` `confirmed()` counts only `agree` and `xbrl_override`. `db-provider.ts` `CONFIRMED_FUNDAMENTAL_AGREEMENTS` also counts `verified_single` and `data_rule`. Latest consensus rows on 2026-10-08: data_rule 84, xbrl_override 41, verified_single 17, single 90, agree 0. Because no row is `agree`, catalyst rating cannot reach Strong and HIGH_CONVICTION_ADD is unreachable in practice (C5 report).
- Guide rules 3 (deep add) and 4 (breakout retest) have no code path. `regimeOf` in `src/data/technicals.ts` knows uptrend, pullback (5 to 10 percent under the 20 day high), deep_pullback (over 10 percent under it, above MA200), range, downtrend.
- Decision G1 (2026-10-06): the action is data-only and never depends on holdings. The Guide's "ADD only for an existing position" therefore has to live in the owner view, not in the public signal.
- `src/engine/allocation-config.ts` holds draft EUR values (starter EUR 40 to 70, ceiling for a full order EUR 200). The Guide says initial buy EUR 20 to 40, add EUR 20 to 50, deep add EUR 50. They differ and are unsigned.
- The Flex query returns only OpenPositions, CashReport, ConversionRates and ChangeInNAV (`src/portfolio/flex.ts`, `src/portfolio/fixtures/flex-live.xml`). No trades, fees, dividends or lots are read. `portfolio_nav_history` has 234 rows, 2025-11-17 to 2026-10-08. `portfolio_baseline` has 3 rows (2026-10-05 to 2026-10-08), so there is no cash history yet.
- `src/track-record/measure.ts` measures 30, 90 and 180 calendar days (`WINDOWS`). The brief asks for 1, 5, 20 and 60 days. `record_signals` has 16 rows (8 score, 8 judge), `record_snapshots` 103 rows, from 2026-10-06 on. Track record tables are immutable (migration 018).
- Retention: `collected_facts`, `source_documents`, `extraction_runs` and `judge_runs` expire after 30 days, `trade_ideas` after 90 days (migrations 007, 009, 010). `daily_bars` holds 9,766 rows for 37 tickers from 2025-09-22 (about 260 bars each; `prices.ts` loads 260). So point-in-time fundamentals and long price history do not accumulate today.
- AI cost so far: `extraction_runs` 105 rows (104 ok, 1 failed), 778,756 input plus output tokens and USD 3.47 in total (haiku 4.5 USD 2.87, haiku 5.5 USD 0.19, sonnet 5.5 USD 0.41). `judge_runs`: 8 ok, 3 failed; failures were figure checks and evidence-link counts ("figures not in the input: 200", "Slovak prose figures differ from English", "fewer than two evidence links for ADD").
- Judge does not yet check `AI_DAILY_TOKEN_CEILING` (docs/data.md, last paragraph). Extract does.
- Discovery (F7): `screenDiscoveryShortlist` ranks growth-frames names first, screens up to 24, and logs `notPassed`; only passed candidates are stored (`discovery_candidates` has 5 rows).

## Source terms checked for this lane (2026-10-09)

| Source | Use in this lane | Terms status |
|---|---|---|
| SEC EDGAR (submissions, companyfacts, frames, filings) | Revenue and filing facts, 424B5, 8-K, point-in-time `filed` dates | Fetched https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data on 2026-10-09: maximum 10 requests per second, identify the client with a User-Agent, no botnets or crawling tools. The repo uses 4 per second. Re-use and redistribution wording not read on that page: unverified. |
| Finnhub | Possible EPS estimates | Fetched https://finnhub.io/terms-of-service on 2026-10-09: all listed plans are personal use, no business use even internal without written approval, no redistribution of data or derived results. Not usable for the product without a paid agreement. |
| Alpha Vantage | EPS surprise (already collected) | https://www.alphavantage.co/terms_of_service/ came back as an unreadable PDF on 2026-10-09: unverified. Synthesis note: lane DATA read the same EULA on 2026-10-09: personal, non-commercial use unless agreed in writing. `research/data-providers.md` (2026-10-04) says commercial use equals sales contact. Collected with `display_allowed: false`. |
| ClinicalTrials.gov API | Clinical readouts | https://clinicaltrials.gov/about-site/terms-conditions returned navigation text only on 2026-10-09: unverified. Already collected (`clinicaltrials`) as non-displayable until checked. Synthesis note: not collected on the schedule; no CronJob runs the `clinicaltrials` source and live `source_documents` held no such rows on 2026-10-09 (lane DATA). |
| Twelve Data free plan | Daily bars, history backfill | Internal use only, licence needed before charging (docs/data.md, ADR-002, STATUS.md). Commercial price about USD 499 a month is quoted in `research/data-providers.md` (2026-10-04, not rechecked). |
| FRED, Cboe VIX, BLS, Fed, Treasury | Macro rules | Stored with `display_allowed: false` except BLS, Fed, Treasury (docs/data.md). Display terms for FRED and Cboe still unchecked (tasks-open D1b). |

## Owner decisions needed (grouped, with the tasks that wait on them)

1. Strategy alignment, C5 decisions D1 to D6 (IDs from the C5 report, not lane DATA tasks) (EN2): BUY needs 18 (PR #80); does ADD also need 18 or 15 as in Guide section 8; count `data_rule` and `verified_single`; retire the private point tables; EUR bands against percent of cash; deep add and retest as ADD triggers. Blocks EN3 to EN10.
2. Holding-aware add (EN6): the Guide adds only to existing positions, but G1 made public signals holding-blind. Confirm the owner overlay design.
3. Sizing values (EN10): fixed EUR bands from the Guide, or the draft values in `allocation-config.ts`; IBKR fee and minimum order; how an executed add is recorded.
4. IBKR Flex query change (EN12): add Trades, Cash Transactions, and lot detail to the query in the IBKR portal. Owner action only; no new secret if the token and query ID stay the same, but check the token scope and IP restriction.
5. Backtest and track record wording (EN23, EN27): trading days or calendar days for 1, 5, 20, 60; benchmark SPY or CSPX; whether a replay is shown publicly at all and under what label. Legal view needed before any replay is public.
6. Verification policy (EN30): is `verified_single` enough for key fields, or should high-impact fields get a second extractor, accepting more subscription use.
7. Macro thresholds and EPS source (EN40, EN41): thresholds, unknown-handling, display terms, and whether to keep `epsBeat` as Alpha Vantage only, accept unknown, or pay for consensus data later.
8. Pre-revenue profile (EN43): add a separate profile for names like PCVX, or leave them out of scope.

## Ordering note

Synthesis note: the week plan in `docs/roadmap/README.md` sets the order across lanes.

Tasks are ordered by dependency. EN1 first: it freezes today's behaviour so every later change shows a clear diff. Rule changes (EN3 to EN11) change stored rule versions; each PR must bump the version and update the golden fixtures from EN1.

---

### EN1. Golden fixtures for score and signals
Status: done 2026-10-10, PR #90, merged and live.
- Synthesis note: this task owns `src/engine/golden.test.ts`. PL10 step 2 points here instead of writing a second golden test. The fixture freezes current main before PR #80 or any rule change; EN3 refreshes it after the owner decides.
- Why: C5 found no ticker at 18 and several rule gaps; any change needs a before and after. `signals.test.ts` exists (152 lines) but uses small hand-made cases. Source: `src/engine/signals.test.ts`, C5 report.
- Steps:
  1. Add a read-only script `scripts/export-golden.ts` that reads one scoring date for all 36 tickers (score inputs, consensus fields, technicals) through `buildJudgeInput` and writes `src/engine/fixtures/golden-2026-10-08.json` with no EUR amounts and no cost basis.
  2. Add `src/engine/golden.test.ts` that loads it and asserts action, tier, ratings, points and `reasons` per ticker with `computeSignals` and `score`.
  3. Add a second fixture set with the 6 names at score 15 to 17 and one at 18 built by hand for threshold edges.
  4. Document the update command in `docs/data.md` (one line).
- Acceptance: `npm test` runs `golden.test.ts`; changing any rating table fails it with a readable per ticker diff; the fixture has no private data (grep for `costEur` and `valueEur` finds nothing).
- Size: S
- Depends on: none
- Who: agent (export needs one read of `/api/ingest/judge-input`; the owner token is already in the cluster, so the agent uses a one-off read or a saved copy from the owner)
- Approval needed: none if the owner supplies the JSON; a cluster read of the ingest route is read-only
- Risk or open question: if the live copy is used, 2026-10-08 data is a single day; add more dates later.

### EN2. Record the C5 owner decisions as an ADR
- Synthesis note: "D1 to D6" here are the C5 report decisions, not lane DATA tasks.
- Why: C5 lists D1 to D6 and nothing is signed. `docs/tasks-open.md` C5 and F6 stay open. 130-positioning-and-business-model.md section 10 question 7 asks whether PR #80 merges before marketing.
- Steps:
  1. Write the six decisions as a short table in `~/Documents/ops-brain/projects/investing-platform/decisions/ADR-006-signal-alignment.md` with the options and the C5 recommendation.
  2. Owner marks each decision (yes, no, other value).
  3. Copy the outcome into `docs/tasks-open.md` C5 and mark C5a to C5d.
- Acceptance: ADR file exists with all six decisions answered and dated; `tasks-open.md` C5 points to it.
- Size: S
- Depends on: none
- Who: owner (agent drafts)
- Approval needed: none
- Risk or open question: D1 changes the buy label of AMD, DDOG, NOW, NVDA, PLTR and SNOW from buy to WATCH (C5 report), and the track record already lists a 7 Oct START for AMD; decide how to word that.

### EN3. START at score 18, separate ADD threshold (PR #80 follow-up)
Status: thresholds and boundary tests merged in PR #80; PR #90 introduced the golden edges, refreshed in PR #80. PR #107 corrects the rule explanation and golden reasons. EN2 owner sign-off remains open.
- Why: Guide section 8 sets START at 18 and ADD at 15. PR #80 already implements both thresholds; its explanation still calls every 15 to 17 result WATCH.
- Steps:
  1. After EN2, adjust PR #80: add `minScoreForAdd` to `SIGNAL_RULES` in `src/engine/signals.ts` (value from EN2), keep `minScoreForBuy` 18.
  2. Bump `SIGNAL_RULES.version`.
  3. Extend `signals.test.ts` for scores 14, 15, 17, 18 for START and ADD.
  4. Update the rule table in `docs/data.md` and the methodology text through `src/components/method.tsx`.
  5. Refresh the golden file from EN1.
- Acceptance: tests show 15 to 17 gives WATCH for START and the ADD result matches the ADR; golden diff lists the six affected names only.
- Size: S
- Depends on: EN1, EN2
- Who: agent
- Approval needed: none (merge to main is the normal delivery; a deploy follows the existing flow)
- Risk or open question: public wording of existing stored ideas that were START at 15 to 17; they stay as history.

### EN4. Count `data_rule` and `verified_single` in signals
- Why: `confirmed()` in `signals.ts` disagrees with `CONFIRMED_FUNDAMENTAL_AGREEMENTS` in `src/data/db-provider.ts`. C5 estimated 0 action changes on 2026-10-08 but company rating changes for 10 tickers and catalyst for 5.
- Steps:
  1. Export the agreement list from one place (`src/data/db-provider.ts` or a new `src/engine/agreements.ts`) and import it in `signals.ts`.
  2. Keep the unconfirmed cap: carried data still caps tier at STARTER.
  3. Test: a `verified_single` true `productCatalyst` raises the catalyst points; a `single` row still does not.
  4. Bump `SIGNAL_RULES.version`; refresh golden.
- Acceptance: one definition of "counts"; test fails if the two lists differ; golden shows the rating changes C5 predicted.
- Size: S
- Depends on: EN1, EN2
- Who: agent
- Approval needed: none
- Risk or open question: the alternative (drop both from the score) is stricter; owner chooses in EN2.

### EN5. One point system: derive ratings from the Guide score
- Why: `signals.ts` company, catalyst and entry points use values that are not in the Guide (revenue accel 2, EPS 1, guidance 1, product 3, RSI and extension terms). C5 mismatch 2 and 7.
- Steps:
  1. Replace `companyPoints`, `catalystPoints` with ratings computed from `ScoreResult.ruleHits` in `src/engine/score.ts` (fundamentals 0 to 10 bands).
  2. Keep entry as the Guide technical part (above both MAs 3, uptrend 3, green volume 2, dip 2) plus the existing RSI and extension values as named filters in a separate `ENTRY_FILTERS` object with a comment that they are not Guide rules, or drop them per EN2.
  3. Insider buying alone does not make a rating Strong; require one of revenue acceleration, earnings or catalyst (Guide 4.1 F).
  4. Document green volume as a proxy of "stock reacts positively on volume".
  5. Update `src/components/idea-card.tsx` labels only if rating names change.
- Acceptance: no private point table remains in `signals.ts`; `score.test.ts` and `signals.test.ts` pass; golden diff explained per ticker in the PR; the same input from `score.ts` produces the same rating in tests.
- Size: M
- Depends on: EN3, EN4
- Who: agent
- Approval needed: none
- Risk or open question: ratings feed the judge prompt (`scanner/prompts/judge.md`) and stored ideas (`trade_ideas.setup`); the signature in `ideaSignature` changes, which makes the judge re-write ideas once. Expect one extra judge run.

### EN6. Owner overlay: holding-aware ADD and dip bounds
- Why: Guide rule 2 adds only to an existing position on a 5 to 10 percent dip, with a trend intact and score above 15. G1 made public actions holding-blind, so this must sit in the private owner view. C5 mismatch 4.
- Steps:
  1. New pure function `ownerAction(signal, technicals, held)` in `src/engine/owner-overlay.ts` returning START, ADD (held, `belowHigh20Percent` between 5 and 10, uptrend, score at least the ADD value from EN3), HOLD or WATCH, with reasons.
  2. Feed it from `src/data/owner-allocation.ts` (it already reads the baseline and latest ideas).
  3. Public signal code stays unchanged.
- Acceptance: tests show the same ticker gets START when not held and ADD when held; a held name with a 3 percent dip gets HOLD; public `signalFor` output is identical with and without a baseline (existing test kept).
- Size: M
- Depends on: EN3
- Who: agent
- Approval needed: none
- Risk or open question: owner confirmation that the overlay (not the public signal) is the right place; legal view on public ADD labels is G5 and is not this task.

### EN7. Deep add rule (15 to 20 percent dip)
- Why: Guide rule 3 and section 7 (EUR 50 if 15 to 20 percent dip, no earnings or guidance damage, score above 18). No code path today; `deepPullback` only adds one entry point. C5 mismatch 3.
- Steps:
  1. In `src/data/technicals.ts` add `belowRecentHigh` over a window the owner picks (20 day is the repo's definition for the 5 to 10 percent rule; a 60 day high is an alternative) and a `deepAddZone` boolean (15 to 20 percent under, still above MA200).
  2. In `src/engine/owner-overlay.ts` add DEEP_ADD for held names: needs `guidanceCut` and `revenueDeclining` not true, no "bad earnings" flag (EN9), score above 18.
  3. Add an amount line to `allocate()` (EN10).
  4. Tests with synthetic bars at 14, 15, 20 and 21 percent under the high.
- Acceptance: boundary tests pass; a dip caused by a confirmed guidance cut gives no deep add; the zone is documented in `docs/data.md`.
- Size: M
- Depends on: EN6, EN9
- Who: agent
- Approval needed: none
- Risk or open question: the Guide says "recent high" without a window; owner picks. "Dip due to market volatility, not company failure" cannot be tested directly; proxy is no confirmed negative company field and SPY down over the same window (state it as a proxy).

### EN8. Breakout retest detection
- Why: Guide rule 4: buy a retest of broken resistance that holds. Not implemented; only a breakout flag exists in `ratings()`. C5 mismatch 3.
- Steps:
  1. In `src/data/technicals.ts` define resistance as the highest close of the prior N sessions before the breakout (N and the retest tolerance are placeholders, owner to confirm), a breakout day as close above it on volume ratio at least 1.2 (existing constant), and a retest as a later close within a tolerance band above the level with no close below it.
  2. Add `retest: { level, breakoutDate, daysSince } | null` to `Technicals`.
  3. Use it in the owner overlay from EN6 as an ADD trigger.
  4. Fixture tests from hand-built bar series: clean retest, failed retest (close below level), no breakout.
- Acceptance: the three fixtures give the expected result; `computeTechnicals` stays pure and deterministic; the judge input carries the new field only as a derived number.
- Size: M
- Depends on: EN6
- Who: agent
- Approval needed: none
- Risk or open question: the definition is subjective, so label it as one explicit definition on the methodology page; false positives are likely and should be measured in EN26.

### EN9. Stop-adding and sell rules from Guide sections 7 and 8
- Why: Guide stop-adding list (revenue declines, guidance cut, 200 day break after bad earnings, narrative change) and SELL only for fundamentals collapse, guidance cut plus broken trend, or fraud. Code treats "Criteria broken" (close under MA200 or MA50 under MA200) as THESIS_BROKEN for a held name. C5 mismatch 5 and 6.
- Steps:
  1. Add `addBlocked: string[]` to `Signal` in `signals.ts`: confirmed revenue decline, confirmed guidance cut, `narrativeChanged` true, close under MA200 within N sessions after an earnings report that is flagged bad (use `epsBeat` false or `guidanceCut` true from the last 100 day fact).
  2. Split THESIS_BROKEN: trend-only break gives WATCH with a reason; fundamentals collapse or guidance cut plus broken trend gives THESIS_BROKEN. Fraud or scandal stays a manual owner flag (no data source).
  3. Show `addBlocked` in the owner view only.
- Acceptance: tests for each stop-adding reason and for the trend-only case; a held name under MA200 with intact fundamentals is not THESIS_BROKEN; golden refreshed.
- Size: M
- Depends on: EN3, EN4
- Who: agent
- Approval needed: none
- Risk or open question: "bad earnings" needs a definition (EPS miss, guidance cut, or a post-earnings drop); owner picks. `score.ts` rejection reasons still include the trend, which blocks buys for everyone and stays.

### EN10. EUR sizing aligned to the Guide, with tier priority
- Why: Guide section 7 gives fixed EUR bands and section 9 gives tier priority. `allocation-config.ts` holds different draft numbers and `allocate()` does not rank by Guide tier (C5 mismatch 8). G6 is implemented with open owner values.
- Steps:
  1. Owner chooses: Guide bands (initial 20 to 40, add 20 to 50, deep add 50, from EUR 200 a month) or the draft config. Record in ADR-006.
  2. Update `src/engine/allocation-config.ts` comments to cite the Guide section for each value; remove or mark values with no source.
  3. In `src/engine/allocation.ts` rank competing signals by Guide tier from `instruments.tier` (column exists, migration 003) before score; add `DEEP_ADD` amount.
  4. Fee check using the config fee and minimum.
  5. Tests in `allocation.test.ts`: EUR 200 month with two competing signals, cap, carry-over, deep add, fee above max percent.
- Acceptance: allocation outputs match the signed bands; ranking test shows a tier 1 name beats a tier 3 name at equal score; no value in the config lacks a source note.
- Size: M
- Depends on: EN2, EN7
- Who: agent (values from owner)
- Approval needed: none
- Risk or open question: `instruments.tier` content not read in this pass; check the seed in migration 003 matches Guide section 9. IBKR fee and minimum order are unknown (draft EUR 0.35).

### EN11. Rule versioning, changelog and the F6 placeholders in one config
- Synthesis note: the config hash test here is the single rules-version guard; PL10's version check uses it.
- Why: F6 asks for the drawdown band (20), valuation band (PE 25), insider cluster (3 in 30 days), turnover target (30 percent) in one file with sources (`src/jobs/gate-config.ts` has only the first four). `SCORE_RULES_VERSION` and `SIGNAL_RULES.version` are separate strings. EPS threshold `EPS_BEAT_MIN_SURPRISE_PCT` is 0.
- Steps:
  1. Create `src/config/rules.ts` re-exporting GATE, EPS threshold, INSIDER_MIN_NET_BUY_USD and the turnover target, each with a comment citing the Guide section or "placeholder, owner".
  2. One `RULESET_VERSION` combining score and signal versions; stored on `record_snapshots.rules_version` and `trade_ideas`.
  3. `docs/rules-changelog.md` with one entry per version, mirrored to the methodology page by the web lane.
  4. Test: changing any value without a version bump fails (hash of the config in a test).
- Acceptance: one file lists every placeholder with source; the hash test passes; the changelog has an entry for the versions touched in EN3 to EN9.
- Size: S
- Depends on: EN3
- Who: agent; owner signs the values (F6) and the EPS threshold (C5c: keep 0 or 2)
- Approval needed: none
- Risk or open question: the turnover target has no consumer in code that I found; mark it as documentation only.

### EN12. Extend the IBKR Flex query and read the real fields
- Why: analytics (EN15 to EN20) need trades, fees, dividends and lots. The live query has none. `research/ibkr.md` lists Trades and Cash Transactions as Flex sections [S, secondary sources]; exact field names and lot-level detail are unverified.
- Steps:
  1. Owner adds Trades, Cash Transactions and Open Positions with lot detail to the Activity Flex query in the IBKR portal, with a 365 day period and Breakout by Day kept on, and saves the query ID unchanged.
  2. Owner sends one redacted statement (no account id) to the agent or places it at `src/portfolio/fixtures/flex-extended.xml`.
  3. Agent writes a field table in `docs/data.md` from that real file.
- Acceptance: a redacted fixture with at least one trade and one cash transaction exists; the field table lists attribute names as seen; the Flex token scope and IP restriction are noted as checked or unchecked.
- Size: S
- Depends on: none
- Who: owner then agent
- Approval needed: third-party account change (IBKR portal); no new secret
- Risk or open question: if lots are not available in Flex, tax-lot view (EN19) reduces to cost basis per position. Redaction must remove the account id and any name.

### EN13. Parse and store trades and cash transactions
- Synthesis note: the risk note below is wrong: `invest-buddy-portfolio` has `suspend: false` in `deploy/gitops` and live, and last ran 2026-10-09 06:00 UTC (read by the synthesis on 2026-10-09).
- Why: the executed-add history that G6 needs, fees, dividends and contribution analysis all depend on trades.
- Steps:
  1. Extend `parseFlexStatement` in `src/portfolio/flex.ts` with `trades` and `cashTransactions` rows; convert amounts with the existing `src/portfolio/eur.ts` rates (skip rows with no rate and count them, as positions do).
  2. Migration `022_portfolio_trades.sql`: `portfolio_trades` (trade id from Flex as the key, date, symbol, side, quantity, price, fee, currency, EUR value) and `portfolio_cash_events` (date, type, EUR amount). No account id column. Private, same handling as `portfolio_nav_history`.
  3. Upsert in `src/jobs/portfolio.ts` and a repository in `src/db/portfolio-trades.ts`.
  4. Tests: parse the EN12 fixture, idempotent rerun, missing rate skipped.
- Acceptance: running the portfolio job twice stores each trade once; `npm test` covers parse and upsert with the fixture; nothing exposes raw rows through a page or `/api/health`.
- Size: M
- Depends on: EN12
- Who: agent
- Approval needed: live migration (cluster write) and the existing portfolio CronJob run
- Risk or open question: the portfolio CronJob is suspended in the manifests listed in docs; check its live state before assuming a nightly run.

### EN14. Executed-add tracking feeds the monthly allocation
- Why: G6 needs "confirmed execution history" for the one-add-per-ticker-per-month rule; `AllocationPosition.lastAddMonth` is undefined today.
- Steps:
  1. In `src/data/owner-allocation.ts` compute `lastAddMonth` per symbol from `portfolio_trades` (buy trades after the first buy).
  2. Distinguish unknown (no trades table data) from null (confirmed none).
  3. Show in the owner view that history is unknown until trades exist.
- Acceptance: tests for add this month, none, and unknown; `allocate()` blocks a second add in the same month and says why.
- Size: S
- Depends on: EN13
- Who: agent
- Approval needed: none
- Risk or open question: rule "one add a month" is from `tasks-open.md` G6, not from the Guide; owner confirms.

### EN15. Portfolio allocation and concentration analytics
- Why: owner wants allocation views; data exists now (positions with EUR values from Flex, weights in `src/portfolio/model.ts`).
- Steps:
  1. Pure module `src/portfolio/analytics.ts`: weight per position, top 3 and top 5 share, number of names against the Guide's 5 to 15 target (section 10), sector split from `instruments.sector`, tier split from `instruments.tier`, cash share, and a check against the 25 percent per name cap in `SIGNAL_RULES`.
  2. Unit tests with the existing `flex-live.xml` fixture.
- Acceptance: tests cover empty portfolio, one name, cash only, a name above the cap; function is deterministic and uses no clock.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: the 25 percent cap is not in the Guide (C5 mismatch 5); show it labeled as a placeholder.

### EN16. Drawdown, volatility and benchmark statistics from NAV history
- Why: 234 `portfolio_nav_history` rows exist; the site shows only an indexed line and a TWR. Stats are computable now.
- Steps:
  1. In `src/portfolio/history.ts` or a new `src/portfolio/stats.ts`: current and maximum drawdown on the TWR index, daily volatility, best and worst day, and the same figures for SPY bars from `daily_bars` over the same dates.
  2. Excess return against SPY, correlation, and up and down capture over the whole period and over the last 90 days.
  3. Tests with a synthetic series with a known drawdown and a series with a deposit (deposit must not count as return).
- Acceptance: tests pass for a series with a known max drawdown, a deposit and a gap; results shown as percentages only (no EUR), consistent with the page rule.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: SPY is in USD and the NAV in EUR, so the comparison includes currency effect; state that on the page (see EN18).

### EN17. Contribution and unrealized result per position
- Why: owner wants to know what drove the return. Cost basis per position is already read (`costBasisPrice` times quantity, docs/data.md); the baseline stores `costEur` but the judge must never read it.
- Steps:
  1. Add `src/portfolio/contribution.ts`: per position unrealized result in EUR and percent, share of total result, share of portfolio weight; realized result per symbol from trades once EN13 exists (otherwise show unrealized only).
  2. Keep the `costEur` firewall: the function lives outside `judge-input.ts` and a test asserts the judge input still has no cost field.
- Acceptance: tests for gain, loss, closed position, missing cost; a test proves `buildJudgeInput` output does not contain `costEur`.
- Size: M
- Depends on: EN13 (realized part); unrealized part has no dependency
- Who: agent
- Approval needed: none
- Risk or open question: currency of cost basis versus current value; the EUR conversion uses the latest rate, so the result mixes FX effects. Label it.

### EN18. Cash drag and counterfactual
- Why: Guide section 2 says cash rolls over; G6 has a cash-drag note above 3 contributions. The owner needs to see what idle cash cost or saved against holding SPY.
- Steps:
  1. Store one baseline row per day (the job already writes `portfolio_baseline`; confirm it runs daily) so cash history accumulates; today only 3 rows exist.
  2. Compute cash share over time and a money-weighted comparison: the same deposits invested in SPY on their deposit dates (from `portfolio_nav_history.deposits_eur` and `daily_bars` SPY) against actual NAV.
  3. Test with a series with two deposits.
- Acceptance: the function reproduces a hand calculated example; the output says "SPY in USD" unless EN24-style CSPX data exists; page shows percentages.
- Size: M
- Depends on: EN16
- Who: agent
- Approval needed: none
- Risk or open question: until the baseline history grows the cash share series is short; benchmark choice (SPY versus CSPX, the judge's benchmark in `src/db/judge-input.ts`) is an owner decision and CSPX coverage on Twelve Data free is unverified.

### EN19. Fees and tax-lot view
- Why: owner asked for fee and tax-lot views "if data exists". Depends on EN12 showing what Flex returns.
- Steps:
  1. From `portfolio_trades` compute total fees, fee as a percent of traded value, and the fee against the Guide's small EUR 20 to 50 orders (per-order fee burden against `maxFeePercent` 1 in the allocation config).
  2. If lots exist, list open lots with holding period; otherwise list average cost only.
  3. Add a plain note: informational, not tax advice; SK tax treatment is not modeled.
- Acceptance: fee burden function tested on trades of EUR 30 with a EUR 0.35 fee; lots table shown only when lot rows exist; no tax calculation appears.
- Size: S
- Depends on: EN13
- Who: agent
- Approval needed: none
- Risk or open question: tax features can look like advice; keep them private (owner view) and ask the lawyer in G5 before any public use.

### EN20. Private owner portfolio page: analytics wiring
- Why: expose EN15 to EN19 in the flag-gated owner view (`OWNER_VIEW`, `src/app/[locale]/owner-allocation/page.tsx`), EN and SK.
- Steps:
  1. Add sections for allocation, drawdown, contribution, cash drag, fees to the owner page, or a new `src/app/[locale]/owner-portfolio/page.tsx` behind the same flag.
  2. Add EN and SK strings in `src/i18n/`.
  3. Tests: flag off gives 404; flag on renders with fixture data; no EUR amounts on public routes (existing `paywall segments` markers `owner-cash` and `owner-suggestions` reused).
- Acceptance: component and page tests pass in both flag states and both locales; public portfolio page unchanged.
- Size: M
- Depends on: EN15, EN16, EN17, EN18, EN19 (can ship with those that are done)
- Who: agent
- Approval needed: none for code; enabling `OWNER_VIEW` in production is a cluster write
- Risk or open question: web lane may also touch the same page; coordinate file ownership.

### EN21. Retention audit and a long-lived point-in-time store
- Synthesis note: merged into lane DATA: D6 (the per-table retention list from step 1), D14 (score inputs), D15 (consensus history) and D12 (price revisions). Do not build `pit_fields`. Step 4 is overruled by D5 for public SEC filings, which are archived; internal-only text keeps the 30 day rule. EN41 now depends on D28 instead.
- Why: facts, documents, extraction and judge runs expire after 30 days and ideas after 90 (migrations 007, 009, 010), so history needed for replay and tuning is lost. Brief goal: history must accumulate.
- Steps:
  1. List per table what is kept and for how long (read `src/jobs/retention.ts`, retention-ideas, migrations); check `consensus_findings` (1,356 rows from 2026-10-02) and `score_results` retention, which I did not confirm.
  2. Add migration `023_pit_history.sql`: append-only `pit_fields` (symbol, as_of, field, value, agreement, carried_from, evidence urls, rules_version) copied from consensus rows each day, plus `pit_facts_digest` for derived numbers without display-restricted text. Immutable trigger like migration 018.
  3. Write it from `src/jobs/daily.ts` after scoring.
  4. Keep raw documents on the 30 day rule (licence reasons).
- Acceptance: after one daily run, `pit_fields` has one row per symbol and field; update and delete raise the immutable error; retention test confirms the new table is not purged; storage estimate noted in the PR.
- Size: M
- Depends on: none
- Who: agent
- Approval needed: live migration (cluster write)
- Risk or open question: database is 5 Gi on one node with no backup (E1 open); growth must be estimated in the PR (rows per day times 36 symbols).

### EN22. Backfill long price history
- Synthesis note: runs as the `prices` plug-in of the D34 backfill runner, with old values kept by the D12 revision log and the split question answered by D13. It is the same work the risk note below asks one owner for: the data stream owns it.
- Why: replay needs years of bars, but `prices.ts` loads 260 and the table starts 2025-09-22. 99-lessons and STATUS say Twelve Data free is internal use only; a backtest on stored bars is internal, public display is not allowed until licensed.
- Steps:
  1. Add `--backfill-years N` to `src/jobs/prices.ts` (or `scripts/backfill-bars.ts`) paging the Twelve Data time series; keep the 7 requests per minute and daily budget logic.
  2. Handle splits and dividends: store the adjusted flag and the source adjustment mode; mark in `daily_bars` or a side table.
  3. Backfill only the universe plus SPY, in batches over several days within the 800 credits a day.
  4. Tests with `src/data/fixtures/twelvedata-nvda.json`-style fixtures for a paged response and for a split.
- Acceptance: a dry run prints the number of calls needed; after the run each universe ticker has bars from the target start; re-run writes nothing new; tests cover paging and split handling.
- Size: M
- Depends on: D34, D12
- Who: agent
- Approval needed: spend only if the owner wants a larger plan (none for the free key); a cluster Job run is a cluster write
- Risk or open question: maximum rows per call and history depth on the free plan are unverified here; check against Twelve Data docs before coding. The same task may exist in the data lane; assign one owner.

### EN23. Backtest design note with bias controls and honest labels
- Why: a replay on the current 36 hand-picked names is exposed to survivorship and look-ahead bias; Guide tiers name winners (NVDA, AMZN, MSFT). `99-lessons.md` warns against chosen winners and unqualified return claims.
- Steps:
  1. Write `docs/backtest-design.md`: data needed (bars from EN22, point-in-time fundamentals from EN25, macro series history), what is not available (consensus estimates, past news), the label "technical-only replay" versus "partial rule replay".
  2. List controls: use only information dated at or before the signal date; fixed rules frozen before the run (version from EN11); report all signals including losers; include costs (fee model from EN10); compare with SPY and with a random-name baseline over the same dates; report the universe as of today and say so (survivorship); no tuning on the evaluation window (use a split; see EN29).
  3. State what may be shown publicly (owner and lawyer decide): default private.
- Acceptance: document has data needs, bias list, label text in EN and SK, and an explicit statement of what the replay cannot prove; the owner marks the public or private decision.
- Size: S
- Depends on: none
- Who: agent drafts, owner decides
- Approval needed: legal (public display of a replay)
- Risk or open question: Zacks and Danelfin style claims are backtests; regulatory.md says disclaimers do not cure promotional content. Keep private until the lawyer answers.

### EN24. Technical-rule replay engine
- Why: `score.ts` and `technicalIndicators` are pure and can run on any date slice of stored bars.
- Steps:
  1. `src/backtest/replay.ts`: for each date and ticker with at least 200 prior bars, compute technical points (above both MAs, uptrend, green volume, dip) and regime using only bars up to that date; macro and fundamentals set to unknown and reported as such.
  2. CLI `npm run replay -- --from --to --symbols`, writing CSV or JSON to `scanner/out/` style output dir.
  3. Tests: a bar series where the result on day T must not change when later bars are appended (no look-ahead).
- Acceptance: the no-look-ahead test passes; a replay over the stored year produces a row per ticker-date; output includes the label "technical-only".
- Size: M
- Depends on: EN23 (design), EN22 for years of history
- Who: agent
- Approval needed: none
- Risk or open question: the technical part is at most 10 of 25 points, so the 18 threshold cannot be reached by technicals alone; replay must report technical points, not Guide states.

### EN25. Point-in-time fundamentals from SEC filing dates
- Synthesis note: reads point-in-time facts from D18 (`fundamentals_as_of(date)`); the per-CIK cache in step 2 is the D17 raw store.
- Why: revenue acceleration and decline can be replayed because SEC companyfacts carry a filing date; the parser already groups quarters (`src/data/sec.ts`, docs/data.md). Terms: SEC fair access 10 requests per second, checked 2026-10-09.
- Steps:
  1. Extend `src/data/sec.ts` to return, for any `asOf`, the revenue growth using only facts with `filed` at or before `asOf`.
  2. Cache companyfacts per CIK locally for the replay run (no repeated downloads, stay at or below 4 requests per second like the collectors).
  3. Test with `src/data/fixtures/sec-companyfacts.json`: a restated value filed later must not change an earlier `asOf` result.
  4. Wire into the replay as `revenueAccelerating` and `revenueDeclining` only.
- Acceptance: the restatement test passes; replay output marks which fundamentals fields are known (revenue only) and which are unknown (EPS beat, guidance, catalyst, insider).
- Size: M
- Depends on: EN24, D18
- Who: agent
- Approval needed: none
- Risk or open question: companyfacts holds only the latest value for a period in some cases; restated values may leak. The test must check this against real filings for one ticker before trusting it. Foreign filers (ASML, SE) have no 10-Q facts (`sec_filer_status`).

### EN26. Backtest runner: forward returns and honest report
- Why: shows whether signals add value versus SPY, and how often. Needed for rule tuning and for the track-record story.
- Steps:
  1. `src/backtest/run.ts`: take replay signals (state or action by version), compute 1, 5, 20, 60 trading day forward returns and excess versus SPY, using `forwardReturn` logic from `src/track-record/measure.ts` generalised to trading days.
  2. Report: count, hit rate, median and mean excess, worst case, maximum adverse excursion, with all signals and no filtering; add a random-name baseline sampled with a fixed seed.
  3. Write `docs/backtest-report-<date>.md` with the label from EN23 and the sample size next to every figure.
- Acceptance: unit tests on a toy series with known returns; the report lists losers; the random baseline is reproducible with the seed; the report states universe and date range.
- Size: M
- Depends on: EN24, EN25 (fundamental part optional)
- Who: agent
- Approval needed: none
- Risk or open question: with about one year of bars before EN22, sample size is small; report must say "not enough data" below a count the owner sets.

### EN27. Track record windows 1, 5, 20, 60 days
- Synthesis note: trading days come from the D7 trading calendar when it exists; until then from the common bar dates as written.
- Why: `WINDOWS` in `src/track-record/measure.ts` is 30, 90, 180 calendar days; the brief asks for 1, 5, 20 and 60. The page and `docs/paywall-segments.md` name 30/90/180.
- Steps:
  1. Owner decides trading or calendar days, and the benchmark (SPY now).
  2. Change `WINDOWS` to the new set; use trading days via the common bar dates; keep returning null before the exit date is reached.
  3. Update `src/db/track-record.ts`, `src/app/[locale]/track-record/page.tsx`, EN and SK labels, and paywall segment text.
  4. Update `measure.test.ts` for a signal on Friday, a holiday, and a missing bar.
- Acceptance: tests pass for the four windows; page shows pending until the window ends; losers appear with a negative excess; segment doc updated.
- Size: S
- Depends on: none (owner decision first)
- Who: agent
- Approval needed: none
- Risk or open question: 1 day return is noisy and can look like a claim; show it with sample size, or hide it for fewer than a number the owner sets.

### EN28. Outcome materialisation job and loser visibility
- Synthesis note: "early December" in the risk note holds for 60 calendar days (2026-12-05). With 60 trading days, which EN27 proposes, the first 60-day outcomes come around the end of December 2026. The CronJob slot comes from the D40 table.
- Why: the page computes outcomes on demand; automation means a job that stores them so the record is dated and stable. Losers must be visible (`99-lessons.md`, differentiation option 2).
- Steps:
  1. Migration `024_record_outcomes.sql`: `record_outcomes` (signal id, window, exit date, stock return, SPY return, excess, computed_at), insert-once like `record_signals` (immutable trigger).
  2. New job `src/jobs/outcomes.ts` writing outcomes the day each window completes; add a CronJob in the infra repo through the usual GitOps flow.
  3. Track record page reads the table, sorts so the worst outcomes are visible, and shows hit rate with n.
  4. Add the "what is excluded" line: signals from before the immutable log started on 2026-10-06 are not included.
- Acceptance: running the job twice stores each outcome once; a test with one winner and one loser shows both; the page shows n and the excluded-period line.
- Size: M
- Depends on: EN27
- Who: agent; owner for the infra CronJob
- Approval needed: live migration and a new CronJob in infra (cluster write)
- Risk or open question: record starts 2026-10-06, so 60 day outcomes first appear in early December; most of the Q4 record will be small. State the sample size plainly.

### EN29. Rule tuning study (F6 placeholders and score weights)
- Why: C5 and F6 ask whether 18, 15, 12 and the placeholders are right. Tuning without a held-out period overfits.
- Steps:
  1. Use EN26 output; fix a training period and a later test period before any run; write the split in `docs/tuning-protocol.md`.
  2. Run sensitivity for the thresholds (14 to 19), dip band, MA windows and gate values; report effect size with confidence ranges and sample counts.
  3. Recommend changes only when the test period agrees; otherwise keep the Guide values.
- Acceptance: a report with train and test results side by side; no rule changed in code by this task; any proposed change goes to EN2-style owner sign-off.
- Size: M
- Depends on: EN26
- Who: agent; owner decides
- Approval needed: none
- Risk or open question: the Guide is the owner's method; the report may show it neither helps nor hurts on this sample; say so. Not before enough history exists.

### EN30. Verification depth for key fields
- Why: key fields come from one extractor (`agree` rows 0). `verified_single` means a quote was found in stored text (docs/data.md); C5 flagged that this is an engineering policy, not a Guide rule.
- Steps:
  1. List per key field what can decide it: SEC XBRL (revenue fields, Form 4), data_rule (epsBeat from Alpha Vantage), verified_single quote, extractor only. Add this table to `docs/data.md`.
  2. Add an optional second pass in `scanner/run-extract.mjs` for fields that change an action (epsBeat, guidanceRaised, guidanceCut, productCatalyst): a second model call (another model name, since a second agent family is not available in the cluster: Codex judge adapter is not built, C4) on the same bundle; reconcile marks `agree` or `disputed`.
  3. Gate the second pass by `--verify-key-fields` and the daily token ceiling.
  4. Tests in `scanner/test/run-extract.test.mjs` and `src/jobs/reconcile.test.ts` for agree, disputed and one-call fallback.
- Acceptance: with the flag on, a symbol gets two rows; disputed fields become unknown in the score; cost per symbol with and without the flag is measured on 5 symbols and written in the PR (cost today: 105 extraction rows, USD 3.47 total).
- Size: M
- Depends on: EN4
- Who: agent; owner decides policy
- Approval needed: spend (extra subscription usage); model calls on the cluster are a cluster action
- Risk or open question: two calls by the same family may share errors, so `agree` is weaker than two independent sources. Prefer deterministic sources (XBRL, data_rule) where they exist.

### EN31. Extract and judge failure handling
- Why: 3 of 11 judge runs failed on validation (figure not in input "200"; fewer than two evidence links for ADD; Slovak figures differ). The Slovak and English figure check and link count are strict; a failed run stores nothing for all symbols.
- Steps:
  1. Read `judge_runs.error` and `output` for the 3 failed rows to classify the causes (read-only SQL).
  2. In `scanner/run-judge.mjs` retry only the failing symbols with the validator message in the prompt, not the whole batch; store passing symbols from the first call.
  3. For ADD with fewer than two evidence links, let the code downgrade to the existing WATCH path with a reason instead of failing the run, if the owner agrees.
  4. Add a failure reason column or use `error` with codes; list them in `docs/data.md`.
  5. Tests in `scanner/test/run-judge.test.mjs` for partial pass and for per-symbol retry.
- Acceptance: a batch where one symbol fails validation stores the others and retries that symbol once; the three recorded failure messages are reproduced as test fixtures; failed-run counts appear in the AI usage report (`src/db/ai-usage-report.ts`).
- Size: M
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: downgrading an ADD for lack of links changes what the owner sees; keep the reason visible in the card.

### EN32. Judge quota guard and a cost-per-run report
- Synthesis note: PL40 sets the ceiling for extract and judge in infra and depends on this task.
- Why: `AI_DAILY_TOKEN_CEILING` is enforced by extract only (docs/data.md); judge receives it but does not check it. Cost per run is already in `judge_runs` and `extraction_runs`.
- Steps:
  1. Add the same ceiling check as in `scanner/ai-budget.mjs` before the judge call in `scanner/run-judge.mjs` (exit code 5, as for extract).
  2. Extend `src/db/ai-usage-report.ts` with cost per run, per symbol and per week, and failed-run cost (judge failed rows average USD 0.228 in the data read).
  3. Tests for the ceiling and for the report totals.
- Acceptance: a judge run with `AI_DAILY_TOKEN_CEILING=1` makes no model call and exits 5; the report prints weekly totals that match a SQL sum on the fixture.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: subscription usage is not dollars; costs reported by the CLI are notional. Label them so.

### EN33. Figure checks and Slovak text quality
- Synthesis note: the glossary file is shared with W22 and W23, and the native review in step 4 is the same session as W23.
- Why: Slovak output must carry the same figures as English (`scanner/figure-tokens.mjs`); runs failed on this on 2026-10-07. Native review of Slovak copy is also a backlog item (99-lessons, rank 7).
- Steps:
  1. Build a test corpus from the stored `trade_ideas.translations` (43 rows) and failed outputs: decimal commas, ranges, percent signs, dates, "4.81" style numbers.
  2. Extend `figure-tokens.mjs` where tests show misses; add property tests (same figures in EN and SK, normalizer idempotent).
  3. Add a Slovak glossary file `scanner/prompts/glossary-sk.md` (terms like score, setup, pullback, guidance) and reference it in the judge prompt.
  4. Owner or a native speaker reviews 10 stored ideas and marks problems; agent turns them into prompt rules and tests.
- Acceptance: the corpus tests pass; the three recorded failure strings are covered; a review sheet with 10 reviewed ideas exists in the PR.
- Size: M
- Depends on: EN31
- Who: agent; owner or native reviewer for the Slovak sample
- Approval needed: none
- Risk or open question: reviewer availability; machine translation quality cannot be measured by code alone.

### EN34. AI output quality evaluation harness
- Why: prompt, model or rule changes currently have no regression test of the wording. ADR-003 limits the AI to wording; code decides actions.
- Steps:
  1. Create `scanner/eval/` with 10 frozen judge inputs (from EN1 golden data) and the stored outputs that passed validation.
  2. Checks that need no model: schema valid, action and tier unchanged by the output, every figure in the input, at least two links for buys, no advice wording (a lint list of phrases such as "you should buy", ADR-001), English and Slovak figures match.
  3. A script `npm run eval:judge` that runs the checks on a new model output file and on a fresh dry run.
  4. Run it in CI on stored outputs only (no model call).
- Acceptance: the CI step passes on stored outputs and fails when a prompt-injected phrase from the lint list appears in a fixture; documented in `scanner/README.md`.
- Size: M
- Depends on: EN1
- Who: agent
- Approval needed: none for stored-output checks; a fresh model dry run uses subscription tokens
- Risk or open question: lint phrases are a first list; the lawyer's G5 answer should extend it.

### EN35. Make the daily AI flow cheaper and steadier
- Why: extract is gated and skip-hashed; judge runs once a day and skips unchanged signatures. Remaining levers need evidence.
- Steps:
  1. From `extraction_runs` and `judge_runs` build a table of tokens and notional cost per run, per model and per symbol (read-only SQL, saved as `docs/ai-cost-2026Q4.md`).
  2. Use EN34 to test whether a cheaper model gives the same validated output for the judge (judge uses sonnet 5.5; extraction uses haiku). Change only if all checks pass on the frozen inputs.
  3. Trim judge input fields that never appear in output (measure by token share), keeping figure and link coverage.
  4. Log cache read and creation tokens per run in the daily summary.
- Acceptance: a before and after token count on the same frozen input; no check from EN34 regresses; the doc lists measured numbers only.
- Size: S
- Depends on: EN32, EN34
- Who: agent
- Approval needed: none
- Risk or open question: model names and availability change; the cutoff guard (`scanner/anthropic-cutoff.mjs`) must still pass.

### EN36. Discovery pre-screen on MA200 before the cut
Status: done 2026-10-10, PR #86, merged and live.
- Synthesis note: the extra bars calls go through the D8 reserve once it exists, so discovery cannot take the `prices` share.
- Why: discovery ranks about 367 symbols and screens up to 24; six of 12 screened on 2026-10-09 were rejected for being under MA200, which wastes the slots (tasks-open F7).
- Steps:
  1. In `src/jobs/discovery.ts` add a cheap pre-screen stage: for the top K ranked names fetch bars once and drop those under MA200 before the cut to `maxScreenedPerWeek`; reuse the bars for the screen so each name costs one call.
  2. Make K and the stage switch part of `src/jobs/discovery-config.ts`.
  3. Budget calls against the Twelve Data limit (7 per minute, 800 a day per docs/data.md); log calls and skips.
  4. Tests with a fake `barsFor`: a name under MA200 is dropped before the cut; call count stays within the cap.
- Acceptance: tests pass; the run log prints pre-screened, dropped and screened counts; a dry run on stored data shows more names reaching the full screen than before.
- Size: M
- Depends on: none
- Who: agent
- Approval needed: none for code; a one-off Job to prove it is a cluster write
- Risk or open question: K is a trade-off against the daily quota shared with the nightly price job.

### EN37. Discovery: fundamentals in the ranking and a stored weekly record
- Why: ranking uses source score and revenue growth only; EPS and guidance are not inputs. Only passed candidates are stored; reasons for non-passes are only in logs, so history is lost. A weekly page needs stored data.
- Steps:
  1. Migration `025_discovery_screens.sql`: one row per screened name per week (symbol, week, score, state, reason, sources) kept without expiry.
  2. Write it from `screenDiscoveryShortlist` including `notPassed` reasons.
  3. Add ranking inputs from stored facts when present (latest `eps_surprise_latest`, XBRL growth, insider cluster) as additive points in `rankCandidates`, constants in `discovery-config.ts`.
  4. Expose a read function for a future weekly page (web lane builds the page; `docs/paywall-segments.md` lists discovery as a future candidate).
  5. Tests: ranking order with and without facts; rows stored for passes and non-passes.
- Acceptance: after one run the table holds a row for every screened name with a reason; ranking test shows a name with confirmed growth ahead of a filings-only name; no model call is added.
- Size: M
- Depends on: EN36
- Who: agent
- Approval needed: live migration (cluster write)
- Risk or open question: facts exist only for universe names; outside names have XBRL frames data only, so the extra inputs help little for them. State that.

### EN38. Per-earnings thesis note
- Why: F5 left "per-earnings thesis note" open. The filing watch already sees 8-K Item 2.02 and 10-Q (`src/jobs/gate-config.ts`, F1, F2).
- Steps:
  1. Define the note: a short stored text per ticker and quarter: what changed against the last thesis, rule score before and after, any stop-adding trigger from EN9, and a "thesis intact or changed" line decided by code, worded by the judge.
  2. Migration for `thesis_notes` (symbol, quarter, filed_at, signature, text EN and SK, evidence links).
  3. Trigger from `scheduled_gates` when the reason is an earnings filing; a new prompt `scanner/prompts/thesis-note.md` and schema under `scanner/schema/`; reuse the judge validator (figures, links).
  4. Tests for trigger selection and for validation of a stored sample.
- Acceptance: a fixture with a 2.02 filing yields one note; no filing yields no call; the note passes the same figure and link checks as ideas.
- Size: L
- Depends on: EN31, EN33, EN34
- Who: agent
- Approval needed: live migration, a new CronJob or a step in the existing judge flow (cluster write), subscription usage
- Risk or open question: scope is large; may be cut to a template filled from facts (no model) as a first version. Wording is advice-adjacent; keep it descriptive.

### EN39. Semi-annual re-screen, annual rewrite and the stored checklist
- Why: F5 built the 30 day review (Saturday 11:00, six symbols) but not the semi-annual re-screen, the annual rewrite or the stored checklist.
- Steps:
  1. Define the checklist as data in `src/config/review-checklist.json` (questions from the Guide: revenue trend, guidance, narrative, rejection list, sizing position against 5 to 15 names target); owner edits the questions.
  2. Migration `review_checklists` storing answers per symbol and review type, with date and the facts referenced.
  3. Extend the review calendar in `scanner/run-extract.mjs` (`--review-calendar`) and its config with review types: 30 day, semi-annual (re-screen all names against rejection rules), annual (rewrite the thesis text for each held name).
  4. Tests for date selection (a name reviewed 31 days ago is picked, one reviewed 29 is not) and for checklist storage.
- Acceptance: unit tests for the three cadences; one dry run prints which names each review would pick; the company page shows the next review of each type.
- Size: M
- Depends on: EN38
- Who: agent; owner writes the checklist questions
- Approval needed: live migration, CronJob schedule change in infra
- Risk or open question: the annual rewrite is partly the owner's own judgment; code can prepare facts only.

### EN40. Macro rules: thresholds and the Guide's data tailwind
- Synthesis note: the Why below is wrong about collection: the `bls` and `fed` sources have code but no CronJob runs them, and live `source_documents` on 2026-10-09 held only edgar, alphavantage, fred and cboe rows (lane DATA). The CPI, PPI and FOMC rules need those collectors scheduled (D40 slot) or series stored by D24.
- Why: D1b is open. Today every ticker scores 2 of 5 macro points (rotation true, tailwind false) and the 10 year yield test binds. The Guide's tailwind is "rates, CPI, PPI, FOMC" (section 6.3) but `src/data/macro-rules.ts` uses only the 10 year yield change and VIX. BLS series and FOMC dates are already collected (`bls`, `fed`).
- Steps:
  1. Owner chooses thresholds (yield change, VIX, rotation margin) and whether one missing input leaves the flag unknown.
  2. Add CPI and PPI direction and FOMC proximity rules from stored facts, each as separate named flags in `macro-rules.ts`, with the tailwind as a documented combination.
  3. Evaluate the options on EN22 history with EN24 replay: share of days the tailwind is true under each setting, to avoid a flag that is always on or always off.
  4. Update `docs/data.md` macro table and tests in `macro-rules.test.ts`.
- Acceptance: tests for each rule and for missing inputs; a table of true share per day for each setting on stored history; owner decision recorded; env variables `MACRO_*` unchanged in meaning.
- Size: M
- Depends on: EN11 (config), EN22 for the history part, D24
- Who: agent; owner decides
- Approval needed: none
- Risk or open question: display terms for FRED and Cboe data are unchecked, so only the derived flag is shown (existing rule).

### EN41. EPS consensus source decision and Alpha Vantage activation
- Synthesis note: the Why below is out of date. Read on 2026-10-09 by the synthesis: `ALPHA_VANTAGE_API_KEY` is a key in `invest-buddy-source-keys`, and `invest-buddy-collect-alphavantage` has `suspend: false` (no run yet; first schedule Saturday 2026-10-10 08:00). Step 2 is therefore done apart from checking the first run. Step 3 is D28 (`eps_history`).
- Why: D2: no verified free consensus source; `epsBeat` has a data_rule from Alpha Vantage, but the key is not in the secret and the CronJob is suspended (tasks-open D2). Finnhub free is personal use only (terms read 2026-10-09). Alpha Vantage and FMP display terms are unverified; `research/data-providers.md` says commercial use needs sales contact for AV and a separate licence for FMP display.
- Steps:
  1. Write a one page decision with the options: (a) activate Alpha Vantage free for internal scoring and show only the yes or no, (b) leave `epsBeat` unknown, (c) pay for a licensed source after the waitlist (owner's step 5), with terms status per option.
  2. If (a): owner puts `ALPHA_VANTAGE_API_KEY` into `invest-buddy-source-keys` and unsuspends `invest-buddy-collect-alphavantage` through infra.
  3. Add a derived `eps_surprise` history to the long-lived store from EN21 so surprise values accumulate (raw payload expires in 30 days).
  4. Record the terms status with URL and date in `docs/data.md`.
- Acceptance: decision recorded; if (a), after the Saturday run `collected_facts` has `eps_surprise_latest` for at least 20 symbols (the source sends at most 20 per run) and `epsBeat` rows appear with `data_rule`; the page still shows only yes or no.
- Size: S
- Depends on: D28 (for the history part)
- Who: owner then agent
- Approval needed: new secret, third-party signup (key), cluster write (unsuspend); display terms written confirmation (legal)
- Risk or open question: 25 requests a day on the free key limits coverage to the 36 names across two days; the weekly job covers 20 per run.

### EN42. 424B5 filings and clinical readouts as inputs
- Synthesis note: the `clinicaltrials` and `openfda` sources are not collected on a schedule (no CronJob), so step 2's supporting context needs them scheduled first or is dropped. D19 archives the 424B5 text this task starts storing.
- Why: F11 and `docs/comparison-log.md`: PCVX 2026-10-05 card used a Phase 3 readout and a 424B5 financing; the catalyst prompt does not count clinical readouts and 424B5 is seen by the watch step but not stored (docs/f8-old-vs-new-scans.md).
- Steps:
  1. Store 424B5 (and S-3 / 8-K financing exhibits) as `source_documents` in `src/collectors/edgar.ts`, with `display_allowed: true` (public SEC data, same as other EDGAR documents), a freshness window in `src/data/evidence.ts`, and the same 4 requests per second limit.
  2. Add a catalyst definition for clinical readouts to `scanner/prompts/ticker-extract.md`, restricted to the company's own 8-K and press exhibit text; use the stored `clinicaltrials` and `openfda` documents as supporting context only (their terms are unverified, so no display).
  3. Add a new fact `financing_event` (date, form) from `filing_watch` rows.
  4. Tests with a PCVX-shaped fixture: the readout text reaches the bundle, the quote check passes, and a 424B5 is stored.
- Acceptance: a fixture-based test shows `productCatalyst` true with a verified quote for a readout sentence; 424B5 rows appear in `source_documents` for PCVX on the next collect; no change to the score tables.
- Size: M
- Depends on: none
- Who: agent
- Approval needed: none for code; live collect run is the normal schedule
- Risk or open question: adding "readouts" widens the catalyst definition for all names and changes scores; version-bump it (EN11) and check golden diff. Guide section 4.1 C lists catalysts but not trial results, so owner confirms.

### EN43. Pre-revenue profile (decision first)
- Why: pre-revenue names (PCVX) cannot reach a high score: revenue acceleration is worth 4 and `noRevenue` rejects (`score.ts`). The comparison log lists this as open question B.
- Steps:
  1. Owner decides whether such names are in scope for the screen at all, or only for the owner's own watch.
  2. If yes: a separate profile `src/engine/profile-prerevenue.ts` with its own points (cash runway from XBRL, financing events from EN42, clinical milestones, insider activity) and its own label so it is never mixed with Guide scores; same pure-function and golden test rules.
  3. Keep `score.ts` unchanged for the Guide profile.
- Acceptance: decision recorded in ADR-006; if built, tests for a pre-revenue fixture; the dashboard marks the profile and never shows a Guide score for it.
- Size: L
- Depends on: EN42, EN2
- Who: owner then agent
- Approval needed: none
- Risk or open question: it moves away from "the Guide is the method"; the owner may prefer to keep the product strictly on the Guide.

### EN44. Old-versus-new comparison, F8 to F10
- Synthesis note: add EFXT and WULF with `scripts/universe-change.ts` from D11 if it is merged by then, so the membership history records them.
- Why: F8 offline part is done (`docs/f8-old-vs-new-scans.md`); EFXT and WULF are not in `instruments`, PCVX has an old card in the log but the brief and the log disagree on START or WATCH. The planned comparison week is 2026-10-12 (STATUS.md).
- Steps:
  1. Owner supplies the old EFXT, PCVX and WULF cards (F9): action, band, ratings, triggers, cited filings, and old token cost if known.
  2. Add EFXT and WULF to `instruments` as discovery names (source `discovery`), collect, extract and judge.
  3. Fill the old versus new table with action, size, ratings, triggers, tokens and notional cost; list gaps as new tasks.
  4. Repeat after EN42 for PCVX.
- Acceptance: the table in `docs/f8-old-vs-new-scans.md` has real numbers for all three names; each gap becomes a task ID; the old card text is stored in `docs/comparison-log.md` with its source.
- Size: S
- Depends on: EN42 for the PCVX re-check; the rest has no dependency
- Who: owner supplies cards, agent runs
- Approval needed: cluster write (insert into `instruments`, one-off Jobs) and subscription usage
- Risk or open question: EFXT and WULF may fail SEC or Twelve Data lookups (WULF is in `discovery-themes.json`, EFXT is not); the old cards may not exist anywhere.

## Changes by the synthesis

- Header: added the synthesis line (working copy, migration numbers are placeholders).
- Ordering note: the week plan in `docs/roadmap/README.md` sets the order.
- Source terms: ClinicalTrials row corrected (no CronJob collects it; no such rows live on 2026-10-09); Alpha Vantage row notes lane DATA's EULA reading; "task D1b" is tasks-open D1b.
- Owner decision 1 and EN2: "D1 to D6" are C5 report decisions, not lane DATA tasks.
- EN1: owns `src/engine/golden.test.ts`; PL10 no longer writes a second golden test.
- EN3: PR #80 implemented the separate thresholds. PR #107 corrects the explanation and golden reasons; EN2 owner sign-off is still open.
- EN11: its hash test is the single rules-version guard.
- EN13: the risk note about a suspended portfolio CronJob is wrong; it runs (manifest and live).
- EN21: merged into D6, D12, D14 and D15; `pit_fields` is not built; step 4 overruled by D5 for public filings.
- EN22: runs as the `prices` plug-in of D34 with D12 and D13; dependency line now D34, D12; owned by the data stream.
- EN25: reads D18; dependency D18 added.
- EN27: trading days from D7 when it exists.
- EN28: corrected the date of the first 60-day outcomes (early December only with calendar days; around the end of December with trading days).
- EN32: PL40 depends on it.
- EN33: shares the glossary file and the review session with W22 and W23.
- EN36: uses the D8 reserve.
- EN40: the Why was wrong (`bls` and `fed` are not collected); dependency D24 added.
- EN41: the Why was out of date (key present, CronJob not suspended); step 3 is D28; dependency changed from EN21 to D28.
- EN42: `clinicaltrials` and `openfda` are not collected on a schedule; D19 archives the 424B5 text.
- EN44: uses the D11 script when merged.
