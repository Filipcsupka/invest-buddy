# EODHD catalyst collection

`npm run catalyst:eodhd` writes deterministic EODHD catalysts to the `catalyst_8k_eodhd` collected-fact key. Reconciliation reads it together with the SEC `catalyst_8k` key for `productCatalyst`, and a qualifying fact from either source wins over an SEC "none found" row, so the two writers never overwrite each other. It only selects non-US listings in the scored universe. The EODHD symbol comes from `instrument_ids.vendor_symbols.eodhd` or the same home-listing resolver as `prices:eodhd` (US names resolve to `.US` and are left to the SEC path); a ticker that cannot be resolved is skipped and counted as a failure. The SEC 8-K collector remains the US path. A qualifying EODHD fact is dated by the collection day and tagged `source_id=eodhd`; no model is called.

The earnings rule uses `earnings_calendar_snapshots` rows from EODHD. It requires a report within 14 days, a calendar observation no more than seven days old, and an EPS estimate increase of at least 5% against a same-source, same-report observation about 30 days earlier. Missing estimates or baselines do not qualify. The reader checks both the calendar observation and the stored fact against the score date, and rejects the fact after the report date. Calendar SQL also requires `observed_at` and `observed_on` to be no later than the scoring day.

News requests go only to names whose latest stored score is at least 15. The job sorts by score, takes at most 20 symbols, and sends them in groups of five through `/news` with a seven-day date range. It stores each matched headline, publication date, sentiment, tags, vendor symbol and publisher link in `source_documents` with EODHD provenance and `display_allowed=false`. A shared article gets a symbol-specific URL fragment because a document row has one symbol. Two distinct articles with polarity at least 0.6 and a relevant catalyst tag make a news catalyst. Market, stock-price, trading, foreign exchange and crypto tags alone do not qualify. An earnings catalyst takes precedence when both rules fire.

The vendor material stays internal while display rights are unverified. EODHD documents and facts are excluded from extraction bundles, so the extractor does not process the news text. The score receives a derived Boolean and a generic reason, without headline text, estimate figures, sentiment values or a public source link. Reconciliation still uses its existing `productCatalyst` priority rules.

The client estimates five base calls per `/news` request. The job sends one request per symbol (limit 25), so one busy name cannot crowd out the others; 20 symbols cost 100 base calls. Articles are deduplicated by URL and by normalized title plus day. EODHD's documentation also mentions **UNVERIFIED** extra billing of five calls per ticker; the possible extra cost is 100 calls for 20 symbols, making a conservative 200-call planning figure before retries. The job prints both the client's base count and the possible ticker surcharge. Its per-run cap bounds requests, but the actual ALL-IN-ONE allowance and bill must be checked against the vendor account. News response completeness, symbol matching for European listings, sentiment calibration and tags on paid responses remain **UNVERIFIED**.

With no API key or database, run the synthetic fixture:

```sh
npm run catalyst:eodhd -- --dry-run --fixture-dir src/data-providers/eodhd/fixtures/catalyst --only ASML.AS --as-of 2026-10-21
```

Without `--fixture-dir`, dry run reads stored calendar and score rows and calls EODHD, but writes no documents, facts or job run. A live run needs `DATABASE_URL` and `EODHD_API_KEY`. The job has no scheduled deployment here; activation waits for a paid-response check.
