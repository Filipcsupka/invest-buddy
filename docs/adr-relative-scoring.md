# ADR: relative scoring (EN45)

Date: 2026-10-11. Score rules version `2026-10-11.1`, signal rules version `2026-10-11.1`. The point table and the Guide thresholds (InvestingGuide s6 and s8) stay. ADR-001 still applies: the result is informational screening.

## Context

On 2026-10-09 the best of the 36 live tickers had 17 points, so nobody could reach the 18-point step. Part of the gap was missing data. Catalyst had no data for 34 tickers and revenue acceleration had none for 13. The old rule treated a rule without data like a rule that failed.

## Decision

A ticker's points are measured against the points that have evidence.

- `evidencedMax` is 25 minus the points of every rule whose data is unknown. A rule with no data is left out. A rule with data that is not met still counts as 0 of its points. A matched rule always counts as evidence.
- `percent` is `total / evidencedMax`.
- States: Setup at 72% or more, Watch at 60%, Wait at 48%, otherwise Ignore. On a fully evidenced ticker these are the Guide's 18, 15 and 12 of 25. The comparison uses whole numbers (`total * 100 >= 72 * evidencedMax`), so 18 of 25 is exactly 72%.
- Coverage guard: when `evidencedMax` is under 20 (80% of 25), the best state is Watch and the result is flagged `incompleteData`.
- Rejection rules and invalid data work as before.
- The raw points, the part scores and the stored state strings stay as they were. The audit also stores `evidencedMax`, `percent`, `coverage` and `incompleteData`.
- Signals use the same shares for the add check (15 of 25) and the start and conviction checks (18 of 25). A start or conviction also needs 20 evidenced points. A signal input without `evidencedMax` counts all 25 points.

The rule lives in `src/engine/relative.ts`. `score.ts`, `status.ts` and `signals.ts` use it.

## Impact on stored data

`src/engine/replay.test.ts` applies both rules to the stored audits from 2026-10-02 to 2026-10-09. On 2026-10-09 the counts move from 0 to 4 in Setup (AMD, DDOG, NVDA and SNOW, each 17 of 23), 8 to 6 in Watch, 6 to 10 in Wait and 16 to 10 in Ignore. Criteria broken stays at 6. Ten scored tickers are flagged incomplete data.

## Risks

- A rule with no data counts as neutral, which raises false positives: a ticker that is missing the hardest rules can look better than one with full data. The coverage guard keeps tickers with less than 20 evidenced points out of the top step. The stored history keeps `percent` and `coverage` for each day, so the track record can compare outcomes by coverage.
- The guard caps only the top step. A ticker with only the 10 technical points evidenced reaches Watch at 6 of 10. On 2026-10-02, when the macro rules had no data either, 17 tickers moved from Ignore to Watch this way. If that is too loose, the guard can be raised or extended to Watch.
- The stored state `Setup met (>=18)` and the label `Setup met ≥18` are kept so older audits, alerts and the track record still parse. The step now means 72% of the evidenced points.
- Signal inputs built in `src/db/judge-input.ts` do not pass `evidencedMax` yet, so signals still count all 25 points until that wiring lands.
