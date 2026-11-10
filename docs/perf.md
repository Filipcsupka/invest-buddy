# Performance baseline

Measures time to first byte (TTFB) for the public pages. Script: `scripts/perf-probe.mjs`.

## Method

```sh
node scripts/perf-probe.mjs --base http://localhost:3000 --runs 10   # local build: npm run build && npm start
```

- URLs: home, dashboard, company NVDA, company AMD, track-record, methodology, each in `en` and `sk`.
- TTFB is the time until response headers arrive. Total includes the body.
- p50 and p95 use nearest rank. Status counts include 5xx; connection failures count as status 0.
- The first request per URL is reported as `cold`; p50/p95 cover the remaining (warm) runs, so use 2 or more runs. Runs of 1 give an empty warm set.
- Requests run one after another, so this measures latency, not load.
- Results depend on the caller's network. To split network from app time, run it once from inside the cluster (needs cluster write approval for a one-off Job; not done).
- The probe and k6 refuse `invest.filipcsupka.online` unless `ALLOW_PROD=1` is set. Do not use the override for load tests.

## k6 load test

Run this on a dedicated test node against a separate web instance backed by a copy of the database. Keep the test hostname and database separate from production. Set `DATA_MODE=fixture` for a local smoke test. Set `RATE_LIMIT=off` on the test web instance, or set `RATE_LIMIT_PAGES_PER_MIN` and `RATE_LIMIT_API_PER_MIN` high enough that the test measures page capacity rather than one k6 node's shared IP. Keep the limiter enabled for a separate rate-limit test. The k6 thresholds require zero 429s.

The default `perf/k6/tickers.txt` contains the 35 fixture symbols. For a copied database, export one published ticker per line to a file on the load node and pass its path as `TICKERS`. The file should match the target's universe; unknown tickers produce 404s. `OWNER_AUTH` may hold an `Authorization` header value such as `Basic ...` when the test target requires owner access. `REVALIDATE_TOKEN` must be the test instance's `INGEST_TOKEN`; the load profile sends one `POST /api/revalidate` for the `scores` tag at minute 17, while 100 extra VUs briefly increase traffic. The smoke profile does not purge.

```sh
# Local smoke: start the app separately with DATA_MODE=fixture, then run k6.
DATA_MODE=fixture RATE_LIMIT=off npm run dev
k6 inspect -e BASE_URL=http://localhost:3000 -e PROFILE=smoke perf/k6/load.js
BASE_URL=http://localhost:3000 PROFILE=smoke HEALTH_EXPECTED_STATUS=503 k6 run --summary-export /tmp/invest-k6-smoke.json perf/k6/load.js

# Dedicated load node: use only a test origin and its test token.
export BASE_URL=https://test.example.internal
export TICKERS=/path/to/test-tickers.txt
export REVALIDATE_TOKEN=...  # test instance token
export PROFILE=load
k6 inspect --include-system-env-vars perf/k6/load.js
k6 run --summary-export /tmp/invest-k6-load.json perf/k6/load.js
```

The smoke profile ramps from 1 to 5 VUs in one minute and assigns each VU a journey, covering all six journey types. It checks status, 429s, and response size. `/api/health` returns 503 in fixture mode without a database, so set `HEALTH_EXPECTED_STATUS=503` only for that local smoke; this exempts the built-in HTTP failure threshold while still checking every route's expected status. The load profile requires health 200 and ramps 0 to 50 to 200 to 500 VUs over 15 minutes, holds 500 for 10 minutes, then ramps down over two minutes. Load journey selection is 40% home/dashboard/company browsing, 25% scanner filters, 15% company/methodology/track record, 10% heatmap/ETF, 5% health, and 5% static assets. Each step has 1 to 5 seconds of think time. Scanner requests vary state, sector, F/T/M, sort, and `page=1..3`. The current scanner ignores `page` because it does not paginate yet.

The script sends `Accept-Encoding: gzip` and checks every response for the expected status and size. The default decoded HTML limit is 25 million characters (`MAX_HTML_CHARS`); dashboard responses also have a 1 MiB compressed limit (`MAX_DASHBOARD_GZIP_BYTES`) when the server supplies both `Content-Encoding: gzip` and `Content-Length`. The revalidation response has a 64 KiB limit. The summary reports decoded body characters and any declared gzip length. If the server uses chunked transfer, use a network capture or proxy metrics to measure compressed dashboard bytes. Both profiles require no 429s or oversized responses. The load profile also requires HTTP failure rate below 0.5%, dashboard p95 below 1.5 s, company p95 below 800 ms, scanner p95 below 1.2 s, and health p99 below 500 ms.

During the run, record web pod RSS and restarts (`kubectl top pod` and `kubectl get pod`), Postgres CPU (`kubectl top pod`), and Postgres connection activity (`pg_stat_activity`). Capture event-loop lag and pool wait p95 from the test instance's instrumentation if available; these metrics are not exposed by the app today. Compare the minute before and after revalidation for 5xx, latency, readiness changes, and memory growth. Record the test image, database size, node resources, rate-limit setting, ticker count, and summary JSON with the result.

Local fixture smoke on 2026-11-09 used the standalone build, 1 to 5 VUs, and `RATE_LIMIT=off`. It made 65 requests; all 130 checks passed, with overall request p95 of 1.17 s and no 429s or oversized responses. Four health requests returned the expected 503 because the fixture app had no database. k6 counted those four in its built-in HTTP failure metric (4/65), while the explicit status checks passed. This smoke is a route check, not a capacity baseline.

## Baselines

### 2026-10-09 evening (before W2), from the owner's Mac, 3 requests per URL

| Page | TTFB |
|---|---|
| home | 1.2 to 2.4 s |
| dashboard | 0.7 to 2.0 s |
| company NVDA | 0.6 to 1.2 s (total 1.7 to 3.6 s) |
| track-record | about 1 s |
| methodology | 0.5 to 1.0 s |
| health | 0.15 to 0.28 s |

No 5xx seen in 33 requests or the last 400 web log lines.

### 2026-10-14 (after W2 shared pool, before W5), from a Mac, 5 runs per URL, all 200

| Path | TTFB p50 ms | TTFB p95 ms | Total p95 ms |
|---|---|---|---|
| /en | 818 | 1353 | 1604 |
| /en/dashboard | 731 | 2273 | 2355 |
| /en/company/NVDA | 406 | 620 | 1437 |
| /en/company/AMD | 455 | 706 | 991 |
| /en/track-record | 582 | 1283 | 1496 |
| /en/methodology | 501 | 1049 | 1074 |
| /sk | 481 | 549 | 662 |
| /sk/dashboard | 686 | 1492 | 1524 |
| /sk/company/NVDA | 614 | 1659 | 2392 |
| /sk/company/AMD | 357 | 502 | 1927 |
| /sk/track-record | 505 | 1200 | 1370 |
| /sk/methodology | 364 | 518 | 670 |

Five runs make p95 the slowest sample. Use 10 or more runs for a number to compare against.

## Proposed budget

Proposed from the baseline. Owner confirms. Measured with the script from a home or office network, 10 runs per URL.

| Page group | TTFB p50 | TTFB p95 | Status |
|---|---|---|---|
| home, company, track-record, methodology (cached, after W5) | 300 ms | 800 ms | all 200 |
| dashboard | 500 ms | 1200 ms | all 200 |
| any page | no 5xx over a 30 minute probe | | |

Re-run after W4 and W5 and update this table.

## Web pod 5xx count

Not collected here. It needs `kubectl logs` on the web pod, and this change did not touch the cluster. Run read-only: `kubectl -n invest logs deploy/web --since=24h | grep -c ' 5[0-9][0-9] '` and add the number with the date.

## W5 caching

Pages stay server-rendered per request. The shared reads (`latestScores`, `instrumentUniverse`, `latestPortfolio`, `latestIdeas`) go through `webCached` in `src/data/web-cache.ts`: 300 s, tags `scores`, `ideas`, `portfolio`. A repeat hit does not query Postgres. Since 2026-11-10 the cache in the Next server is in process memory (see Cold start below); unit tests and jobs still go through `unstable_cache`.

- Purge: `POST /api/revalidate` with `Authorization: Bearer $INGEST_TOKEN`, optional body `{"tags":["scores"]}`. The scan and ideas ingest routes purge their tag after a successful write.
- Only viewer-independent reads are wrapped. Anything that reads a session, cookie or header must not use `webCached`; a test checks the store files for `headers()` and `cookies()`.
- `src/jobs/daily.ts` writes to Postgres directly, then calls `POST /api/revalidate` with `{"tags":["scores","portfolio"]}`. It is best effort: unset env logs one line and skips, a failed call logs and never fails the job. Without a purge, a new score date shows within 300 s.
  - Env the daily CronJob needs: `INGEST_TOKEN` (same secret the web pod uses) and `INGEST_BASE_URL` (`WEB_BASE_URL` is accepted too), for example `http://web.invest.svc.cluster.local:3000`. Not added to the manifests yet; that is an infra change.
- The cache is per pod (process memory). A purge reaches only the pod that receives the request, so this is valid for 1 web replica. With more replicas, the other pods serve stale data for up to 300 s, and the purge needs a shared cache handler or a call per pod.
- When no database pool exists (`DATABASE_URL` unset), the loaders skip the cache so the empty result is not kept for 300 s.
- Ingest routes that purge: scan (`scores`), ideas (`ideas`). `universe` and `judge-input` are GET-only reads, `research`, `extraction-runs`, `gate` and `ai-budget` write tables no cached loader reads, and `portfolio-baseline` writes `portfolio_baseline`, which `latestPortfolio` does not read (it reads `portfolio_snapshots`), so none purge.
- `purgeWebCache` logs `cache_purge_failed` when `revalidateTag` throws; `/api/revalidate` reads at most 1 KB of body.

## Cold start (2026-11-10)

The owner saw about 9 s to open a page with a cold cache. Read-only `EXPLAIN (ANALYZE, BUFFERS)` on production, same day, private mode (`EODHD_PRIVATE_USE=on`, `SCORE_EXTENDED=on`), 2,230 score rows, 515 on the latest date:

| Read | Time | Shared buffers |
|---|---|---|
| `latestScores` (320 bars per name) | 8.9 s | 27,449 |
| `latestScoreSummaries` (no bars) | 2.9 s | 25,124 |
| `scoreHistory` (track record, no bars) | 4.5 s | 24,960 |
| page-row filter alone (`audit ? 'scanRunId' OR audit ? 'agreement'`) | 2.3 s | 15,084 |
| same `DISTINCT ON` with no filter | 3 ms | 1,248 |

The filter detoasted every stored audit (about 13 kB compressed each), and the listing reads then detoasted the full audit again for the payload.

Changes:

- Migration 137 adds generated columns to `score_results`: `has_scan_run`, `has_agreement` (the two key tests) and `listing_audit` (the audit with the last 64 bars). `pageScoreRow` uses the booleans, and partial indexes on `(ticker, as_of DESC)` match both modes. The listing reads use `listing_audit`; only `scoreForTicker` (one company) reads the full audit.
- `latestScores` keeps 64 bars per name, enough for the heatmap 3m change and the scanner floor. `latestScoreSummaries` is the same cached read with the bars removed, so one query serves both. `scoreHistory` (track record) is now cached too.
- In the Next server, `webCached` keeps entries in process memory (64 MB serialized budget, oldest dropped first). Concurrent misses share one loader call. An entry older than 300 s, or purged, is served once more while one background read replaces it. A failed background read keeps the old entry.
- `purgeWebCache` marks entries stale instead of dropping them, so the post-daily purge does not send every visitor to Postgres at once.
- `register()` in `src/instrumentation.ts` starts `warmWebCaches()` (scores, instrument universe, portfolio) in the background at server start. It is not awaited and logs `web_cache_warm` or `web_cache_warm_failed`. `WEB_CACHE_WARM=off` skips it. Per-ticker reads (company page, dataset freshness) fill on first visit.

Same SQL on a local PGlite copy of the production rows (median of 3, PGlite is single-process WASM, so compare the ratio, not the absolute numbers):

| Read | Before | After | Payload before / after |
|---|---|---|---|
| `latestScores` | 522 ms | 41 ms | 16.6 MB / 4.7 MB |
| `scoreHistory` | 310 ms | 95 ms | 7.7 MB / 7.7 MB |
| `scoreForTicker` | | 1 ms | one row |

Migration 137 took about 1 s on that copy. It rewrites `score_results` once. After deploy, re-run the production `EXPLAIN` above against the new SQL to get the real numbers.
