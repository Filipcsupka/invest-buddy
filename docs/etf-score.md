# ETF rating

Version `etf-v3-2026-11-13` screens ETF listings against eight published rule groups. It is informational and uses the same rules for every listing. The percentage is earned points divided by points backed by data. An accumulating fund has no income group; its missing income points do not reduce the percentage.

| Group | Points | Rules |
| --- | ---: | --- |
| Cost | 20 | Absolute TER (12); TER percentile among at least five category peers, or asset-class and region peers (8) |
| Size and age | 12 | EUR AUM (8); years since inception (4) |
| Liquidity | 12 | Median 20-day traded value in EUR (8); median daily high-to-low range as a proxy, not a spread (4) |
| Structure | 10 | Replication (4); catalog UCITS hint or domicile fallback (3); domicile with US equity exposure (2); named index (1) |
| Diversification | 14 | Holdings count (4); top-ten weight (4); largest sector (3); largest country or region (3) |
| Trend | 12 | Close above 200-day average by 2% (3); 50-day above 200-day average (2); 12-to-1-month return (3); six-month return versus an index proxy for equity funds (4) |
| Risk | 12 | One-year volatility (4); three-year Sharpe (4); three-year maximum drawdown (4) |
| Income, distributing funds only | 8 | Yield (4); four payments in the past year or a stated monthly or quarterly frequency (4) |

Absolute TER earns 12/10/8/5/2/0 at ≤0.10/0.20/0.30/0.50/0.75/>0.75%. Peer rank earns 8/5/2/0 at ≤25/50/75/>75 percentile. AUM earns 8/6/4/3/1/0 at ≥EUR 1bn/500m/250m/100m/50m/below. Age earns 4/3/1/0 at ≥5/3/1/below one year. Traded value earns 8/6/4/2/0 at ≥EUR 5m/1m/250k/100k/below. Daily range earns 4/2/0 at ≤0.5/1/>1%.

Holdings count earns 4/3/2/0 at ≥100/50/20/below, unless the count equals a list of ten or fewer holdings; that is a data gap. Top-ten weight earns 4/3/2/0 at ≤20/35/50/>50%. Largest sector earns 3/2/0 at ≤30/50/>50%. Largest country or region earns 3/2/0 at ≤60/80/>80%. Equity volatility earns 4/3/1/0 at ≤15/20/25/>25%; bond volatility uses ≤5/8/12/>12%. Sharpe earns 4/3/1/0 at ≥1/0.5/0/below. Equity drawdown earns 4/2/0 when better than −20/−30% or worse; bond thresholds are −10/−15%. Yield earns 4/2/0 at ≥1.5/0.5/below 0.5%.

A rating needs Cost, Size, and two more groups among Liquidity, Structure, Diversification, Trend and Risk. Bands are Rules met at 72%, Mostly met at 60%, Partly met at 48%, and Few met below 48%. With fewer than 70 evidenced points, the best band is Mostly met and the result carries an Incomplete data flag. Every rule stores its points, threshold, observed value, source date and data-gap reason in `etf_scores.rule_hits`.

ETCs, ETNs, leveraged and inverse funds, and options overlays are out of scope. TER above 1.5%, AUM below EUR 20m, age under one year, median traded value below EUR 100k, an ISIN mismatch, a non-ETF detail result, or a listing unseen for more than 30 days rejects the rating. Price below both the 50-day and 200-day averages marks Trend broken. AUM below EUR 50m shows Caution. A missing required group shows Insufficient data. Rejected, out-of-scope, broken-trend and insufficient-data results have no percentage.

The job reads dated fund facts, holdings, exposure, dividends and price bars no later than the score date. Price bars must be no more than seven days old. EUR conversion needs a stored EUR/USD close from the previous seven days. A fund-stat AUM with unknown currency is a gap; a USD catalog AUM may stand in for a US venue USD listing. Category comes from dated fund stats, with the catalog as a fallback. The wrapper rule uses the fund-stat or catalog UCITS hint, which is not issuer confirmation. The equity benchmark comparison uses an exposure-region proxy where an index series is available. World funds have no collected world proxy, so that rule is a data gap. Fund trading currency and index local currency can differ, and FX moves can affect this comparison. Stored provider figures are displayed only through the market-data access gate.

The criteria are informed by [justETF](https://www.justetf.com/en-de/academy/make-the-right-etf-selection.html), [State Street](https://www.ssga.com/us/en/individual/insights/how-to-evaluate-etfs-6-things-that-matter-most), [ESMA](https://www.esma.europa.eu/sites/default/files/library/2015/11/2012-44_0.pdf), [Morningstar](https://www.morningstar.com/funds/why-funds-die), [WisdomTree](https://www.wisdomtree.com/gb/insights/blog/dispelling-the-myth-etf-trading-volume-does-not-equal-etf-liquidity), and [Meb Faber's trend research](https://mebfaber.com/2007/02/10/published-errrsort-of/). These sources do not set the point weights.

Deployment keeps showing the latest v2 score for each listing until a v3 score is stored. Run the ETF score job after deployment to replace the legacy rows; the base manifest suspends its CronJob, but the live schedule must be checked separately. Job runs record counts and stored score rows retain their 400-day history.
