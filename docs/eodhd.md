# EODHD data access

The client lives in `src/data-providers/eodhd/client.ts`. Set `EODHD_API_KEY` in the job environment. It sends requests to `https://eodhd.com/api` with `api_token` and `fmt=json`; it never logs the token. `fetch` and the retry clock are injectable for local tests. HTTP 429 retries honor `Retry-After`; HTTP 402 raises a clear allowance or plan error. `getCallCosts()` gives an in-process estimate by endpoint, counting each attempted request and excluding documented unbilled 402 rejections. It is not the vendor's account ledger.

| Endpoint | Client method | Calls per request |
| --- | --- | ---: |
| `/exchanges-list` | `exchangesList` | 1 |
| `/exchange-symbol-list/{EXCH}` | `exchangeSymbolList` | 1 |
| `/eod/{SYM}` | `eod` | 1 |
| `/eod-bulk-last-day/{EXCH}` | `eodBulkLastDay` | 100, plus 1 per symbol in `symbols` |
| `/v1.1/fundamentals/{SYM}` | `fundamentals` | 10 |
| `/calendar/earnings` | `earningsCalendar` | 1 |
| `/news` | `news` | 5 base calls |
| `/sec-filings/{SYM}/form4` | `form4` | 10 |

The [EODHD call limits](https://eodhd.com/financial-apis/api-limits) distinguish requests from billed calls. Paid plans start at 100,000 calls per day and the standard request ceiling is 1,000 per minute. A rejected 402 request is not billed; failed ticker lookups can be. The account's actual allowance belongs to `/api/user`. **UNVERIFIED:** whether 429 responses consume daily calls; the counter includes them conservatively. The ALL-IN-ONE plan's exact allowance is **UNVERIFIED** and is not hardcoded here. The [bulk API documentation](https://eodhd.com/financial-apis/bulk-api-eod-splits-dividends) says `filter=extended` adds profile and technical fields without an extra charge. Those technical fields can be zero for older dates, while market cap and beta are not point-in-time.

## Symbol master

`npm run symbols:sync` fetches `/exchanges-list`, then active `/exchange-symbol-list` rows for US, XETRA, LSE, PA, AS, SW, PR, WAR, MI, MC, ST, OL, CO, HE, VI, BR and LS. Each returned exchange updates `symbols` in its own transaction. The key is `Code.EXCH`, such as `CDR.WAR`; `exchange` stores the requested EODHD suffix, since the row's `Exchange` can be a specific US venue. A complete nonempty active response updates names and metadata, preserves `first_seen`, sets `last_seen`, restores active rows, and marks absent rows on that exchange as `delisted`. Missing exchange codes are logged and skipped. The job records a `job_runs` entry through `runLoggedJob`.

**UNVERIFIED:** PA, AS, SW, PR, MI, MC, ST, OL, CO, HE, VI, BR and LS have not been confirmed as EODHD exchange codes. The runtime `/exchanges-list` check prevents requests for absent codes; it does not map a market to an alternative code. The [exchange API docs](https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours) confirm US, LSE, XETRA and WAR and state that `delisted=1` returns a separate historical set. This job requests the active set only, so `delisted` means absent from the latest complete active response. It does not import historical delistings predating the first sync.

## Field coverage and limits

- EOD bars provide date, OHLC, adjusted close and volume. Bulk EOD can include previous close, change, moving averages, 250-day range and average volume. The bulk split and dividend responses have different shapes.
- Fundamentals can include `General`, `Highlights`, `SharesStats`, `outstandingShares`, `Earnings`, `Financials` and `ETF_Data`. `filter` narrows the returned payload but does not lower its 10-call cost. **UNVERIFIED:** `Financials::Income_Statement::quarterly` is inferred from the filter pattern, and ETF expense ratio, total assets and holdings field presence varies by fund or exchange. Callers must check the actual response.
- `/v1.1/bulk-fundamentals/{EXCH}` is outside this client. **UNVERIFIED:** its plan access and call cost, so no budget assumption is made for it.
- The earnings calendar provides actual and estimated EPS and report timing for a date window. News provides article text, symbols, tags and sentiment. **UNVERIFIED:** news documentation also says “+5 per ticker”; the client counter records the documented 5-call base and must not be used as an exact bill when ticker parameters are involved.
- SEC Form 4 is for US issuers. Its filing pages contain non-derivative and derivative transactions plus pagination. `links.next` is a relative path without the token; callers can use its offset in another `form4` request. Other markets may return 404.

Only the exchange list and symbol list are wired to a job in this change. The other methods are available to later collectors. Tests use static JSON examples from the EODHD [exchange](https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours), [EOD](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes), [bulk](https://eodhd.com/financial-apis/bulk-api-eod-splits-dividends), [fundamentals](https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds), [earnings](https://eodhd.com/financial-apis/calendar-upcoming-earnings-ipos-and-splits), [news](https://eodhd.com/financial-apis/stock-market-financial-news-api) and [Form 4](https://eodhd.com/financial-apis/insider-transactions-api) docs. They make no network calls.
