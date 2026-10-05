# Tasks that need an account, key or decision from Filip

These sources work or may work, but need a signup, a paid plan, or a licence answer before a script can use them. Verified on 2026-10-05 unless marked unverified. Nothing in rows 1 to 10 is wired. Rows 11 to 13 are wired and wait for a decision.

| # | Task | Why | Status |
|---|---|---|---|
| 1 | Get a free Alpha Vantage key and ask in writing whether free-tier data may be shown in the app | `EARNINGS_CALENDAR` returns `estimate`, the only free EPS estimate found. Limit is 25 requests per day. Its docs say commercial use needs a conversation with sales. | Key needed; display licence unverified |
| 2 | Decide on Twelve Data Grow plan | `earnings` endpoint needs the Grow plan. `earnings_estimate` needs Ultra. The free plan is also internal-use only, not for display to users (pricing tooltip), so a paid launch needs a licence anyway (ADR-002). | Decision |
| 3 | Get a free FRED API key | Macro series for the macro scan. The key is required. The FRED notice must be shown ("uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis"). | Key needed |
| 4 | Get a free BLS v2 key (optional) | v1 works without a key at 25 queries per day, v2 gives 500. Only needed if v1 is not enough. | Optional |
| 5 | Get a free EIA key | Electricity and energy data for the datacenter power theme. `DEMO_KEY` works for tests only. | Key needed |
| 6 | Ask IBKR for headless access, or accept a manual refresh | The IBKR MCP server uses an interactive OAuth login for one account. Token lifetime and refresh are unverified. Until confirmed, refresh the portfolio baseline by hand in an interactive session. | Unverified |
| 7 | Add a monitored contact address for `SEC_USER_AGENT` | SEC requires a descriptive User-Agent with contact. The ConfigMap still has a placeholder. A collector job cannot run on the cluster until it is set. | Needed before cluster test |
| 8 | Check terms before showing third-party text | Google News RSS, GDELT, Cboe VIX, FINRA short interest and Alpha Vantage have no verified permission to display their data. Use them as internal signals and link out, or get permission. | Legal check |
| 9 | Optional free OpenFIGI key | Works without a key at 25 requests per minute. A key raises the limit. Only needed for the 13F CUSIP to ticker map at scale. | Optional |
| 10 | Get a FINRA API Public credential, then wire consolidated short interest | Developer docs describe OAuth with an API credential for the Query API, and list "Public" among the credential types for Consolidated Short Interest. A plain GET to `api.finra.org/data/group/otcMarket/name/consolidatedShortInterest` returned CSV without credentials on 2026-10-05, but that is not documented, so it is not wired. Docs state 1200 synchronous requests per minute per IP. The Equity Terms of Service were not read. | Credential needed; terms unverified |
| 11 | Decide whether Google News RSS may be used at all | The feed's own copyright line says it is "made available solely for the purpose of rendering Google News results within a personal feed reader for personal, non-commercial use. Any other use of the feed is expressly prohibited." The `gnews` source is wired as an internal signal with `display_allowed=false`, but this text covers any use in a product. | Legal check |
| 12 | Check ClinicalTrials.gov and GDELT terms | Both are wired. ClinicalTrials.gov is stored with `display_allowed=false` because the terms text was not read. GDELT terms were not read and its API throttles hard (see `docs/data.md`). | Legal check |
| 13 | Optional later: give the judge its own key | The judge runs on the subscription CLI login and shares the 5-hour pool with interactive work. It is one small call a day. If it ever competes with interactive work, move the CronJob to a separate account or key. No key is needed now. | Optional decision |

| 14 | Check Twelve Data terms for public daily close charts | The current company page can reconstruct a daily close series from its SVG. Confirm redistribution rights or publish a coarser derived view before enabling database-backed public charts. | Legal check |

Rejected for ToS or reliability reasons: EDGAR full-text search (403 to scripts), Stooq (bot wall), Yahoo unofficial endpoints, Nasdaq earnings JSON (undocumented), StockTwits, Reddit, Cboe put/call CSV (frozen at 2019), congressional trade scrapers. Finnhub, FMP and Tiingo need signups and their limits and terms were not verified.

Still unsolved: EPS consensus history and analyst revisions have no free, redistributable, verified source.
