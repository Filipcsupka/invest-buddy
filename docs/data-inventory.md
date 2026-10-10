# Data inventory

`npm run data:inventory` prints what the database holds: row counts, min and max dates, table sizes with indexes, source documents per source with body bytes, raw snapshots per source (uncompressed and gzip bytes, D17), collected facts per key, and an expiry histogram by month. It prints JSON first, then markdown tables. Every statement is a SELECT and the run is wrapped in a `READ ONLY` transaction.

```
DATABASE_URL=postgresql://... npm run data:inventory
```

Against the live database, run it as a manual exec by the owner or a read-only Job. Nothing here schedules it.

## Baseline, 2026-10-09

A dated snapshot read from a SELECT-only look at the live database on 2026-10-09, copied from `docs/roadmap/lane-data.md`. Numbers drift daily; this is not a live view (the live view is D39).

| Table | Rows | Range or note |
|---|---|---|
| `instruments` | 37 | 28 `guide`, 7 `sample extension`, 1 `discovery` (PCVX), 1 `benchmark` (SPY) |
| `daily_bars` | 9,766 | 37 tickers, 2025-09-22 to 2026-10-08 |
| `discovery_price_bars` | 9,332 | 37 symbols, 2025-07-02 to 2026-10-08 |
| `filing_watch` | 33,719 | filings from 1995-05-19 to 2026-10-08, cursor only, no text |
| `source_documents` | 1,087 | edgar 1,064, alphavantage 20, fred 2, cboe 1; 9.9 MB of body text; published 2026-06-29 to 2026-10-08; `expires_at` from 2026-11-05 |
| `collected_facts` | 438 | 5 keys: `latest_earnings_8k` 28, `eps_surprise_latest` 20, `volume_ratio_20d` 143, `price_move_5d` 143, `insider_net_buy_90d` 101; 30-day expiry |
| `score_results` | 178 | 2026-10-02 to 2026-10-08 |
| `consensus_findings` | 1,356 | 2026-10-02 to 2026-10-08 |
| `record_snapshots` | 103 | immutable, since 2026-10-06 |
| `portfolio_nav_history` | 234 | 2025-11-17 to 2026-10-08 |
| `cusip_map` | 0 | 13F source never ran |
| database | 30 MB | PVC `postgres-data` 5 Gi `local-path` on one node, backup suspended |

Tables the report covers that have no baseline row above: `discovery_candidates`, `collector_runs`, `scan_runs`, `scan_findings`, `extraction_runs`, `record_signals`, `trade_ideas`. A table missing from the schema is skipped.

Running the script on the live database once would add the per-table sizes, which the 2026-10-09 baseline does not have.
