# Horizon rules

Version `2026-10-17.1`. A descriptive profile per ticker: sustained growth, event-driven, mixed or no data. It is not read by the score, the status or the display percentage, and profit or loss is never an input. Thresholds are placeholders for owner review. Public output stays informational (ADR-001); the labels appear only in the private owner view.

Code: `src/engine/horizon.ts` (profile), `src/engine/exit-facts.ts` (review facts), `scripts/horizon-report.ts` (`npm run horizon:report`, reads the database, writes `labels.csv` and `review.md`).

## Profile
- Sustained growth: YoY at least 15% in each of the last 4 quarters, market cap at least 20B USD, 20-day average dollar volume at least 100M USD, ATR% (14) at most 4, no company flag.
- Event-driven: market cap under 5B USD, ATR% at least 5, or any flag. Below 20B USD a recent spike also counts: a latest-quarter YoY at least 2x the median of the prior quarters, a 5-session move of 15% or more, or volume at least 2.5x the 20-session mean. A large steady grower keeps its label through a transient event.
- Mixed: neither. No data: fewer than 60 bars, fewer than 4 growth quarters, or no market cap.

## Exit facts (owner decision 2026-10-17)
Review facts, never a sell signal, not read by the score. `exitFacts()` returns: the trailing level (highest close of the last 50 sessions minus 3 x ATR(22)) and whether the close is below it; whether the close is under the 50-day average on at least 2x the 20-session mean volume; with a cost basis, the gain from cost and whether it reached the +25% review mark. No stop-loss rule. Public wording is a neutral statement of the fact.

## First report (live data 2026-10-17, 36 names)
Sustained 5 (AMZN, AVGO, CRM, MELI, NVDA), event-driven 11, mixed 7, no data 13. The report treated revenue tags separately and had no stored share counts for GOOGL or META. Interest cover and short interest are not loaded in the report, so those flags read no data.

## Collector check (2026-10-18)

The report now combines quarterly revenue across the allowed SEC tags. The collector also stores `CommonStockSharesOutstanding` when the SEC provides it. On the same 2026-10-17 data date, after the approved 36-name collection, the report has 4 sustained, 12 event-driven, 11 mixed and 9 no data. GOOGL, AFRM, PLTR and ROKU moved out of no data. META remains there because its SEC companyfacts response contains no undimensioned share count for market cap. The profile rules did not change. See `docs/collectors-fixes.md` for collection counts.

## Stored labels (TASK-100)

Migration 087 stores immutable daily observations in `horizon_labels`. Each row records the profile, observed result, input numbers, reasons, rule version and pending change. A different observed profile must persist for 10 distinct price sessions before the stored profile changes. A new filing can change it immediately. Same-day reruns leave the existing row intact.

Owner overrides are new dated rows with a reason. The private `/en/owner/horizons` and `/sk/owner/horizons` pages require `OWNER_VIEW` and the owner research credential. They show the latest stored numbers and any override. The CronJob proposal is suspended pending owner review of the placeholder thresholds.

## Public profiles (TASK-101)

The dashboard lists sustained and event-driven names from the latest computed `horizon_labels` observation for each ticker. The scanner offers the same two filters. The company page shows the observed profile and stored input values beside Flags. Owner overrides remain visible only in the owner view. Empty tables show "Profiles not computed yet"; public pages do not calculate a profile during a request. Both lists are available to free viewers. Newly computed rows include drawdown from the most recent 20 sessions. Older rows show "No data" for that field.
