# EODHD catalyst collection

`npm run catalyst:eodhd` writes deterministic EODHD catalysts to the `catalyst_8k_eodhd` collected-fact key. Reconciliation reads it together with the SEC `catalyst_8k` key for `productCatalyst`, and a qualifying fact from either source wins over an SEC "none found" row, so the two writers never overwrite each other. It only selects non-US listings in the scored universe. The EODHD symbol comes from `instrument_ids.vendor_symbols.eodhd` or the same home-listing resolver as `prices:eodhd` (US names resolve to `.US` and are left to the SEC path); a ticker that cannot be resolved is skipped and counted as a failure. The SEC 8-K collector remains the US path. A qualifying EODHD fact is dated by the collection day and tagged `source_id=eodhd`; no model is called.

The earnings rule uses `earnings_calendar_snapshots` rows from EODHD. It requires a report within 14 days, a calendar observation no more than seven days old, and an EPS estimate increase of at least 5% against a same-source, same-report observation about 30 days earlier. Missing estimates or baselines do not qualify. The reader checks both the calendar observation and the stored fact against the score date, and rejects the fact after the report date. Calendar SQL also requires `observed_at` and `observed_on` to be no later than the scoring day.

News requests go only to names whose latest stored score is at least 15. The job sorts by score, takes at most 20 symbols, and sends one `/news` request per symbol with a seven-day date range. It stores each matched headline, publication date, sentiment, tags, vendor symbol and publisher link in `source_documents` with EODHD provenance and `display_allowed=false`. A shared article gets a symbol-specific URL fragment because a document row has one symbol. Two distinct articles with polarity at least 0.6 and a relevant catalyst tag make a news catalyst. Market, stock-price, trading, foreign exchange and crypto tags alone do not qualify. An earnings catalyst takes precedence when both rules fire.

The vendor material stays internal because the current paid monthly account has no demonstrated public display license. EODHD documents and facts are excluded from extraction bundles, so the extractor does not process the news text. The score receives a derived Boolean and a generic reason, without headline text, estimate figures, sentiment values or a public source link. Reconciliation still uses its existing `productCatalyst` priority rules.

On 2026-11-06, one-symbol news requests for AAPL.US and ASML.AS each advanced `/api/user.apiRequests` by five calls, with no additional ticker charge. The ASML response included `ASML.AS` among its symbols; both sampled responses had sentiment values and empty tags. The job sends one request per symbol (limit 25), so 20 symbols cost 100 calls at the observed rate before retries. Articles are deduplicated by URL and by normalized title plus day. The job reports the client call count; the two measured requests did not incur a ticker surcharge. A two-article sample cannot establish news completeness or sentiment calibration, and empty tags mean these articles cannot qualify for a tag-based catalyst.

With no API key or database, run the synthetic fixture:

```sh
npm run catalyst:eodhd -- --dry-run --fixture-dir src/data-providers/eodhd/fixtures/catalyst --only ASML.AS --as-of 2026-10-21
```

Without `--fixture-dir`, dry run reads stored calendar and score rows and calls EODHD, but writes no documents, facts or job run. A live run needs `DATABASE_URL` and `EODHD_API_KEY`. The job has no scheduled deployment here; activation waits for the E3 to E6 data prerequisites and the stated owner approvals.
