# ETF rating, version etf-v1-2026-11-12

The ETF rating is an informational screen of stored fund facts. It has 35 possible points. The displayed count is earned points out of evidenced points; a fund needs at least 28 evidenced points (80%) and no exclusion to receive a rating. Missing data earns no points and reduces the evidenced maximum. The rating does not use the weekly pick call.

| Group | Rule | Points |
| --- | --- | --- |
| Cost | TER ≤0.10%, ≤0.20%, ≤0.30%, ≤0.50%, ≤0.75%, or higher | 10, 8, 6, 4, 2, 0 |
| Size | AUM in EUR ≥1bn, ≥500m, ≥100m, ≥50m, or lower | 6, 5, 3, 1, 0 |
| Liquidity | Median daily close × volume over 20 stored bars, in EUR: ≥1m, ≥100k, or lower | 4, 2, 0 |
| Structure | Full physical, sampled physical, swap, or other confirmed replication | 3, 2, 1, 0 |
| Structure | Issuer-confirmed UCITS status | 3 if confirmed, 0 if confirmed false |
| Structure | Age ≥5, ≥3, ≥1 years, or younger | 3, 2, 1, 0 |
| Structure | Irish domicile if US equity exposure is over 50%; otherwise domicile present | 1 |
| Trend | Close more than 2% above the 200-day simple moving average | 2 |
| Trend | 50-day simple moving average above the 200-day average | 1 |
| Trend | Price return from roughly 12 months ago to one month ago above zero | 1 |
| Trend | Equity fund's one-year maximum drawdown better than −20% | 1 |

A fund is unrated if it is leveraged, inverse or daily reset; an ETC or ETN; younger than one year; below EUR 20m AUM; marked `isin_mismatch` or `not_etf`; or absent from the catalog for more than 30 days. Fewer than 200 stored bars leave trend rules unevidenced, without being an exclusion by itself. Top-ten holdings weight, largest country and sector weights, and holdings count are unscored facts. The concentration flag turns on above 50% in the top ten or 70% in one country.

The score uses the newest fund statistics on or before its `as_of` date, and stored bars no later than that date. Holdings and exposure tables retain only the latest snapshot, so past score reconstruction cannot recover older portfolio composition. AUM currency is taken from an explicit fund value, or inferred when the fund and listing currencies agree. Other cases remain unevidenced with a recorded reason. USD values use the latest stored EUR/USD close on or before the score date; other non-EUR currencies remain unevidenced. A listing's quote currency does not establish the currency of fund assets when the fund currency differs. Replication, distribution and UCITS confirmation stay unknown until an issuer source establishes them. A catalog UCITS hint is not confirmation. The price series does not include distributions or tracking difference, and close × volume is a liquidity proxy rather than a bid-ask spread.

## Sources and open decisions

The thresholds are a first version, informed by [justETF's fund selection guide](https://www.justetf.com/en/academy/die-richtige-etf-auswahl.html) on TER, AUM, age, replication and liquidity; [Morningstar's ETF closure study](https://www.morningstar.com/funds/etfs-2023-tale-success-failure) and [fund closure analysis](https://www.morningstar.com/funds/why-funds-die) on size; [State Street's ETF evaluation guide](https://www.ssga.com/us/en/individual/insights/how-to-evaluate-etfs-6-things-that-matter-most) on spreads; and [Faber's trend research](https://alphaarchitect.com/2014/09/are-uber-simple-asset-allocation-systems-robust/) on moving averages. The Irish domicile point reflects [State Street's discussion of US dividend withholding in Irish UCITS funds](https://www.ssga.com/us/en/institutional/insights/considerations-for-non-us-investors-us-etfs-vs-irish-ucits). These sources do not establish the precise point weights; those are product rules.

The owner still needs to decide whether TER should use peer percentiles, whether concentration or trend belongs in the score, whether US funds should be rated for EU users, and which licensed issuer data can confirm replication and UCITS. Tracking difference needs index series. The weekly pick labels `BUY_ZONE`, `WATCH` and `AVOID` remain a separate wording issue. Display of market-data-derived scores follows the existing owner and Plus vendor-data gate.
