# ETF catalog and weekly picks

The catalog covers Xetra ETFs, active ETFs, ETCs and ETNs, plus US ETFs in the Nasdaq Trader symbol directories. It does not filter by broker access or UCITS status. UCITS is informational, and an IE/LU ISIN or a fund name is only a hint until an issuer source confirms it.

`npm run etf:catalog-sync` downloads the [Xetra file](https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra), [Nasdaq-listed file](https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt), and [other-listed file](https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt). The Xetra page supplies a fresh CSV link if the saved URL changes. The job updates `last_seen` for present listings and keeps missing listings in the database. A listing last seen more than 30 days ago is excluded from enrichment and shortlist selection. `first_seen` stays fixed. Xetra keys use the ISIN supplied by the exchange; US keys use `EXCHANGE:SYMBOL` because the directories have no ISIN. Keys stay stable when later enrichment finds an ISIN, so saved fund URLs keep working.

The catalog sync runs Sunday at 05:10 Europe/Bratislava. Enrichment runs Sunday at 05:40 through the Codex adapter, in sequential batches of 20. It reads only pending rows from `/api/ingest/etf-catalog/pending`, posts checked results to `/api/ingest/etf-catalog`, and skips successful rows on later runs. An incomplete result increments `enrich_attempts`; after three such results the row stops retrying. A failed model call leaves its batch pending and the runner continues with the next batch. Use `npm run etf:enrich -- --limit 100 --dry-run` to inspect a bounded run. For the first full run, start the same CronJob manually with `kubectl create job --from=cronjob/invest-buddy-etf-enrich invest-buddy-etf-enrich-initial -n invest` after deployment approval. The first run may cover more than 5,000 US ETFs.

After each enrichment batch, the server rebuilds a shortlist of up to 150 recent ETF and active ETF listings across the global catalog. It groups funds by `asset_class` and `region`, sorts each group by AUM descending, and uses lower TER when AUM is missing. For share classes tracking the same index within a group, an accumulating class is considered first. It then takes one fund per group in repeated rounds until the list reaches 150. ETCs and ETNs stay in the catalog but do not enter the default shortlist. The stored `shortlist_rank` fixes the order passed to research.

Weekly picks run Monday at 07:40. The runner loads the shortlist, sends chunks of 25 to the Codex adapter with web search, and asks for a BUY_ZONE, WATCH, or AVOID card for every fund. A chunk may include up to three other catalog funds from notable news. Each successful chunk is posted separately to `/api/ingest/etf`; one failed chunk does not discard the others. Ingest resolves the catalog listing by exchange and symbol, with ISIN as a fallback, stores `listing_key` on the pick, and keeps the pick's first-seen date and entry price on later evaluations. It never deletes old picks. The output schema now allows 28 cards per call: 25 shortlist funds and three extras.

Both model CronJobs have their own `RESEARCH_CODEX_MODEL` value. An empty value uses the Codex default. `RESEARCH_ENABLED=off` stops model runs. There are no token, call, or quota gates, and no new paid API keys. The daily outcomes job continues to measure stored picks.

## Placeholders

| Placeholder | Value |
| --- | --- |
| `{{asOf}}` | Run date in Europe/Bratislava, as YYYY-MM-DD. |
| `{{shortlist}}` | JSON array of up to 25 catalog listings for this call. |

The research output contract is `scanner/schema/etf-output.schema.json`. Enrichment uses `scanner/schema/etf-enrich.schema.json`. Migration `094_etf_catalog.sql` defines the catalog and adds `listing_key` to picks.
