# Collector fixes after the phase A review

Changes to `src/collectors/{edgar,http,types}.ts`, `src/jobs/{collect,detect}.ts`, `src/db/collectors.ts` and `collector-cronjobs.yaml`. Regression tests are in `src/jobs/collect-fixes.test.ts` and `src/jobs/detect.test.ts`.

## Behaviour changes

- **detect** only counts a collected fact as a change for `latest_earnings_8k`, a 5-day price move of 5% or more, or a volume ratio of 2 or more. `insider_net_buy_90d` no longer triggers a rescan, a new Form 4 already arrives as a new document. A stock that stays 5% or more up over 5 days is flagged again on each new trading day. `latest_earnings_8k` is now keyed by the filing date instead of the run date.
- **Form 4** is fetched from the raw XML path (the `xslF345X0N/` prefix is dropped). A trade with an empty or footnoted price gets `dollars: null` and the fact carries `dollarsComplete: false`. `netDollars` sums priced trades only.
- **Form 4 retention** is 91 days (other documents 30). `expires_at` is now set in the upsert, `migrations/007` is unchanged.
- **Lockout**: a stopped run (429, or 403 from sec.gov) always exits 1. The collect CronJob has `backoffLimit: 0`, the next scheduled run is the retry.
- **Allow-list**: only `www.sec.gov`, `data.sec.gov`, `www.globenewswire.com` and `api.stlouisfed.org`, https on port 443, no credentials, checked before every hop including redirects. Filing URLs must stay inside the filing folder. CIK must be a positive integer, accession must match `NNNNNNNNNN-NN-NNNNNN`.
- **Response size**: `getText` reads at most 8 MB per response and truncates beyond that.
- **plainText**: numeric and hex entities outside the Unicode range become a space, `&amp;` is decoded last, `<` followed by a non-letter stays text, NUL is removed, and script/style/tag stripping is linear.
- **Schedule** (Europe/Bratislava): prices 05:00 Tue-Sat (30 min deadline), collect 05:35 Tue-Sat (30 min deadline), detect 06:10 Tue-Sat, reconcile 06:15 Mon-Fri. Retention stays at 03:00 daily. Collect also mounts a `/tmp` emptyDir (1 Gi).

## Open points

- `invest-buddy-scan-claude` and `invest-buddy-scan-codex` run at 05:30 Mon-Fri, before collect and detect. If the scan is meant to follow detect it needs a later slot.
- The phase A2 client (`src/collectors/sources/client.ts`) has its own request loop. It shares only `secSlot` and `RateLimitLockout`, so it does not get the allow-list or the SEC 403 rule from `http.ts`. It already limits redirects to the original host plus `redirectHosts`.
- `SEC_USER_AGENT` in `invest-buddy-reconcile-config` (`cronjobs.yaml`) still holds `REPLACE_WITH_CONTACT_EMAIL`. SEC blocks placeholder agents. Replace it before unsuspending collect.
- No database was available, so the detect SQL and the Postgres upsert were checked with a fake pool and pure functions only.
