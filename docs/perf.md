# Performance baseline

Measures time to first byte (TTFB) for the public pages. Script: `scripts/perf-probe.mjs`.

## Method

```sh
node scripts/perf-probe.mjs --base https://invest.filipcsupka.online --runs 10 --out perf.json
node scripts/perf-probe.mjs --base http://localhost:3000 --runs 10   # local build: npm run build && npm start
```

- URLs: home, dashboard, company NVDA, company AMD, track-record, methodology, each in `en` and `sk`.
- TTFB is the time until response headers arrive. Total includes the body.
- p50 and p95 use nearest rank. Status counts include 5xx; connection failures count as status 0.
- The first request per URL is reported as `cold`; p50/p95 cover the remaining (warm) runs, so use 2 or more runs. Runs of 1 give an empty warm set.
- Requests run one after another, so this measures latency, not load.
- Results depend on the caller's network. To split network from app time, run it once from inside the cluster (needs cluster write approval for a one-off Job; not done).

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

Pages stay server-rendered per request. The shared reads (`latestScores`, `instrumentUniverse`, `latestPortfolio`, `latestIdeas`) go through `webCached` in `src/data/web-cache.ts`: Next data cache, 300 s, tags `scores`, `ideas`, `portfolio`. A repeat hit does not query Postgres.

- Purge: `POST /api/revalidate` with `Authorization: Bearer $INGEST_TOKEN`, optional body `{"tags":["scores"]}`. The scan and ideas ingest routes purge their tag after a successful write.
- Only viewer-independent reads are wrapped. Anything that reads a session, cookie or header must not use `webCached`; a test checks the store files for `headers()` and `cookies()`.
- `src/jobs/daily.ts` writes to Postgres directly, then calls `POST /api/revalidate` with `{"tags":["scores","portfolio"]}`. It is best effort: unset env logs one line and skips, a failed call logs and never fails the job. Without a purge, a new score date shows within 300 s.
  - Env the daily CronJob needs: `INGEST_TOKEN` (same secret the web pod uses) and `INGEST_BASE_URL` (`WEB_BASE_URL` is accepted too), for example `http://web.invest.svc.cluster.local:3000`. Not added to the manifests yet; that is an infra change.
- The cache is per pod (Next data cache on the pod's disk/memory). A purge reaches only the pod that receives the request, so this is valid for 1 web replica. With more replicas, the other pods serve stale data for up to 300 s, and the purge needs a shared cache handler or a call per pod.
- When no database pool exists (`DATABASE_URL` unset), the loaders skip the cache so the empty result is not kept for 300 s.
- Ingest routes that purge: scan (`scores`), ideas (`ideas`). `universe` and `judge-input` are GET-only reads, `research`, `extraction-runs`, `gate` and `ai-budget` write tables no cached loader reads, and `portfolio-baseline` writes `portfolio_baseline`, which `latestPortfolio` does not read (it reads `portfolio_snapshots`), so none purge.
- `purgeWebCache` logs `cache_purge_failed` when `revalidateTag` throws; `/api/revalidate` reads at most 1 KB of body.
