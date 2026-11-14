# Index market-condition rating

Rules version `index-v1-2026-11-13`, code in `src/markets/index-rating.ts`. The rating summarizes measured conditions of an equity index on its as-of date. It is informational screening under ADR-001. It is not a forecast, a stock rating or a personal instruction, and the thresholds below have not been validated against later returns.

The function is pure. It takes daily closes and member-level aggregates, and it reads no database, clock or network. The same inputs always give the same result.

## Score

Six factors share 100 points. Each factor is either assessed or not assessed; a factor without enough data is never counted as zero.

| Factor | Points | Rule |
| --- | ---: | --- |
| Trend | 25 | Close above the 50-day average (6), close above the 200-day average (6), 50-day above 200-day average (6), 50-day average higher than 50 sessions earlier (7). One condition earns 0; two earn 12; three or four earn the sum of their points. Needs 200 dense bars. |
| Breadth | 20 | Share of members above their 50-day and above their 200-day average. Each earns 0 at 20% or less and 10 at 80% or more, linear in between. |
| Valuation | 15 | Valuation against the index's own five-year history. Not assessed until valuation history is stored. |
| Earnings momentum | 15 | Share of members with positive year-on-year growth (10) and with accelerating growth (5). Each earns 0 at 0%, half at 50% and full at 80% or more, linear in between. |
| Volatility and drawdown | 15 | 10 × (1 − percentile) of today's 20-session annualized realized volatility among the prior rolling values, up to three years. Drawdown from the 252-session closing high: under 5% earns 5, 5–10% earns 3, over 10% earns 0. Needs 273 dense bars. |
| Stock-score distribution | 10 | 5, plus up to 5 for the Setup met share (full at 20%), minus up to 5 for the Criteria broken share (full at 50%). Kept between 0 and 10. |

The score is points earned divided by the points of the factors it uses, times 100, rounded to a whole number. Coverage is the points of those factors as a percent of 100.

Every score carries a basis flag:

| Basis | When | Factors used | Label (EN / SK) |
| --- | --- | --- | --- |
| Full | Trend, at least two other factors, and at least 60 of the 100 points assessed | All assessed factors | Price and member data / Cena a údaje o členoch |
| Price-based only | The full condition is not met, but Trend and Volatility and drawdown are assessed | Trend and Volatility and drawdown, 40 points | Price-based only / Iba podľa ceny |

Most indices have no member data with enough coverage yet, so they get a price-based score with 40% coverage. A member factor that is assessed but does not reach the full condition is still reported; it carries the note `not-in-composite` and does not change the price-based score. The result also holds a one-sentence description of the basis in both languages for pages to show next to the band.

There is no score when Trend is not assessed, or when Volatility and drawdown is not assessed and the full condition is not met. The result is then "not enough data", with the reasons listed and every factor still reported.

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

- The as-of date must be a valid `YYYY-MM-DD` calendar date. Invalid bar dates and bars after the as-of date are ignored. Bars with a missing or non-positive close are dropped, and a repeated date keeps the last entry.
- The newest bar must be at most 7 calendar days before the as-of date. Older bars leave Trend and Volatility not assessed.
- Bar-based factors use the latest dense run. A gap over 7 calendar days ends that run. Its full span and each 20-bar span must be at most 1.5 calendar days per session interval plus 7 days, allowing weekends and holidays. A sparse run with fewer than the required bars leaves the factor not assessed; volatility is then not annualized from spaced observations.
- Breadth, Earnings momentum and Stock-score distribution each need an explicit source date no later than the as-of date and at most 7 calendar days old. Undated, future-dated, invalid or stale aggregates are not assessed. They also need data for at least 70% of members. Percent inputs must be between 0 and 100; anything else marks the factor as invalid data.
- The share of members matched to our instruments is reported separately when known. It does not change the score.
- Member factor evidence uses the aggregate's source date.

## Output

Each result has the score, band, basis and its EN/SK text, coverage, assessed weight, points earned, the reasons a score was suppressed and the matched-member share. Each factor reports points, maximum, a headline value, the rule text, the evidence date, note codes and the measured inputs behind the points.

| Factor | Headline value |
| --- | --- |
| Trend | Number of the four conditions met |
| Breadth | Mean of the two member shares |
| Valuation | None |
| Earnings momentum | Share with positive growth |
| Volatility and drawdown | Annualized realized volatility, percent |
| Stock-score distribution | Setup met share minus Criteria broken share |

Note codes: `no-bars`, `stale-bars`, `sparse-bars`, `insufficient-bars`, `no-data`, `undated-data`, `stale-data`, `invalid-data`, `coverage-below-minimum`, `no-valuation-history`, `volatility-index`, `not-in-composite`. Suppression codes: `trend-not-assessed`, `volatility-not-assessed`, `volatility-index`.

## Volatility indices

A volatility index such as VIX gets no score and no band. It gets a regime label from where its latest close sits among up to three years of prior closes: below the 25th percentile Low, 25th to 75th Normal, 75th to 90th Elevated, 90th and above High. The label needs 252 prior closes from the latest dense run and the same 7-day freshness rule.

## Display

Pages show the rating only through the existing vendor-data gate (`marketsViewable` / `canUseVendorData`). Rendered text names no data vendor. Each display carries the as-of date, coverage, the basis label and the informational disclaimer.
