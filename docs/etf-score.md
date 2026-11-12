# ETF rating

Rules version `etf-v2-2026-11-12` uses the stored `etf_scores` table and daily score job. The rating is an informational screen of fund facts, separate from weekly pick labels. It has 35 possible points. The displayed percentage is points earned divided by points with evidence. A TER and evidence in at least one other group beyond domicile or wrapper alone are required. Each result shows how many of the four groups have data and which of TER, AUM, trading volume, age, structure, wrapper and price history are missing.

| Group | Rule | Points |
| --- | --- | --- |
| Cost | TER ≤0.10%, ≤0.20%, ≤0.30%, ≤0.50%, ≤0.75%, or higher | 10, 8, 6, 4, 2, 0 |
| Size | AUM in EUR ≥1bn, ≥500m, ≥100m, ≥50m, or lower | 6, 5, 3, 1, 0 |
| Size | Median daily close × volume over 20 recent bars, in EUR: ≥1m, ≥100k, or lower | 4, 2, 0 |
| Structure | Full physical, sampled or fund-of-funds, synthetic, or option/leverage overlay replication | 3, 2, 1, 0 |
| Structure | Issuer-confirmed UCITS status | 3 if confirmed, 0 if confirmed false |
| Structure | Age ≥5, ≥3, ≥1 years, or younger | 3, 2, 1, 0 |
| Structure | Irish domicile if US equity exposure is over 50%; otherwise domicile present | 1 |
| Trend | Close more than 2% above the 200-day simple moving average | 2 |
| Trend | 50-day simple moving average above the 200-day average | 1 |
| Trend | Price return from roughly 12 months ago to one month ago above zero | 1 |
| Trend | Equity fund's one-year maximum drawdown better than −20% | 1 |

Zero TER, AUM or trading volume is a data gap. The latest valid price bar must be no more than seven days old. Trend requires 200 bars; the return and drawdown rules require 252. The score uses fund statistics dated on or before the score date. It uses catalog TER when a dated fund charge is absent. Catalog replication is free text and is labelled as stored catalog text, not issuer-confirmed. Catalog AUM in USD millions can stand in for fund statistics with unknown asset currency only on US venue USD listings, using the stored EUR/USD close from the previous seven days. Other ambiguous asset currencies remain gaps.

ETNs, ETCs, leveraged or inverse funds, and options overlays are out of scope. Known TER above 1.50%, AUM below EUR 20m, age below one year or median daily trading value below EUR 100k fails a rule. A close below both moving averages marks a broken trend. An AUM below EUR 50m adds a caution label if no stronger state applies. Out-of-scope, failed, broken-trend and insufficient-data results hide the percentage. Catalog `isin_mismatch` and `not_etf` detail statuses and listings unseen for more than 30 days also fail a rule. Top-ten holdings weight, country and sector weights, and holdings count remain unscored facts. The concentration flag turns on above 50% in the top ten or 70% in one country.

The bands and point weights are product rules. Sources for the criteria include [justETF's selection guide](https://www.justetf.com/en-de/academy/make-the-right-etf-selection.html) and [ETF selection criteria](https://www.justetf.com/en/academy/die-richtige-etf-auswahl.html), Morningstar on [ETF closures](https://www.morningstar.com/funds/etfs-2023-tale-success-failure) and [why funds close](https://www.morningstar.com/funds/why-funds-die), State Street on [ETF evaluation](https://www.ssga.com/us/en/individual/insights/how-to-evaluate-etfs-6-things-that-matter-most) and [US ETFs versus Irish UCITS](https://www.ssga.com/us/en/institutional/insights/considerations-for-non-us-investors-us-etfs-vs-irish-ucits), [WisdomTree on trading volume and liquidity](https://www.wisdomtree.com/gb/insights/blog/dispelling-the-myth-etf-trading-volume-does-not-equal-etf-liquidity), and [ESMA's ETF guidelines](https://www.esma.europa.eu/sites/default/files/library/2015/11/2012-44_0.pdf). The trend rule draws on the InvestingGuide moving-average rule and Meb Faber, “A Quantitative Approach to Tactical Asset Allocation,” *The Journal of Wealth Management* (2007), [author note](https://mebfaber.com/2007/02/10/published-errrsort-of/) and [trend commentary](https://alphaarchitect.com/2014/09/are-uber-simple-asset-allocation-systems-robust/). None of these sources sets the exact points in this screen.

The score job records processed, rated and failed counts in `job_runs`. Each listing upsert is idempotent, and a failed listing does not stop the rest. The job removes score rows older than 400 days. `deploy/gitops/gitops/apps/invest-buddy/base/etf-score-cronjob.yaml` remains suspended; enabling it is a separate deployment decision. Migration 138 is additive and stays in place. Display of market-data-derived scores follows the existing vendor-data access gate.
