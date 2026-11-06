# ETF catalog and weekly picks

The catalog covers Xetra ETFs, active ETFs, ETCs and ETNs, plus US ETFs in the Nasdaq Trader symbol directories. It does not filter by broker access or UCITS status. UCITS is informational, and an IE/LU ISIN or a fund name is only a hint until an issuer source confirms it.

`npm run etf:catalog-sync` downloads the [Xetra file](https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra), [Nasdaq-listed file](https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt), and [other-listed file](https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt). The Xetra page supplies a fresh CSV link if the saved URL changes. The job updates `last_seen` for present listings and keeps missing listings in the database. A listing last seen more than 30 days ago is excluded from enrichment and shortlist selection. `first_seen` stays fixed. Xetra keys use the ISIN supplied by the exchange; US keys use `EXCHANGE:SYMBOL` because the directories have no ISIN. Keys stay stable when later enrichment finds an ISIN, so saved fund URLs keep working.

The catalog sync runs Sunday at 05:10 Europe/Bratislava. Enrichment runs Sunday at 05:40 from EODHD fundamentals only (no model), in sequential batches of 20 and at most 500 EODHD calls per run. It reads only pending rows from `/api/ingest/etf-catalog/pending`, posts checked results to `/api/ingest/etf-catalog`, and skips successful rows on later runs. An incomplete result increments `enrich_attempts`; after three such results the row stops retrying. A failed batch stays pending and the runner continues with the next batch. Use `npm run etf:enrich -- --limit 20 --dry-run` to inspect a bounded run. For the first full run, start the same CronJob manually with `kubectl create job --from=cronjob/invest-buddy-etf-enrich invest-buddy-etf-enrich-initial -n invest` after deployment approval. The first run may cover more than 5,000 US ETFs.

After each enrichment batch, the server rebuilds a shortlist of up to 150 recent ETF and active ETF listings across the global catalog. It groups funds by `asset_class` and `region`, sorts each group by AUM descending, and uses lower TER when AUM is missing. For share classes tracking the same index within a group, an accumulating class is considered first. It then takes one fund per group in repeated rounds until the list reaches 150. ETCs and ETNs stay in the catalog but do not enter the default shortlist. The stored `shortlist_rank` fixes the order passed to research.

Weekly picks run Monday at 07:40. The runner sends each stored shortlist batch of 25 to the existing Codex adapter without web search. The model writes a BUY_ZONE, WATCH or AVOID screening note for each listing. The runner rejects a changed catalog identity or cost field, an added listing, a fabricated price, or a fabricated evidence link. The current shortlist has no dated price, so price fields stay null. Empty evidence leaves a pick unverified; the card must not imply that a source page was checked. Each successful batch posts separately to `/api/ingest/etf` and keeps earlier picks and entry prices.

The stock judge keeps its Claude CLI subscription provider and receives stored EODHD revenue, EPS, insider and catalyst facts when `EODHD_PRIVATE_USE=on`, plus fixed rule and chart results. The model has no web tools. Its input builder excludes earlier web research findings and retains stored SEC citation links without document text. Each fact carries its source, date first observed, and stored provenance key. The runner keeps the figure check and English/Slovak parity check.

Both model runners log expected tokens before a call and actual input, output and cache tokens after it. `AI_JUDGE_MONTHLY_TOKEN_CAP` defaults to 2,000,000 tokens across all recorded AI calls in the UTC month; `AI_EXPECTED_OUTPUT_TOKENS` defaults to 30,000 per call. The estimate is prompt characters divided by three, rounded up, plus that output allowance. A missing usage report stops the call. The existing AI budget ledger records completed judge and ETF calls. For a local offline check, pass `--dry-run --input-file <json>` to either runner. Dry run reports the expected tokens and makes no model call or ingest write.

EODHD-derived facts and ETF picks belong in the owner-authenticated view only. Keep `EODHD_PRIVATE_USE=on` only in that private environment, and leave the public display path disabled until licensing is settled. The judge and ETF research CronJobs remain suspended until their private web path and credentials are checked on the cluster.

## Placeholders

| Placeholder | Value |
| --- | --- |
| `{{asOf}}` | Run date in Europe/Bratislava, as YYYY-MM-DD. |
| `{{shortlist}}` | JSON array of up to 25 enriched catalog listings for this call. |

The research output contract is `scanner/schema/etf-output.schema.json`. The EODHD enrichment output and the ingest route validate against `scanner/schema/etf-enrich.schema.json`. Migration `094_etf_catalog.sql` defines the catalog and adds `listing_key` to picks.
