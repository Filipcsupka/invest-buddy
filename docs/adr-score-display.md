# ADR: core percentage and bonus findings

Date: 2026-10-11. Public scores are informational screening under ADR-001.

## Decision

The public percentage uses core rules whose source data is already collected at least quarterly. For each ticker, it divides the points earned from core rules by the available points from core rules with data. A core rule with no data is left out of that division; the screen says how many of the nine core rules have data. Meeting every evidenced core rule gives 100%. The display uses the existing 72%, 60% and 48% band thresholds. When less than 80% of the 23 core points have data, the displayed band is capped at Watch. A rejection rule still shows Criteria broken, and invalid inputs show no score.

The catalyst rule uses event driven evidence. It appears in a separate bonus block, with its own met, not met or no data state. Its two points do not change the public percentage or displayed band. The other confirmations remain context and do not add points to this display.

| Rule id | Weight | Source | Refresh cadence | Class |
| --- | ---: | --- | --- | --- |
| `revenue-acceleration` | 4 | SEC companyfacts quarterly revenue | Quarterly | Core |
| `earnings` | 3 | SEC earnings filings, reconciled EPS and guidance facts | Quarterly | Core |
| `catalyst` | 2 | Curated 8-K and release text findings | Event driven | Bonus |
| `accumulation` | 1 | Daily price volume and SEC Form 4 transactions | Daily | Core |
| `above-ma` | 3 | Daily price bars | Daily | Core |
| `uptrend` | 3 | Daily price bars | Daily | Core |
| `green-volume` | 2 | Daily price and volume bars | Daily | Core |
| `dip` | 2 | Daily price bars | Daily | Core |
| `rotation` | 2 | Daily prices across the screening universe | Daily | Core |
| `macro-data` | 3 | FRED, Treasury and VIX observations | Daily to monthly | Core |

The accumulation rule can be met from daily volume or Form 4 data. Occasional 13F holdings are separate research context and are not a scored rule. Verified AI research supplies facts from filings and releases for human-readable evidence. AI output itself awards no points.

## Compatibility

The engine retains its ten rule weights, 25-point total, stored audits, state strings, signal logic and history. `score()` output stays backward compatible. Existing rows are not migrated or rescored. The percentage and band in this ADR are calculated when a public page renders, so an old stored band may differ from its current public display. Historical audit and score history remain as recorded. Public tables omit the raw 25-point total and the old `N/25` data column to avoid presenting a second score.
