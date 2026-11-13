# Index market-condition rating

Rules version `index-v1-2026-11-13`, code in `src/markets/index-rating.ts`. The rating summarizes measured conditions of an equity index on its as-of date. It is informational screening under ADR-001. It is not a forecast, a stock rating or a personal instruction, and the thresholds below have not been validated against later returns.

The function is pure. It takes daily closes and member-level aggregates, and it reads no database, clock or network. The same inputs always give the same result.

## Score

Six factors share 100 points. Each factor is either assessed or not assessed; a factor without enough data is never counted as zero.

| Factor | Points | Rule |
| --- | ---: | --- |
| Trend | 25 | Close above the 50-day average (6), close above the 200-day average (6), 50-day above 200-day average (6), 50-day average higher than 50 sessions earlier (7). Needs 200 bars. |
| Breadth | 20 | Share of members above their 50-day and above their 200-day average. Each earns 0 at 20% or less and 10 at 80% or more, linear in between. |
| Valuation | 15 | Valuation against the index's own five-year history. Not assessed until valuation history is stored. |
| Earnings momentum | 15 | Share of members with positive year-on-year growth (10) and with accelerating growth (5). Each earns 0 at 0%, half at 50% and full at 80% or more, linear in between. |
| Volatility and drawdown | 15 | 10 × (1 − percentile) of today's 20-session annualized realized volatility among the prior rolling values, up to three years. Drawdown from the 252-session closing high: under 5% earns 5, 5–10% earns 3, over 10% earns 0. Needs 273 bars. |
| Stock-score distribution | 10 | 5, plus up to 5 for the Setup met share (full at 20%), minus up to 5 for the Criteria broken share (full at 50%). Kept between 0 and 10. |

The score is points earned divided by the points of assessed factors, times 100, rounded to a whole number. Coverage is the assessed points as a percent of 100.

A score is shown only when Trend is assessed, at least two other factors are assessed, and coverage is at least 60%. Otherwise the result is "not enough data", with the reasons listed and every factor still reported. With bars alone, Trend and Volatility give 40% coverage, so an index needs member data before it gets a score.

## Bands

| Score | Band |
| ---: | --- |
| 80–100 | Broad strength |
| 65–79 | Constructive |
| 45–64 | Mixed |
| 25–44 | Weakening |
| 0–24 | Broad weakness |

The band names describe current measured conditions.

## Data rules

- Bars dated after the as-of date are ignored. Bars with a missing or non-positive close are dropped, and a repeated date keeps the last entry.
- The newest bar must be at most 7 calendar days before the as-of date. Older bars leave Trend and Volatility not assessed.
- Breadth, Earnings momentum and Stock-score distribution need data for at least 70% of members. Percent inputs must be between 0 and 100; anything else marks the factor as invalid data.
- The share of members matched to our instruments is reported separately when known. It does not change the score.
- Member inputs carry no dates of their own, so those factors use the as-of date.

## Output

Each result has the score, band, coverage, assessed weight, points earned, the reasons a score was suppressed and the matched-member share. Each factor reports points, maximum, a headline value, the rule text, the evidence date, note codes and the measured inputs behind the points.

| Factor | Headline value |
| --- | --- |
| Trend | Number of the four conditions met |
| Breadth | Mean of the two member shares |
| Valuation | None |
| Earnings momentum | Share with positive growth |
| Volatility and drawdown | Annualized realized volatility, percent |
| Stock-score distribution | Setup met share minus Criteria broken share |

Note codes: `no-bars`, `stale-bars`, `insufficient-bars`, `no-data`, `invalid-data`, `coverage-below-minimum`, `no-valuation-history`, `volatility-index`. Suppression codes: `trend-not-assessed`, `too-few-factors`, `assessed-weight-below-minimum`, `volatility-index`.

## Volatility indices

A volatility index such as VIX gets no score and no band. It gets a regime label from where its latest close sits among up to three years of prior closes: below the 25th percentile Low, 25th to 75th Normal, 75th to 90th Elevated, 90th and above High. The label needs 252 prior closes and the same 7-day freshness rule.

## Display

Pages show the rating only through the existing vendor-data gate (`marketsViewable` / `canUseVendorData`). Rendered text names no data vendor. Each display carries the as-of date, coverage and the informational disclaimer.
