# Lane WEB AND TIERS (IDs W1 to W45)

Synthesis 2026-10-09: this copy is the working version for the window. The master plan is `docs/roadmap/README.md`. Lines starting with "Synthesis note" and the section "Changes by the synthesis" at the end are the only additions to the lane draft in ops-brain. Migration numbers written below (022, 023 and so on) are placeholders: several lanes claim the same numbers, so each PR takes the next free number when it opens (PL7 rule, PL15 lint). IDs from `docs/tasks-open.md` (A1 to I1, for example E1, C2, D1b, D2) are written with the prefix "tasks-open" where they could be read as a data lane ID.

Status 2026-10-09. Written by the web lane planner, read-only inspection of the repo `~/moje/invest-buddy` (main, clean, 8c844e6), the live site and the khtz cluster. No repo edits, no cluster writes were made.

## Goal

Finish the web so that by 2026-12-31 a free tier and a paid tier are built and tested, payment is switchable by a flag and stays off, and a waitlist plus landing page can go public. Legal sign-off, real billing go-live and customer acquisition come after this window.

Two milestones, marked in every task title:
- [WL] needed for the year-end waitlist launch.
- [PAID] needed so paid go-live is a flag flip later. Build and test in the window, do not switch on.

## What exists today (evidence, 2026-10-09)

- Routes under `src/app/[locale]/`: home, dashboard (search plus state filter in `src/components/scanner-table.tsx`), company/[ticker], track-record, portfolio, methodology, sizing, legal/privacy, legal/terms; hidden by `src/proxy.ts`: `scanner` (always 404), `ideas` (needs `IDEAS_PAGE=on`), `owner-allocation` (needs `OWNER_VIEW`). `/en/pricing` returns 404 (curl, 2026-10-09).
- API: `/api/health` and token-protected `/api/ingest/*`. No public write endpoint exists. No auth, no sessions, no middleware for rate limits.
- DB: migration 001 already has `users` (email, locale) and `subscriptions` (status, provider_ref). Both hold 0 rows (SELECT on khtz, 2026-10-09). Latest migration is 021, so new ones start at 022. `score_results` has 178 rows over 5 distinct dates (2026-10-02 to 2026-10-08), `alerts` 33 rows, `instruments` 37, `record_signals` 16. Score history is therefore about one week deep and grows by one row per ticker per scored day.
- `src/components/paywall-segment.tsx` only adds `data-paywall-candidate`. 12 ids in `src/paywall/segments.ts`. No gate, no flag read (`docs/paywall-segments.md`).
- Mail: `src/jobs/digest.ts` has a `Mailer` interface and only `ConsoleMailer`. CronJob `invest-buddy-digest` is suspended (`30 7 * * 2-6`). Last completed run logged 6 alerts to stdout.
- Legal pages are one paragraph each with a "Draft" stamp. Privacy text says "no accounts, analytics or subscription forms" (`src/i18n/messages.ts` lines 391 and 895) and must change before any form ships.
- `src/app/sitemap.ts` lists 8 static routes per locale and no tickers. `src/i18n/metadata.ts` sets title, description, canonical, hreflang, basic openGraph, no image. Web logs show a 404 for `/opengraph-image` (route name `/`, locale `opengraph-image`). No JSON-LD found in `src`.
- Live timing from my Mac, 3 requests per URL, 2026-10-09 evening: home TTFB 1.2 to 2.4 s, dashboard 0.7 to 2.0 s, company NVDA 0.6 to 1.2 s with total 1.7 to 3.6 s, track-record about 1 s, methodology 0.5 to 1.0 s, health 0.15 to 0.28 s. No 5xx in the last 400 web log lines and none in my 33 requests, so the 503s are not reproduced today. Web pod used 242m CPU against a 300m limit while I was probing (`kubectl top`). Postgres 273m.
- Code facts that probably cost time (hypotheses, not measured per query): `src/data/store.ts` and `src/data/ideas-store.ts` create and close a new `pg.Pool` on every call. A company page request runs `instrumentUniverse()` in `src/proxy.ts`, again in `generateMetadata` and the page (`load()` is called twice), `latestScores()` in the layout `Footer` (`src/components/nav.tsx`) plus twice more in `load()`, then `latestPortfolio()`, `latestIdeas()` and `companyReview()`. Every one opens a fresh connection. All public pages are `force-dynamic`.
- Possible cause of 503: the readiness and liveness probes both hit `/api/health`, which returns 503 when the DB query fails (`src/app/api/health/route.ts`). One replica, pinned to `k8s-worker-01` (`web.yaml`). A short DB stall can take the only pod out of the Service. This is an inference from the manifests, not seen in events.
- CI: `.github/workflows/build.yml` runs lint, typecheck, migrate, vitest plus node tests, build, kubeconform. No browser runner. No `e2e/` directory. Response headers on `/en/dashboard` showed no CSP and no HSTS in the first 20 header lines.
- Design source: `DESIGN.md` and `.impeccable/design.json` (tokens, Archivo and Source Serif 4, 2 px radius).

## Source terms checked for this lane (2026-10-09)

| Source | Finding | URL | Status |
|---|---|---|---|
| Stripe restricted businesses | "Investment and brokerage services" and "Other financial services" are listed as restricted (contact sales). Advice, signals and stock-pick subscriptions are not named. "Get rich quick" schemes are prohibited. Consistent with `research/billing.md` (pre-approval needed). | https://stripe.com/legal/restricted-businesses | Fetched, summarised by a fetch tool. Written Stripe OK still required. |
| Stripe fees (Slovakia page) | Standard EEA cards 1.5% + 0.25 EUR, premium EEA 2.8% + 0.25 EUR, Billing 0.7% pay-as-you-go, Tax Basic 0.5% per transaction (no-code) or 0.45 EUR (API). | https://stripe.com/pricing | Fetched, summarised. Recheck before go-live. |
| Resend | Free 3,000 emails per month, 100 per day, 3 domains. Pro 20 USD for 50,000. EU region not confirmed on the page. | https://resend.com/pricing | Fetched. EU region unverified. |
| Amazon SES | Outbound 0.10 USD per 1,000 pay-as-you-go, tiered rates 0.16 USD per 1,000 shown for the Essentials plan, free plan for 6 months for new accounts. EU region prices not on the page. | https://aws.amazon.com/ses/pricing/ | Fetched, plan wording unclear. Verify in calculator. |
| Brevo | Free plan daily limit and branding not retrieved. | https://www.brevo.com/pricing/ | Unverified. |
| Better Auth | MIT licence, about 30.2k GitHub stars, magic-link plugin with `sendMagicLink` callback, default expiry 300 s, single use. pg adapter details not retrieved. | https://www.better-auth.com/docs/plugins/magic-link and https://github.com/better-auth/better-auth | Fetched. Release cadence and pg adapter unverified. |
| Plausible CE | AGPLv3, free to self-host, community support only, claims no cookies. Cloud price not retrieved. | https://plausible.io/self-hosted-web-analytics | Fetched. Cloud price unverified. |
| Umami, Playwright, Auth.js status | Not fetched this session. | n/a | Unverified. Playwright is Apache-2.0 from memory. |
| GDPR, ePrivacy, SK consumer law | Not read. All wording is for the lawyer. | n/a | Unverified. |

## Owner decisions needed

1. Price and plan shape. One paid tier at 9.90 to 14 EUR per month on yearly billing, or other? Monthly plan too? Annual discount? (99-lessons open question 1; 130 section 5.) Blocks W17, W42.
2. Free-tier numbers: days of score history, scanner rows, watchlist size, alert count, weekly versus daily mail. 130 section 8 says "keep the last N days free" and "top N rows" without N. Blocks W30, W32, W33, W34, W36, W38.
3. Which advice-like output stays public until the lawyer answers: idea card action and size tier on company pages, `/sizing`, state labels such as "Setup met (>=18)". 130 section 10 question 3 notes ADR-001 versus the live NVDA text. Blocks W10, W32.
4. Mail provider, sender address and DNS access for SPF, DKIM and DMARC on the sending domain. Blocks W12.
5. Auth approach: Better Auth with magic link (recommended in W27) versus a small hand-built magic link. Blocks W27 to W29.
6. Operator identity for legal pages and invoices (company name, IČO, address). 99-lessons backlog item 3 and tasks-open I1. Blocks W18.
7. Stripe account owner entity and whether to apply for written pre-approval now (a third-party signup, no charge). Blocks W40.
8. Analytics: self-hosted (Plausible CE or Umami, uses cluster capacity) or hosted (spend). Blocks W19.
9. Staging: approve a second namespace or a second database on the same Postgres, plus a hostname and DNS record. Blocks W9, W43.
10. Native Slovak reviewer: who, and paid or not. Blocks W23.
11. Trial and refund: card-free trial or none, 30-day refund line versus the statutory EU withdrawal rules (lawyer). Blocks W42.
12. Czech in scope within the year? This plan assumes EN and SK only.
13. Waitlist consent wording and whether the waitlist also receives the free weekly mail (130 section 9 step 6).

## Suggested order inside the window (a plan, not a fact)

Synthesis note: the week plan in `docs/roadmap/README.md` replaces this order. It puts the waitlist gate in week 10 (2026-12-14 to 2026-12-18) and the paid journey in week 11.

- Weeks 1 to 2 (to about 2026-10-23): W1 to W9, W10, W11.
- Weeks 3 to 6: W12 to W18, W22, W23 start (needs decisions 4, 6).
- Weeks 6 to 8: W19 to W21, W24, W25, W26. Waitlist launch candidate date: about 2026-12-01, leaving a month of buffer. Treat as a target, not a promise.
- Weeks 4 to 12 in parallel only if a second agent exists, otherwise after W26: W27 to W45.
- First 30-day track-record windows close 2026-11-05 (130 section 2, derived from the first record date), so W33 charts stay thin until then.

## Size count

Sizes are given per task: S is 0.5 to 1 day, M 2 to 4, L 5 to 10. Two tasks are L (W37, W40). Rough total about 95 to 130 engineer-agent days across both milestones, so one agent cannot do all 45 in 12 weeks. [WL] tasks alone (W1 to W26) are roughly 45 to 60 days. This is my estimate.

---

## Phase A: foundations and speed

### W1. [WL] Typed feature flags module
Status: done 2026-10-10, PR #88, merged and live.
- Synthesis note: this module is the one flag source. PL32 adds the env schema next to it (`src/config/env.ts`) and the flag document `docs/flags.md`. The payment flag is `BILLING` in every lane (PL32 and PL45 used `PAYMENTS`). D4 adds `RAW_SERIES_DISPLAY` here.
- Why: flags are read ad hoc from `process.env` (`IDEAS_PAGE` in `src/data/ideas-store.ts`, `OWNER_VIEW` in `src/data/owner-allocation.ts`, `DATA_MODE` in many files). `docs/paywall-segments.md` needs `PAYWALL=on`. Every later task adds a flag.
- Steps: 1) add `src/config/flags.ts` exporting `flags()` with `PAYWALL`, `AUTH`, `BILLING`, `WAITLIST`, `ADVICE_OUTPUT`, `IDEAS_PAGE`, `OWNER_VIEW`, each parsed once with zod (already a dependency), default off except where today's behaviour is on. 2) move the two existing flag readers to it, keep their exports. 3) document each flag and its default in `deploy/README.md` and `.env.example`.
- Acceptance: unit tests in `src/config/flags.test.ts` cover unset, on, off, junk value. Existing tests for ideas and owner view still pass. `npm run ci:verify` green. No behaviour change on the live site (compare `/en/dashboard` HTML hash before and after in fixture mode).
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: none.

### W2. [WL] One shared DB pool and per-request cached loaders
Status: done 2026-10-10, PR #89, merged and live.
- Synthesis note: this task creates `src/db/pool.ts`. PL18 extends the same module with `readPool()` and `writePool()` and moves the API routes onto it; there is one pool module.
- Why: the store functions open a new `pg.Pool` per call, and a company request makes about 8 calls (see "Code facts" above). Likely main cause of the 2 to 4 s TTFB reported by the owner (I measured 0.6 to 3.6 s). Hypothesis, to be confirmed by W3.
- Steps: 1) add `src/db/pool.ts` with a lazy module-level `pg.Pool` (max 5, idle timeout, `connectionTimeoutMillis` 3000). 2) change `src/data/store.ts`, `src/data/ideas-store.ts` and the pool users in `src/db/portfolio.ts`, `portfolio-history.ts` callers to use it and stop calling `db.end()`. 3) wrap `latestScores`, `instrumentUniverse`, `latestPortfolio`, `latestIdeas` in React `cache()` so `load()` called from `generateMetadata` and the page runs once per request. 4) keep fixture mode untouched. 5) ensure jobs under `src/jobs` keep their own pools.
- Acceptance: a test counts `pg.Pool` constructions during one render of `company/[ticker]` and expects 1. A test with a fake pool shows one `latestScores` query per request. `src/data/store-stale.test.ts` and `db-provider.test.ts` still pass. After deploy W3's script shows median TTFB lower than the W3 baseline (no promised number).
- Size: M
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: pool shutdown on SIGTERM; add a handler and a test. With one replica and max 5 connections the Postgres connection limit is not a concern, but check `max_connections` (read-only SELECT).

### W3. [WL] Performance baseline script and budget
- Why: owner saw 503s and 2 to 4 s TTFB. I could not reproduce 5xx, and timings were from one machine. A repeatable measurement is needed before and after W2, W4, W5.
- Steps: 1) add `scripts/perf-probe.mjs` that requests a URL list (home, dashboard, company NVDA and AMD, track-record, methodology, in en and sk) N times, prints p50 and p95 TTFB and status counts as JSON. 2) add `docs/perf.md` with the 2026-10-09 numbers above as the first baseline and the method. 3) define a budget table (values proposed by the agent from the baseline, owner confirms). 4) read-only: log the web pod 5xx count from `kubectl logs` in the same note.
- Acceptance: the script runs against production and against a local build; output file committed in `docs/perf.md`; a unit test covers the percentile function in `scripts/perf-probe.test.ts`.
- Size: S
- Depends on: none
- Who: agent
- Approval needed: none
- Risk or open question: results depend on the caller's network. Run it from inside the cluster once (a one-off Job needs cluster write approval) to separate network from app time.

### W4. [WL] Split health probes, add a second replica and right-size limits
- Synthesis note: PL18 later trims `/api/health` and moves freshness dates to the PL29 ops report; the probes added here do not depend on that shape. The staging DB-down check uses the staging from PL14 (W9).
- Why: probes use `/api/health` which depends on the DB (`src/app/api/health/route.ts`). A DB stall removes the only pod from the Service, a plausible source of 503s (inference). `web.yaml` has 1 replica, 300m CPU and 384Mi limits; observed 242m CPU and 75Mi on 2026-10-09.
- Steps: 1) add `/api/live` (no DB, always 200) and `/api/ready` (DB check with 1 s timeout, 200 on success) in `src/app/api/`. 2) keep `/api/health` unchanged for monitoring. 3) point liveness to `/api/live`, readiness to `/api/ready` in `deploy/gitops/gitops/apps/invest-buddy/base/web.yaml`. 4) propose replicas 2 (or keep 1 with higher CPU limit) and a PodDisruptionBudget, both on the same node unless the owner allows scheduling on another node. 5) open the infra PR in `~/moje/infra` (source of truth), mirror per `deploy/README.md`.
- Acceptance: route tests in `src/app/api/live/route.test.ts` and `ready/route.test.ts` (DB up, DB down). After the infra change `kubectl -n invest get deploy` shows the new replicas ready, and a controlled DB-down test in staging (W9) keeps `/api/live` at 200. W3 shows no 5xx over a 30 minute probe.
- Size: S
- Depends on: W3
- Who: agent
- Approval needed: cluster write (infra PR merge, Argo sync)
- Risk or open question: a second replica needs the memory and CPU on `k8s-worker-01`; check node headroom first (`kubectl top node`, read-only). Whether the earlier 503s came from probes or from the ingress is unknown. Check Traefik logs for the time window before claiming a fix.

### W5. [WL] Cache public pages with revalidation
- Why: all public pages are `force-dynamic`, so every visit hits Postgres. Data changes once per scored day (cron Tue to Sat). Landing, methodology and company pages are the SEO surface.
- Steps: 1) replace `export const dynamic = "force-dynamic"` on home, methodology, track-record, legal pages and company pages with `revalidate` of 300 s or tag-based revalidation. 2) add `POST /api/revalidate` protected by `INGEST_TOKEN`, called at the end of `src/jobs/daily.ts` and the judge ingest route to purge `scores` and `ideas` tags. 3) keep `dashboard` dynamic only if W34 needs per-user data, otherwise cache the base rows and filter on the client. 4) do not cache anything that reads a viewer session (later tasks).
- Acceptance: a test shows a second render of the company page does not call the pool (mock). A test for the revalidate route (401 without token, 200 with). Staging check: after a manual daily run the new score date appears within one minute. `x-request-id` log shows near-zero durationMs on a repeat hit.
- Size: M
- Depends on: W2
- Who: agent
- Approval needed: none
- Risk or open question: stale data shown after a failed revalidate call. The existing `stale()` banner in `src/components/data-status.tsx` uses a 3 day rule, so a 5 minute cache is safe. `/sitemap.xml` must not be cached longer than the data.

### W6. [WL] Error pages and request id on every failure
- Why: `src/app/[locale]/error.tsx` and `not-found.tsx` exist, but `src/proxy.ts` returns its own inline HTML 404 with hard-coded styles, and there is no `global-error.tsx`, no 429 or maintenance page.
- Steps: 1) add `src/app/global-error.tsx` (EN and SK by cookie). 2) make the proxy 404 reuse the message catalog and tokens from `DESIGN.md` (keep inline CSS, it runs before layout). 3) show `x-request-id` on error pages ("quote this id") in `error.tsx`. 4) add a 429 template and a 503 maintenance template used by W7 and W45. 5) add EN and SK strings in `src/i18n/messages.ts`.
- Acceptance: tests in `src/app/[locale]/error.test.tsx` render both locales and show the request id. `src/proxy.test.ts` asserts 404 body contains the SK title for `/sk/scanner`. Messages parity test (`src/i18n/messages.test.ts`) passes.
- Size: S
- Depends on: W1
- Who: agent
- Approval needed: none
- Risk or open question: none.

### W7. [WL] Rate limiting and security headers
- Synthesis note: PL33 is merged into this task: one app limiter in `src/security/rate-limit.ts`, used by every route. Added from PL33: a size cap with eviction, and a test that a forged `x-forwarded-for` from the client is not trusted (check Traefik `forwardedHeaders` in infra first). Step 4 (Traefik middleware) moves to PL34, which owns the infra side; the CSP and headers in `next.config.ts` stay here.
- Why: W14 adds the first public write endpoint, and later login and checkout. Today only ingest routes have limits (`read-bounded-body.ts`, bearer token). No CSP or HSTS seen in response headers (checked first 20 header lines of `/en/dashboard`, 2026-10-09). Cluster has a Traefik middleware already (`public-ingress-filter.yaml`).
- Steps: 1) add `src/security/rate-limit.ts`: fixed window keyed by hashed client IP (from `x-forwarded-for` set by Traefik, hash with a server secret) and route, in memory for one replica, Postgres table `rate_limits` fallback if W4 sets 2 replicas. 2) wrap a `withRateLimit(route, limits)` helper for route handlers. 3) add headers in `next.config.ts` `headers()`: CSP (report-only first), `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. 4) optional infra: Traefik `rateLimit` middleware on `/api/` paths other than ingest.
- Acceptance: unit tests for window reset, key hashing (raw IP never stored), 429 with `Retry-After` and the W6 template. `curl -I` on staging shows the headers. CSP report-only run on staging shows no violations on the main pages before enforcing.
- Size: M
- Depends on: W1, W6
- Who: agent
- Approval needed: cluster write only for the optional Traefik middleware
- Risk or open question: Next inline scripts (`themeScript` in `src/app/[locale]/layout.tsx`) need a nonce or hash in CSP. In-memory counters reset on restart and are per replica.

### W8. [WL] Browser e2e smoke tests with Playwright, in CI
- Synthesis note: this task owns Playwright, `e2e/` and the CI job. PL13 becomes the DB-mode project inside this setup, run against the PL12 compose stack.
- Why: there is no browser runner. Unit tests render components, but nothing proves the pages load in a browser, the language switch works, or the new forms submit.
- Steps: 1) add `@playwright/test` as a devDependency (Apache-2.0, unverified this session), `playwright.config.ts`, `e2e/` with specs: home loads in en and sk, dashboard filter by state, company page for a fixture ticker, language switch keeps the path, theme toggle, 404 for unknown ticker returns 404. 2) run against `next start` with `DATA_MODE=fixture` in CI so no DB is needed; a second project against a Postgres service with seeded rows. 3) add an `e2e` job to `.github/workflows/build.yml`, cache browsers, upload traces on failure. 4) add `npm run e2e`.
- Acceptance: CI shows the e2e job green and runs at least 8 tests; a deliberately broken label makes it fail locally. Traces upload on failure. Existing `quality` job time grows by a stated amount (record it in the PR).
- Size: M
- Depends on: W1
- Who: agent
- Approval needed: none
- Risk or open question: the local Node here is broken (see `STATUS.md` lessons), so the agent must use the CI result or the workaround documented there. Pin the action by SHA like the other steps.

### W9. [WL] Staging environment
- Synthesis note: merged with PL11 (the staging decision) and PL14 (the manifests). PL14 is the single build task. The app-side items here (staging flag values, `X-Robots-Tag: noindex`, `robots.txt` disallow, `docs/staging.md` with the promotion path) are part of PL14's acceptance. Tasks that depend on W9 wait for PL14. The database choice (separate Postgres per PL14 or a second database on the prod Postgres per this task) is owner decision 1 in `docs/roadmap/README.md`.
- Why: auth, mail, billing and waitlist forms must not be tested on production. Today only production exists (namespace `invest`).
- Steps: 1) design: second namespace `invest-staging` with web only, DB as a separate database `invest_staging` and role on the existing Postgres, or a separate Postgres (owner picks). 2) add an overlay `overlays/staging` next to `overlays/prod` in `deploy/gitops/gitops/apps/invest-buddy/`, with `DATA_MODE=db`, `AUTH`, `WAITLIST` on, `BILLING` in test mode, mail to a log sink or a test inbox. 3) copy of production data is not allowed for user tables (none exist); scores can be restored from a dump if the owner agrees. 4) add an Argo app, ingress host `staging.invest.filipcsupka.online` (placeholder, owner confirms) with basic auth or IP allow-list via Traefik middleware so crawlers do not index it, plus `X-Robots-Tag: noindex`. 5) add `docs/staging.md` with the promotion path: PR, staging, then prod.
- Acceptance: `kubectl -n invest-staging get pods` shows web ready; `curl -sI https://staging.../en` returns 200 behind the guard and 401 without it; `robots.txt` on staging disallows all; a migration run on staging does not touch prod (check `schema_migrations` in each DB, SELECT only).
- Size: M
- Depends on: W1, PL11, PL14
- Who: agent drafts, owner applies DNS
- Approval needed: cluster write, DNS record, possibly a new secret
- Risk or open question: capacity on the single node; one Postgres with two databases shares failure domain with prod. Cheaper but less isolated. Owner decision 9.

## Phase B: waitlist launch

### W10. [WL] Hide advice-like output behind one flag until a lawyer clears it
- Why: ADR-001 forbids "you should buy" wording and public sizing; `docs/tasks-open.md` G5 asks a lawyer about BUY and ADD labels; 130 section 10 notes the live NVDA page shows "Add about 1/3 of a full position" and `/sizing` is public. A waitlist launch drives traffic to those pages, so this needs a switch before marketing.
- Steps: 1) add `ADVICE_OUTPUT` flag (W1). Default value is the owner's decision 3; recommended default off for the launch. 2) when off: `IdeaCard` (`src/components/idea-card.tsx`) on the company page renders only the rule state, evidence and no action, size tier or plan; `/sizing` returns the neutral explainer or 404 via `src/proxy.ts`; nav link hidden; `src/i18n/score-text.ts` action labels not shown; the digest and later emails use rule-state wording only. 3) keep `docs/paywall-segments.md` in step: add a column "legal gate" for `idea-card` and `sizing-*`. 4) list every string containing buy, add, start, reduce in EN and SK in a checklist file `docs/wording-gate.md` and map each to a flag state.
- Acceptance: component tests for `idea-card` and the company page with the flag off and on (extend `idea-card.test.tsx`, `company/[ticker]/page.test.tsx`): no "Add", "Start position", tier text or plan in the HTML when off. A grep test over rendered EN and SK home, dashboard, company and sizing output fails if a banned phrase list appears while the flag is off. Sitemap omits `/sizing` when off.
- Size: M
- Depends on: W1
- Who: agent
- Approval needed: legal (the lawyer decides when the flag may go on; the flag default is the owner's call)
- Risk or open question: state labels such as "Setup met (>=18)" and "Watch" are rule labels under ADR-001, but a lawyer may disagree. The flag should be able to hide them too; decide with the owner whether that is a second flag.

### W11. [WL] Waitlist data model and owner export
- Synthesis note: this task owns the purge of unconfirmed waitlist rows (PL44 step 3 and W39 step 4 point here). It edits `src/jobs/retention.ts`, so it lands after D5. The new table states its grants (PL19 rule). The superuser risk below is handled by PL19 to PL21 (tasks-open C2).
- Why: PRODUCT and 130 section 9 step 4 call for a waitlist and a price test with no payment. `users` is for accounts and must not be reused for unconfirmed marketing sign-ups (consent differs).
- Steps: 1) migration `022_waitlist.sql`: `waitlist_signups(id, email citext or lower(email) unique, locale, source, price_variant, consent_text_version, status in ('pending','confirmed','unsubscribed'), token_hash, created_at, confirmed_at, unsubscribed_at)`. 2) `src/db/waitlist.ts` repository with create, confirm, unsubscribe, counts. 3) script `scripts/waitlist-report.ts`: counts by status, locale, source and variant, no email addresses printed by default. 4) retention rule documented: unconfirmed rows deleted after 14 days by a step added to `src/jobs/retention.ts`.
- Acceptance: DB tests with `TEST_DATABASE_URL` (as in CI) cover duplicate email, case folding, status transitions, retention delete. `npm run migrate` applies 022 on a clean DB and on a copy of production schema. Report script prints counts only.
- Size: S
- Depends on: D5 (both edit `src/jobs/retention.ts`)
- Who: agent
- Approval needed: none for code; the live migration runs through the web init container on deploy (cluster write via normal release)
- Risk or open question: web uses the superuser role today (tasks-open C2 open). A leak of the web credential exposes emails. Consider C2 before launch.

### W12. [WL] Real mailer adapter and provider choice
- Synthesis note: this is the only mailer. PL25 sends owner alerts through it when the alert channel is email. The provider choice is one owner decision for both lanes.
- Why: `ConsoleMailer` is the only implementation (`src/jobs/digest.ts`). The waitlist, weekly summary and alerts need real delivery with bounce handling.
- Steps: 1) move `Mailer`, `MailMessage` to `src/mail/mailer.ts`, keep the digest import working. 2) implement `HttpMailer` for the chosen provider (Resend HTTPS API, or SES via SMTP, see below) and `SmtpMailer` as fallback, selected by `MAIL_PROVIDER`. 3) add `mail_log(id, kind, to_hash, status, provider_id, created_at)` migration 023 (no body, hashed recipient) for idempotency and debugging. 4) add headers: `List-Unsubscribe` and `List-Unsubscribe-Post` for bulk mails (needs W15). 5) document DNS records needed (SPF, DKIM, DMARC) in `docs/mail.md`. 6) tests with a fake HTTP server.
- Provider options (from the terms table): Resend free 3,000 per month and 100 per day, 20 USD per month for 50,000 (EU region unverified); Amazon SES about 0.10 USD per 1,000 outbound (verify in the AWS calculator, regions and sandbox exit needed); Brevo unverified. At the waitlist scale in 130 (tens to thousands) the free tiers likely suffice, the daily cap of 100 matters for a weekly send to more than 100 people (inference). Recommendation: start with Resend for speed unless the owner needs EU-only processing, then SES in an EU region.
- Acceptance: unit tests for success, 4xx, 5xx retry with backoff, and idempotency (same `kind` plus recipient plus day sends once). A staging send reaches a test inbox with valid SPF, DKIM and DMARC pass shown in headers.
- Size: M
- Depends on: W1, W9
- Who: agent
- Approval needed: third-party signup, new secret (API key as a sealed secret), spend if past the free tier, DNS records by owner
- Risk or open question: sender domain choice and reputation; EU data processing terms of the provider are a lawyer item for the privacy page (W18). Provider terms about financial content were not read.

### W13. [WL] Email template framework with EN and SK confirmation and welcome mails
- Why: `buildDigest` in `src/jobs/digest.ts` builds plain text inline. Four mail kinds will exist (confirmation, welcome, weekly summary, alert), each in two languages, needing one consistent layout and wording that follows ADR-001.
- Steps: 1) `src/mail/templates/` with `layout.ts` (text and simple inline-CSS HTML, no remote images), `confirm.ts`, `welcome.ts`. 2) strings in `src/i18n/messages.ts` under a `mail` key with EN and SK. 3) every mail ends with the operator line, the not-advice line from `m.common.disclaimer`, an unsubscribe link. 4) golden-file snapshot tests for each template and locale, plus a test that no template contains the banned phrase list from W10.
- Acceptance: snapshot tests in `src/mail/templates/templates.test.ts` for en and sk; messages parity test passes; a rendered HTML passes a basic check (no scripts, links absolute, alt text present).
- Size: M
- Depends on: W10, W12
- Who: agent
- Approval needed: none
- Risk or open question: Slovak copy needs the native review in W23.

### W14. [WL] Waitlist signup form and API (double opt-in)
- Synthesis note: PL35 lists the checks for this public write route; PL37 reviews it in its first pass before the waitlist gate.
- Why: 130 section 9 step 4 (landing with waitlist, price variants, no payment).
- Steps: 1) `POST /api/waitlist` in `src/app/api/waitlist/route.ts`: zod body (email, locale, consent boolean, honeypot field, price variant), bounded body (reuse `read-bounded-body.ts`), rate limit (W7), always answer the same neutral success to avoid email enumeration, create pending row, send confirmation mail. 2) `src/components/waitlist-form.tsx` client component with inline errors, EN and SK, consent checkbox text versioned in the catalog. 3) place it on the landing page (W16) and the pricing page (W17). 4) log events without the email (`src/app/api/ingest/request-log.ts` pattern).
- Acceptance: route tests: valid, invalid email, honeypot filled, missing consent, 6th request in a minute gets 429, duplicate email does not send a second mail within 24 hours. Playwright test (W8) submits the form on staging against a fake mailer and sees the success state. No email appears in logs (test greps captured log output).
- Size: M
- Depends on: W7, W8, W11, W12, W13
- Who: agent
- Approval needed: none for build; legal for the consent text before launch
- Risk or open question: bots will hit it; no CAPTCHA planned in the window. If abuse appears, a hosted CAPTCHA is a third-party signup and a privacy trade-off (decision then).

### W15. [WL] Confirm and unsubscribe routes
- Why: double opt-in and one-click unsubscribe are needed before any list mail. Bulk mail rules for the headers are in W12 (provider and mailbox-provider rules not read this session, unverified).
- Steps: 1) `GET /[locale]/waitlist/confirm?token=` (renders a page, confirms on POST or on load with idempotency), `POST /api/waitlist/unsubscribe` for one-click, and a human page `/[locale]/waitlist/unsubscribe`. 2) token = random 32 bytes, stored hashed, expiry 7 days for confirm, non-expiring signed token for unsubscribe. 3) pages in EN and SK with the W6 style, `noindex`.
- Acceptance: tests: valid, expired, reused, tampered token. Unsubscribe is idempotent. Playwright flow: sign up, read the mail from the fake mailer, confirm, unsubscribe, status transitions visible via the W11 report.
- Size: S
- Depends on: W11, W13, W14
- Who: agent
- Approval needed: none
- Risk or open question: link scanners may auto-GET confirm links. Use a confirm button on the page (POST) to avoid false confirms.

### W16. [WL] Landing page for the waitlist, EN and SK
- Synthesis note: the 2026-11-05 date is for 30-day windows. If EN27 changes the windows to 1, 5, 20 and 60 days, the landing text follows the new windows.
- Why: the home page (`src/app/[locale]/page.tsx`) explains the screen and shows a sample sheet but has no signup, no tier summary and no operator identity. 99-lessons: lead with a Slovak, checkable rule score with its whole record in public (130 section 3, options A, B, C).
- Steps: 1) add a hero CTA and a waitlist section using W14, above the fold on mobile. 2) add three proof blocks that exist today: published method (link `/methodology`), dated record with losers (`/track-record`), Slovak pages. Use only facts the site can show: number of tickers from the DB, last score date, record start date. No return claims, no urgency, no "probability of beating the market" wording (99-lessons "things to avoid"). 3) add the past-performance line next to any number (copy from `m.common.disclaimer`). 4) a short free versus paid summary linking to W17. 5) keep the existing sample sheet.
- Acceptance: component and page tests extended in `src/app/[locale]/page.test.tsx` (form present, no banned phrases, EN and SK). Playwright: mobile viewport shows the form without horizontal scroll. Lighthouse run (W24) recorded.
- Size: M
- Depends on: W10, W14, W17
- Who: agent; owner approves copy
- Approval needed: none
- Risk or open question: the record has no outcomes yet (first 30-day windows close 2026-11-05 per 130), so the landing must say so plainly.

### W17. [WL] Pricing page EN and SK (planned prices, waitlist button)
- Why: `/en/pricing` is 404. 99-lessons backlog items 5, 6, 11: EUR including VAT, monthly and yearly with the per-month equivalent and total, one price on every page, renewal and cancel line, 30-day refund line, numeric limits in a free versus paid table, plain cost-versus-portfolio note. 130 section 8 gives the feature map.
- Steps: 1) `src/app/[locale]/pricing/page.tsx` reading prices from `src/config/plans.ts` (single source, used later by W42). 2) table with Free and Paid columns built from the map below. 3) while `BILLING` is off, the paid button reads "Join the waitlist" and uses W14 with the price variant; no checkout. 4) copy rules: no lifetime deal, no registered-user counts, VAT included, one price only. 5) add to nav, sitemap, and the `docs/paywall-segments.md` table.
- Free versus paid map (from 130 section 8, with numbers left as owner decisions): Free: landing, methodology, dashboard, company score and rule breakdown with inputs and sources, public track record signals, portfolio view, sizing guide only if the lawyer clears it, weekly summary mail. Paid: score history beyond N days, daily state-change alerts, scanner rows beyond top N, CSV export, discovery candidates, idea and signal tier detail if cleared. Never public: owner allocation.
- Acceptance: page test for both locales shows the same prices and the limits from `plans.ts`; a test fails if two different prices appear on any page (scan rendered pages); Playwright check of the table on mobile; sitemap test updated.
- Size: M
- Depends on: W10, W14, owner decisions 1 and 2
- Who: agent; owner decides prices and limits
- Approval needed: none for the page; legal on refund and renewal wording before BILLING goes on
- Risk or open question: showing prices before price is validated can anchor the test (130 step 4 splits traffic between 9.90 and 14). Use the variant field in W11.

### W18. [WL] Real privacy notice, terms and operator disclosure
- Synthesis note: the PL43 inventory is the input for this text; the data map lives in `docs/privacy-inventory.md` (PL43).
- Why: legal pages are one paragraph with a "Draft" stamp, and the privacy text claims no forms (`src/i18n/messages.ts` lines 391, 895). `tasks-open.md` I1 says the operator disclosure text is still empty. 99-lessons backlog item 3.
- Steps: 1) draft a privacy notice covering: waitlist email, locale, consent version, mail processor, analytics (W19), retention (unconfirmed 14 days from W11), rights and contact, cookie and local storage list (locale cookie, theme in local storage). 2) draft terms for the informational screen and the future subscription, marked as draft. 3) fill `m.common.operatorDisclosure` once the owner supplies identity. 4) show the draft status on each page until the lawyer signs off. 5) apply the humanizer skill to the final text.
- Acceptance: EN and SK pages render the new sections; a test checks that each processor named in code (`MAIL_PROVIDER`, analytics) appears in the notice; operator disclosure no longer empty in production and `src/components/operator-disclosure.test.tsx` covers it.
- Size: M
- Depends on: W12, W19, PL43, owner decision 6
- Who: agent drafts, owner and lawyer approve
- Approval needed: legal
- Risk or open question: all GDPR and ePrivacy statements here are unverified and for the lawyer. Who is the controller (person or company) is unknown to me.

### W19. [WL] Privacy-friendly analytics
- Why: no analytics exist (privacy page says so). The waitlist test needs page views, source, variant and form conversion. Backlog needs "interviews and price test" evidence.
- Steps: 1) owner picks: Plausible CE self-hosted (AGPLv3, community support, you run upgrades and backups; verified on its page), Umami (unverified), or a hosted plan (price unverified). 2) add a tiny `src/components/analytics.tsx` loading the script only when `ANALYTICS_URL` is set, with CSP update (W7). 3) custom events: `waitlist_view`, `waitlist_submit`, `waitlist_confirm`, `pricing_view`, `variant`. 4) no personal data, no cross-site IDs; update W18 text. 5) if self-hosted: a manifest in the infra repo with its own database.
- Acceptance: with the env unset no script tag is rendered (test). With it set, staging shows events in the tool for each step of the Playwright waitlist flow. Privacy page lists the tool.
- Size: M
- Depends on: W7, owner decision 8
- Who: agent
- Approval needed: third-party signup or spend (hosted), or cluster write (self-hosted)
- Risk or open question: self-hosting adds another thing to run on a node with one Postgres and no backups yet (E1). Hosted costs money.

### W20. [WL] Public SEO: titles, descriptions, structured data, ticker sitemap
- Synthesis note: the sitemap grows with D36 and D37 (150 and then up to 300 names).
- Why: `src/app/sitemap.ts` has no company pages. 99-lessons backlog item 4: crawlable company pages are the organic channel competitors use (Danelfin, Simply Wall St per their notes). Metadata exists through `pageMetadata` but has no JSON-LD.
- Steps: 1) sitemap: add `/{locale}/company/{ticker}` for every row in `instrumentUniverse()` with `lastModified` from the latest score date, via the W2 loader. 2) audit titles and descriptions for each page in EN and SK: unique, within normal length, no claims. 3) JSON-LD in `src/components/json-ld.tsx`: `Organization`, `WebSite`, `BreadcrumbList` on company pages; avoid `Product`, `Review`, `FinancialProduct` or ratings markup that would read as a recommendation. 4) canonical and hreflang already exist; add a test that each page has them. 5) robots: disallow `/api/`, staging noindex.
- Acceptance: `src/app/sitemap.test.ts` expects one entry per instrument per locale (37 rows live today, by SELECT on `instruments`, 36 excluding the benchmark). Tests assert JSON-LD parses and has no rating fields. Google Rich Results and Search Console checks are an owner step, listed in the PR.
- Size: M
- Depends on: W2, W10
- Who: agent
- Approval needed: third-party signup (Search Console), none for code
- Risk or open question: whether public company pages may show Twelve Data derived closes is a licence question (`docs/tasks-accounts-needed.md` row 14). SEO pages should not depend on the chart. Whether pages rank is unknown.

### W21. [WL] Open Graph images
- Why: logs show a 404 for `/opengraph-image`, and metadata has no `og:image`, so shared links look bare. The waitlist relies on sharing.
- Steps: 1) add `src/app/[locale]/opengraph-image.tsx` and `company/[ticker]/opengraph-image.tsx` with `next/og`, tokens from `DESIGN.md`, fonts embedded. 2) company image shows ticker, name, total score and rule state, plus the date. No action or tier text (W10). 3) cache with the page revalidate (W5). 4) set Twitter card metadata in `src/i18n/metadata.ts`.
- Acceptance: tests fetch the image routes and assert 200, `image/png`, size under a stated limit. Manual check in a link preview tool listed in the PR.
- Size: S
- Depends on: W5, W10
- Who: agent
- Approval needed: none
- Risk or open question: font loading inside the runtime image (`readOnlyRootFilesystem`). Test in the container.

### W22. [WL] EN and SK copy audit and removal of English fallbacks
- Synthesis note: the glossary is one file, `scanner/prompts/glossary-sk.md`, because the judge prompt needs it inside the scanner image (`scanner/Dockerfile` copies `scanner/prompts`). EN33 uses the same file. Open PR #82 (presentability gaps on EN/SK pages) touches the same pages; merge or close it first.
- Why: `tasks-open.md` I1: judge-written verdicts, bullets, plan text and evidence labels can still appear in English on SK pages. `src/i18n/messages.ts` is 1015 lines with EN and SK blocks and a parity test.
- Steps: 1) crawl every public route in sk with a script `scripts/copy-audit.mjs` (fixture and a DB copy) and list strings that equal their EN counterparts or contain English stopwords. 2) fix catalog gaps; for judge text use `trade_ideas.translations` (migration 021) and run `npm run backfill:idea-translations`. 3) add the glossary at `scanner/prompts/glossary-sk.md` (score, rule, state names, "criteria broken"), one file shared with EN33. 4) keep the card's explicit fallback marker, never invent a translation.
- Acceptance: the audit script exits non-zero when an SK page shows an untranslated string not on an allowlist; a vitest wraps it for fixtures. List of remaining allowlisted strings is in the PR. `messages.test.ts` passes.
- Size: M
- Depends on: none
- Who: agent
- Approval needed: none (the backfill writes to the live DB, cluster write, dry run by default)
- Risk or open question: machine translation quality; the review is W23.

### W23. [WL] Native Slovak review step
- Synthesis note: one native review session covers this task and EN33 step 4 (10 stored ideas).
- Why: 99-lessons backlog item 7. No Slovak paid screener exists in the search, so language quality is the product edge, and tone errors cost trust.
- Steps: 1) export all SK strings used on public pages and mails to a reviewable sheet (`scripts/export-copy.mjs` writes a CSV with key, EN, SK, page). 2) the reviewer edits SK only; 3) a script imports changes back into `src/i18n/messages.ts` as a diff for review; 4) re-run W22 audit and snapshot tests; 5) record reviewer, date and scope in `scanner/prompts/glossary-sk.md`.
- Acceptance: the import diff touches only SK values (script check); all snapshot and parity tests pass; reviewer sign-off line committed.
- Size: S
- Depends on: W13, W16, W17, W22, owner decision 10
- Who: owner or a hired native reviewer, agent for tooling
- Approval needed: spend (if a paid reviewer), none otherwise
- Risk or open question: a reviewer who is not an investment reader may normalise terms wrongly; give the glossary first.

### W24. [WL] Accessibility and mobile checks
- Why: the app already has a skip link and landmark markup (`layout.tsx`), but no automated check, and the dashboard table is wide (`ScannerTable`). Waitlist traffic will be mostly mobile (assumption).
- Steps: 1) add `@axe-core/playwright` checks to the W8 specs for every public route in both locales and both themes. 2) add viewport tests at 360 and 768 px: no horizontal scroll, tap targets at least 44 px (the design token for buttons already says 44 px). 3) add Lighthouse CI or the Lighthouse CLI to the staging check, storing scores in `docs/perf.md`. 4) fix violations in `src/app/globals.css` and components. 5) keyboard test: sort, filter, language switch, theme toggle reachable.
- Acceptance: axe reports zero serious or critical violations on the listed routes in CI. Lighthouse accessibility and best-practices values recorded (no target promised, the owner sets it). Screenshots at 360 px stored as CI artifacts.
- Size: M
- Depends on: W8, W16, W17
- Who: agent
- Approval needed: none
- Risk or open question: colour contrast in dark theme for `ink-3`; check against `DESIGN.md` tokens.

### W25. [WL] Design polish pass with the impeccable skill
- Why: the owner asked for design polish. `DESIGN.md` and `.impeccable/design.json` record a deliberate "engineering datasheet" direction (Archivo, Source Serif 4, 2 px radius). The new pages (landing section, pricing, forms, error pages) must match it.
- Steps: 1) run the impeccable `audit` on home, dashboard, company, pricing, waitlist and error pages; 2) apply `polish`, `clarify` (UX copy), `harden` (empty and error states) and `adapt` (mobile) for each finding with a ranked list; 3) record deviations in `DESIGN.md` through the documenter flow; 4) keep changes to tokens and CSS, no new libraries.
- Acceptance: audit report committed under `docs/design-audit-2026-q4.md` with each finding marked fixed or deferred; Playwright screenshots before and after attached to the PR; W24 checks still green.
- Size: M
- Depends on: W16, W17, W24
- Who: agent
- Approval needed: none
- Risk or open question: taste calls belong to the owner; the report should list options, not silently change the direction.

### W26. [WL] Waitlist launch checklist and rollback runbook
- Synthesis note: PL45 holds the go or no-go checklist and the drill; this runbook and `scripts/preflight.mjs` are lines in that checklist.
- Why: launching marketing is an irreversible public act (indexing, mails). A short runbook avoids missed steps.
- Steps: 1) `docs/launch-waitlist.md`: flags to set, order (staging soak, DNS and mail checks, analytics, legal text live, advice flag state, sitemap submit), who does what, how to pause signups (a `WAITLIST` off state shows a "closed" notice), how to stop mail, how to export and delete data. 2) a read-only preflight script `scripts/preflight.mjs` that checks live: `/api/ready` 200, sitemap includes tickers, `/en/pricing` 200, privacy page mentions the mail processor, SPF record present (DNS query), headers present, no banned phrases when `ADVICE_OUTPUT` is off.
- Acceptance: script runs against staging and prod and prints pass or fail per check; tested with a mocked fetch in `scripts/preflight.test.ts`; runbook reviewed by the owner.
- Size: S
- Depends on: W4, W7, W10, W12, W14 to W21
- Who: agent
- Approval needed: none
- Risk or open question: the lawyer may not have signed off by launch. The runbook must state which pages are live in that case (decision 3).

## Phase C: paid tier built and switchable

### W27. [PAID] Auth decision record and spike
- Synthesis note: follow the PL35 checklist; PL37 reviews the result. Staging comes from PL14 (W9).
- Why: no auth exists. Options that fit Next.js 16, Postgres and the cluster: (a) Better Auth with the magic-link plugin (MIT, 30.2k stars, `sendMagicLink` callback, single-use token, default 5 minute expiry, per its docs fetched 2026-10-09; pg adapter and release cadence unverified), (b) Auth.js (status unverified this session), (c) a small hand-built magic link on the existing `users` table with a `sessions` table. Password-less avoids storing passwords and password resets. Recommendation: (a) behind `AUTH`, because sessions, cookie flags, CSRF and rate limits are easy to get wrong, with (c) as fallback if the pg adapter does not fit.
- Steps: 1) a throwaway branch with Better Auth, pg `Pool` from W2, magic link sending via W12 on staging. 2) check: cookie flags (Secure, HttpOnly, SameSite), session lifetime, token single use, behaviour with 2 replicas (needs shared DB storage, not memory), Next 16 `proxy.ts` interplay, bundle size. 3) write `docs/adr-auth.md` with the choice, the rejected options and the exit path. 4) list what the library creates (tables) so W28 can write migrations.
- Acceptance: the ADR exists; a spike test shows login via the fake mailer on staging, session cookie set with the flags above, logout clears it, a reused link fails. No production deploy.
- Size: S
- Depends on: W9, W12
- Who: agent; owner decides (decision 5)
- Approval needed: none (library dependency review only)
- Risk or open question: a young dependency in the login path. Dependabot and `npm audit` already run in CI. Account recovery is simple with magic links, but loss of email access locks the user out.

### W28. [PAID] Auth and entitlement migrations
- Synthesis note: role split for the new tables follows PL19 (tasks-open C2).
- Why: `users` has only email, locale, created_at; `subscriptions` has status, provider_ref, started_at, ends_at (migration 001). Both are empty (SELECT, 2026-10-09), so they can change safely.
- Steps: 1) migration `024_auth.sql`: extend `users` (email_verified_at, last_login_at, deleted_at, marketing_consent_at nullable), add the library's tables and `sessions` as decided in W27, unique lower(email). 2) migration `025_entitlements.sql`: `entitlements(id, user_id, tier, source in ('stripe','manual','trial','owner'), starts_at, ends_at, created_at)` and an index on `(user_id, ends_at)`. 3) link a confirmed waitlist email to a user on signup (optional join by email hash). 4) repositories in `src/db/users.ts`, `src/db/entitlements.ts`.
- Acceptance: DB tests (`TEST_DATABASE_URL`) for create user, case-insensitive email, soft delete, entitlement lookup at a given time with overlapping rows. Migration applies on a copy of the production schema. Rollback note in the PR.
- Size: M
- Depends on: W27
- Who: agent
- Approval needed: cluster write (live migration on release)
- Risk or open question: tasks-open C2 (role split) is open; auth tables should be readable and writable only by the web role. Coordinate with that task.

### W29. [PAID] Login pages, sessions and a viewer helper
- Synthesis note: follow the PL35 checklist; PL37 reviews the result.
- Why: users need to sign in and server components need to know the viewer.
- Steps: 1) `/[locale]/login` (email form, neutral response), `/[locale]/login/check` (instructions), `/api/auth/*` mounted from the library, `/[locale]/logout`. 2) `src/auth/viewer.ts` with `getViewer()` returning `{ id, email, locale, tier } | null`, cached per request. 3) `src/proxy.ts`: do not do DB session reads on every public request (cost, see W2); read the session only in routes that need it. 4) nav shows Login or Account only when `AUTH` is on. 5) login mail template through W13. 6) rate limit login requests (W7).
- Acceptance: Playwright on staging: request link, read the fake mail, follow it, see the account link, log out. Tests: no session read on `/en/methodology` (spy), 429 after N requests, link expires, link single use. EN and SK strings added.
- Size: M
- Depends on: W6, W7, W13, W28
- Who: agent
- Approval needed: none
- Risk or open question: caching public pages (W5) must not leak per-viewer UI. Keep the nav login state in a client island that fetches `/api/me`.

### W30. [PAID] Entitlements model and `can()` check
- Why: one place must answer "may this viewer use feature X". `docs/paywall-segments.md` says `PaywallSegment` should be the single place that checks subscription access. A feature list keyed by tier avoids scattering `if (paid)`.
- Steps: 1) `src/entitlements/features.ts` listing features (`score-history-full`, `alerts-daily`, `scanner-rows-full`, `csv-export`, `discovery`, `idea-detail`) with the free limits as numbers read from `src/config/plans.ts` (owner decision 2). 2) `can(viewer, feature)` and `limit(viewer, feature)` pure functions. 3) `getTier(userId, at)` reading W28 entitlements. 4) owner tier for the owner account only. 5) when `PAYWALL` is off, `can()` returns true for public features, preserving today's behaviour.
- Acceptance: unit tests table-driven over tiers, flag states, expired entitlement, trial, manual grant. No feature id referenced in the pages that is missing from the list (type check).
- Size: S
- Depends on: W1, W28
- Who: agent
- Approval needed: none
- Risk or open question: free-tier numbers are an owner decision; use placeholders marked in the file until then.

### W31. [PAID] Implement the `PaywallSegment` gate
- Why: `src/components/paywall-segment.tsx` only tags markup. `docs/paywall-segments.md` requires: gate behind `PAYWALL=on`, children rendered as today with the flag absent, a free explanation and route to subscription outside hidden sections, tests for both flag states.
- Steps: 1) make `PaywallSegment` an async server component reading `getViewer()` and `can()`; map each id in `src/paywall/segments.ts` to a feature. 2) when locked, render a teaser card (what is behind it, link to pricing and login) instead of the children, without sending the hidden data to the client (do the check before the data loader runs where the loader is expensive). 3) keep the `data-paywall-candidate` attribute. 4) `robots` and structured data must not include locked text.
- Acceptance: extend `src/paywall/segments.test.tsx`: flag off renders children exactly as before (snapshot), flag on and anonymous renders teaser, flag on and paid renders children, view-source on the locked page contains none of the locked text (test on rendered HTML). Both locales.
- Size: M
- Depends on: W29, W30
- Who: agent
- Approval needed: none
- Risk or open question: wrapping a single element uses `cloneElement` today; a locked state changes DOM shape and may break CSS layout. Cover with the Playwright screenshots.

### W32. [PAID] Page-by-page tier map applied (company, track record, portfolio, sizing, ideas)
- Synthesis note: EN27 and EN28 change the same track record page and segment text first; this task lands after them.
- Why: 130 section 8 differs from `docs/paywall-segments.md`: signals free, older per-ticker history paid; portfolio free (ADR-001 disclosure); sizing free pending lawyer; idea-card held behind the legal gate and then paid if cleared; rule breakdown and inputs free. The owner chooses which map wins (decision 2 and 3).
- Steps: 1) record the chosen map in `docs/paywall-segments.md` (one table: segment, tier, legal gate). 2) company page: keep score, rule breakdown, inputs free; wrap `idea-card` per decisions; history block uses W33. 3) track record: `track-record-signals` free, `track-record-history` limited to N days for free; `track-record-benchmark` free. 4) portfolio and sizing segments free, markers kept. 5) owner segments stay behind `OWNER_VIEW` regardless of tier.
- Acceptance: a test per page and tier (anonymous, free, paid, flag off) asserts which segment ids render content or teaser, generated from the single map table so doc and code cannot drift. Playwright check of one locked and one unlocked page.
- Size: M
- Depends on: W10, W31, W33, EN28 (same track record files)
- Who: agent; owner decides the map
- Approval needed: legal for any item under the advice gate
- Risk or open question: gating the track record history may look like hiding losers (99-lessons: complete dated record including losers is the trust asset). Keep every signal public and gate only older per-ticker score snapshots.

### W33. [PAID] Score history per ticker
- Synthesis note: the query lives in `src/data/history.ts` as `scoreHistory`, the read model that D43 later extends, not in a separate `src/db/score-history.ts`.
- Why: 130 section 8: history depth is a standard paid lever (Finviz, Fundamenty, Koyfin per their notes), "paid, keep the last N days free". Data exists in `score_results` (178 rows, 5 dates) and `record_snapshots` (103 rows), but no per-ticker history view exists.
- Steps: 1) `src/data/history.ts`: `scoreHistory(ticker, days)` returning date, total, F, T, M, state from `score_results` where `audit ? 'scanRunId'` (same filter as `store.ts`). 2) component `src/components/score-history.tsx` (SVG, reuse patterns from `src/components/chart.tsx`) with an accessible table fallback. 3) add it to the company page under a new segment id `score-history` in `src/paywall/segments.ts`. 4) free viewers see the last N days (W30), paid see all. 5) empty state when fewer than 2 points, honest text that history started 2026-10-02.
- Acceptance: unit tests for the query shape (DB test) and for N-day truncation; component test renders table and chart for 1, 2 and 60 points; page test for free versus paid; EN and SK strings.
- Size: M
- Depends on: W2, W30 (for limits)
- Who: agent
- Approval needed: none
- Risk or open question: five days of data today, so the feature looks empty until data accumulates. Keep it behind the flag until at least a few weeks exist. Score rules were versioned (`SIGNAL_RULES`), so history may mix rule versions; show the rules version or a marker (check `audit` content first, unverified).

### W34. [PAID] Scanner with filters
- Synthesis note: the discovery list reads the weekly record from EN37. This task is on the cut list in `docs/roadmap/README.md`.
- Why: `/scanner` is deliberately 404 (`src/proxy.ts`, `src/app/[locale]/scanner/page.tsx`); the dashboard already has search and a state filter (`src/components/scanner-table.tsx`). 130 says the scanner is for later, "Free-limited (top N rows)" once discovery widens the universe. Universe is 37 instruments today, so "top N rows" is a weak lever until discovery adds names (cross-lane).
- Steps: 1) extend the table with filters: score range, sector, minimum F, T, M, state, held, source (guide, discovery, extension). 2) URL query state (`?state=watch&min=12`) so views are shareable and crawlable pages stay clean (`noindex` on filtered URLs, canonical to base). 3) limit rows for free viewers per W30 with a teaser row. 4) route: make `/scanner` live behind a flag, or keep dashboard as the single table and remove the 404 rule (owner picks, default keep one table). 5) add discovery candidates as a separate paid list when the data lane exposes them (not built here).
- Acceptance: component tests for each filter and combination; URL round trip test; free viewer sees N rows plus teaser (page test); Playwright test applies two filters on mobile; a11y check (W24) stays green.
- Size: M
- Depends on: W30, W31
- Who: agent
- Approval needed: none
- Risk or open question: with 37 tickers a row limit gives little value. The honest paid levers may be alerts and history instead. Owner decision.

### W35. [PAID] CSV export
- Why: 130 section 8: export is "Later, Paid" for heavy users; `docs/paywall-segments.md` lists "History export" as a future candidate.
- Steps: 1) `GET /api/export/scores.csv?from=&to=&ticker=` requiring `can(viewer,'csv-export')`, streaming, bounded date range, UTF-8 with BOM for Excel, locale-aware header names via a param. 2) first rows or a trailing note carry the not-advice line, the methodology URL and the rules version. 3) only fields already public on the site (no raw provider series, per `docs/data.md` rule that raw Twelve Data series is never published; no owner values). 4) rate limit and audit log (`export_log` counts, no content).
- Acceptance: route tests: anonymous 401, free 403 with the paywall flag on, paid 200 and a parseable CSV, range cap, no `closes` column (test greps header). Playwright downloads the file as a paid test user.
- Size: S
- Depends on: W30, W33
- Who: agent
- Approval needed: legal (what may be redistributed, see data licence question)
- Risk or open question: scores are derived from licensed inputs; export lets a user rebuild a dataset. The data licence terms decide this (tasks-accounts-needed rows 1, 2, 14).

### W36. [PAID] Watchlist and saved screens
- Why: watchlists and saved filters are the usual habit feature (TradingView limits free users to 1 watchlist and 3 alerts per its note; Sharesight and Simply Wall St cap portfolios, per 99-lessons). They also give alerts (W37) something to attach to.
- Steps: 1) migration `026_watchlists.sql`: `watchlist_items(user_id, ticker, created_at)` and `saved_screens(id, user_id, name, query jsonb, created_at)` with limits enforced in code. 2) API routes `POST/DELETE /api/watchlist`, `POST/DELETE /api/screens` with session and CSRF protection and W7 limits. 3) UI: star button on company page and table rows, "My watchlist" filter on the dashboard, saved screens menu using the W34 URL state. 4) free limit and paid limit from W30.
- Acceptance: DB and route tests for add, duplicate, remove, limit reached (402 or 403 with a teaser), other user's data not readable (test with two users). Playwright: add three tickers, reload, see them.
- Size: M
- Depends on: W29, W30, W34
- Who: agent
- Approval needed: cluster write for the live migration at release
- Risk or open question: watchlists are personal data in the GDPR sense (what a user follows); include in W39 export and erasure. They must not feed back into signals (ADR-001: same output for every user).

### W37. [PAID] Alerts engine
- Synthesis note: the CronJob slot comes from the D40 slot table; PL27 adds it to the watchdog schedule map.
- Why: alerts are the main paid lever (MVP.md, 130 section 8, finviz-elite and justetf notes). Today `alerts` rows are written by `daily` (33 rows live) and `digest` only logs them to stdout (`src/jobs/digest.ts`).
- Steps: 1) migration `027_alert_prefs.sql`: `alert_prefs(user_id, channel email, frequency in ('weekly','daily','off'), scope in ('watchlist','all'), states text[], locale)` and `alert_deliveries(user_id, ticker, as_of, kind, sent_at, UNIQUE(user_id,ticker,as_of,kind))` for idempotency. 2) new job `src/jobs/alerts.ts` (add to `build:jobs` in `package.json`, the `test -f` list in `Dockerfile` and a CronJob after daily scoring, order check in `src/jobs/cronjob-order.test.ts`): read `PostgresScoreRepository.alerts(asOf)`, match to preferences and entitlements, build messages with W13 templates, send with W12, record deliveries. 3) replace the digest path: keep `buildDigest` for the owner or remove after migration. 4) state changes only; wording follows ADR-001 (rule states, not actions) and respects `ADVICE_OUTPUT`. 5) quiet failure mode: provider down means retry next run, never double send.
- Acceptance: unit tests with fake repo and mailer: free user gets weekly only, paid daily, watchlist scope filters, a rerun sends nothing twice, user without confirmed email skipped, unsubscribed skipped. A DB test for the unique key. `cronjob-order.test.ts` includes the new job. A staging run on a copy of the day's alerts sends to the test inbox only.
- Size: L
- Depends on: W12, W13, W28, W30, W36
- Who: agent
- Approval needed: cluster write (new CronJob in infra), new secret reuse from W12
- Risk or open question: day-of-week schedule: scoring runs Tue to Sat (cron `25 4 * * 2-6`), so Monday has no daily mail. A mail volume spike when many tickers change state on one day needs a cap per user per day. Mailbox providers' bulk rules unverified.

### W38. [PAID] Alert preferences UI and weekly summary template
- Why: users must control frequency and scope, and the free tier gets a weekly summary (130 section 8, and step 6 of its 90 day plan: a free weekly Slovak email of state changes to the waitlist).
- Steps: 1) `/[locale]/account/alerts` page (needs W29): frequency, scope, states, test-send button limited to one per hour. 2) `src/mail/templates/weekly.ts` and `alert.ts` (EN, SK): list state changes with previous and current state, a link per ticker, the not-advice line, unsubscribe. 3) weekly job mode of `alerts.ts` (W37) that also serves the waitlist with a separate consent flag if the owner chooses (decision 13). 4) snapshot tests.
- Acceptance: snapshot tests for both templates and locales with 0, 1 and 20 changes (empty week text matches the style of the existing "No rule states changed today" line); page tests for saving prefs and for the free versus paid options; Playwright flow on staging: change prefs, trigger test-send, see the mail in the fake mailer.
- Size: M
- Depends on: W13, W29, W37
- Who: agent
- Approval needed: none
- Risk or open question: sending marketing mail to waitlist members who only agreed to "notify me about launch" would exceed their consent. Keep the consent text versioned (W11).

### W39. [PAID] Account page and GDPR basics
- Synthesis note: PL44 builds the export and erasure core (`src/privacy/registry.ts` and the scripts); this task adds the account page and routes on top of it. The data map is PL43's `docs/privacy-inventory.md`. Step 4's waitlist purge is W11.
- Why: the account page and data-subject controls are needed once emails and watchlists are stored. Details of the law are for the lawyer (unverified).
- Steps: 1) `/[locale]/account`: email, language, plan and renewal date (from W30 and later W41), manage billing button (hidden until BILLING), link to alert prefs, buttons for "download my data" (JSON) and "delete my account". 2) `src/db/dsr.ts`: export of user, preferences, watchlist, screens, waitlist row, mail log metadata; erasure that deletes or anonymises user rows and sessions, and unsubscribes the waitlist row, keeping only what the law requires (lawyer decides what, for example invoices). 3) a data map `docs/data-map-users.md`: what is stored, where, why, how long, which processor. 4) retention job: delete unconfirmed waitlist rows (W11) and sessions older than the cap.
- Acceptance: DB tests: export contains only that user's rows; erasure removes them and leaves no email in `users`, `waitlist_signups`, `alert_prefs` or `mail_log` (hashes only); a logged-in Playwright test downloads the file and deletes the account, then login with the same email creates a new user. Page tests for both locales.
- Size: M
- Depends on: W28, W29, W36, W38, PL44
- Who: agent
- Approval needed: legal
- Risk or open question: what must be kept after a paid period (tax records) is unknown here; billing data in Stripe also needs a deletion path.

### W40. [PAID] Stripe in test mode behind the BILLING flag
- Synthesis note: follow the PL35 checklist; PL37 reviews the result. Staging comes from PL14 (W9).
- Why: `research/billing.md`: Paddle bans investment advice and trading signals, Lemon Squeezy unclear, Stripe needs pre-approval for the restricted category (confirmed on Stripe's restricted-businesses page on 2026-10-09, see terms table); recommended Stripe Billing plus Stripe Tax, keep a fallback processor. Roadmap gate: Stripe written OK before paid launch.
- Steps: 1) owner opens a Stripe account in test mode (no activation needed for test mode, unverified) and starts the written pre-approval conversation in parallel. 2) `src/billing/stripe.ts` thin wrapper (official `stripe` package, to be added) with an interface `BillingProvider` so a fallback processor can be swapped in. 3) `POST /api/billing/checkout` creating a Checkout Session for the plan in `src/config/plans.ts` with `customer_email` from the viewer, EUR, tax-inclusive prices, locale `sk` or `en`; `POST /api/billing/portal` for the customer portal. 4) all routes return 404 unless `BILLING=test` or `on`, and refuse live keys when `BILLING=test` (check key prefix). 5) secrets via sealed secret `invest-buddy-billing`, template under `deploy/gitops/gitops/sealed-secrets/invest/`.
- Acceptance: unit tests with a fake `BillingProvider`: checkout request shape, refusal without a session, refusal with a live key in test mode, 404 when the flag is off. A staging run completes a Checkout with Stripe's test card and returns to `/account` with a pending state. Fees noted from the pricing page (1.5% + 0.25 EUR standard EEA cards, Billing 0.7%, Tax 0.5% or 0.45 EUR, 2026-10-09) are in `docs/billing.md`, to be re-checked at go-live.
- Size: L
- Depends on: W9, W29, W30, owner decision 7
- Who: agent builds, owner holds the Stripe account
- Approval needed: third-party signup, new secret, legal (Stripe pre-approval before any live key)
- Risk or open question: Stripe may refuse or restrict the business; a fallback provider is not evaluated here (Paddle excluded by its policy per billing.md, Lemon Squeezy unclear, others not researched). Stripe Tax and OSS VAT registration need an accountant (billing.md).

### W41. [PAID] Webhooks to entitlements
- Synthesis note: follow the PL35 checklist; PL37 reviews the result.
- Why: payment state must drive access, idempotently, with no manual step.
- Steps: 1) `POST /api/billing/webhook` verifying the Stripe signature on the raw body (use `read-bounded-body.ts`), handling `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. 2) table `billing_events(id, provider_event_id unique, type, processed_at)` for idempotency (migration 028). 3) map events to `subscriptions` rows (existing table: `status`, `provider_ref`, `ends_at`) and to `entitlements` (source `stripe`). 4) grace period on failed payment, configurable. 5) log events without personal data.
- Acceptance: tests with recorded Stripe event fixtures: duplicate event ignored, out-of-order events end in the right state, bad signature 400, cancel at period end keeps access until `ends_at`, refund path removes access when decided. Stripe CLI `trigger` run on staging shows entitlement rows change.
- Size: M
- Depends on: W28, W30, W40
- Who: agent
- Approval needed: cluster write (webhook route is public, Traefik must pass it; check `public-ingress-filter.yaml` only blocks `/api/ingest`), new secret (webhook signing secret)
- Risk or open question: event field shapes depend on the Stripe API version pinned; pin it explicitly and record it.

### W42. [PAID] Checkout wiring on the pricing page, trial, refund and VAT lines
- Synthesis note: follow the PL35 checklist; PL37 reviews the result.
- Why: W17 shows prices and a waitlist button. When `BILLING` is on the button must start checkout. 99-lessons: renewal and cancel line, 30-day refund line, VAT included, trials without a card that fall back to free (Simply Wall St 7 days, Stock Rover 14 days per notes).
- Steps: 1) button logic in `src/app/[locale]/pricing/page.tsx`: waitlist when `BILLING` off, login then checkout when on. 2) show renewal date, cancel path and refund wording from `src/config/plans.ts` (text pending lawyer). 3) trial: implement as an entitlement with source `trial` created without a card at first login if the owner picks it (decision 11), expiry back to free through W30. 4) VAT: Stripe Tax in test mode, prices shown including VAT.
- Acceptance: page tests for flag off and on; entitlement trial expiry test; Playwright on staging: logged in user clicks Subscribe and reaches Checkout (test mode URL). Both locales show the same numbers (existing test from W17).
- Size: M
- Depends on: W17, W40, W41, owner decisions 1 and 11
- Who: agent
- Approval needed: legal (refund, withdrawal, renewal terms)
- Risk or open question: EU withdrawal rights for digital services and how they interact with a 30-day refund promise are unverified and for the lawyer (`research/regulatory.md` lists consumer 14-day withdrawal as open).

### W43. [PAID] Paid journey end-to-end on staging
- Why: "built and tested" is the milestone. A single scripted journey proves auth, gate, billing and alerts work together, with payment test mode only.
- Steps: 1) Playwright spec `e2e/paid-journey.spec.ts`: anonymous sees a teaser, join waitlist, login by magic link, subscribe with the Stripe test card, see locked segments open, change alert prefs, receive the alert mail in the fake mailer after a manual alerts run, cancel in the portal, access ends at period end (simulate with a webhook fixture), delete account. 2) run nightly in CI against staging or on manual dispatch, secrets from repository secrets. 3) record results in `docs/paid-readiness.md` with a checklist table.
- Acceptance: the spec passes twice in a row on staging; a flag-off run (BILLING off, PAYWALL off) shows the production-like public behaviour unchanged (existing tests). Checklist rows each link to a test.
- Size: M
- Depends on: W8, W9, W31 to W42
- Who: agent
- Approval needed: new secret (CI secrets for staging), third-party use (Stripe test mode)
- Risk or open question: flaky browser tests on mail and webhook timing; poll with timeouts.

### W44. [PAID] User data in backups and a restore test
- Synthesis note: tasks-open E1 is done by PL22, PL23 and PL24; this task depends on PL24.
- Why: `docs/tasks-open.md` E1: the backup CronJob is suspended and no off-node dump exists; Postgres sits on one node's `local-path` volume. Once emails and subscriptions exist, losing them is a real incident.
- Steps: 1) confirm E1 is done or do it first (owner secrets, restic target). 2) verify the dump includes the new tables from W11, W28, W36, W37, W41. 3) restore into a scratch database in staging and run the W43 login test against it. 4) document RPO and RTO as measured. 5) exclude `mail_log` or others only if the data map says so.
- Acceptance: one dump stored off-node and one restore test written up with timings; row counts of user tables match between source and restore (SELECT only).
- Size: S
- Depends on: W28, W36, W41, PL24 (tasks-open E1)
- Who: agent with owner (secrets)
- Approval needed: cluster write, new secret
- Risk or open question: E1 belongs to another lane; if it slips, paid go-live must not happen.

### W45. [PAID] Go-live switch runbook and final readiness review
- Synthesis note: PL37's signed security review is one of the pre-conditions.
- Why: the owner wants billing switchable after the window, once legal, billing approval and customers are in place. A runbook keeps the switch a flag flip.
- Steps: 1) `docs/go-live-paid.md`: pre-conditions checklist (lawyer answer on BUY and ADD labels and the paid feed, data licence with display rights, Stripe written OK and live keys, operator identity, VAT registration, backups tested), the exact flags and order (`ADVICE_OUTPUT`, `AUTH`, `PAYWALL`, `BILLING`), smoke tests, how to stop (flags off returns pages to free, existing subscribers keep access), rollback, support contact. 2) extend `scripts/preflight.mjs` (W26) with paid checks. 3) a last review table: every [PAID] task with its test link and status.
- Acceptance: preflight passes on staging with all flags on in test mode; the review table has no unchecked row or each open row has an owner and a reason; owner signs the document.
- Size: S
- Depends on: W26, W43, W44
- Who: agent drafts, owner signs
- Approval needed: legal, spend (live billing is out of this window)
- Risk or open question: the pre-conditions list holds items outside this lane (data licence, lawyer). They may not be satisfied for months; the runbook must say so plainly.

## Milestone map

### SK1. Insider filings and SEC events
- Why: SEC Form 4 history makes reported insider activity inspectable for each company in the screening universe.
- Steps: show recent transactions with insider, role, code, shares, reported value, date and SEC filing link on `/insiders`; make the ticker panel reusable on a company page; explain P, S, A, M and F in English and Slovak.
- Acceptance: only rows with display permission appear, the source can be opened at SEC.gov, the route can be turned off, and both languages pass the dictionary parity test. This page is informational screening under ADR-001 and does not depend on `ADVICE_OUTPUT`.
- Depends on: D20 and migration 045.
- Approval needed: migration 048 before live use.


| Milestone | Tasks |
|---|---|
| [WL] waitlist launch | W1 to W26 |
| [PAID] paid ready, payment off | W27 to W45 |
| Needed earliest for traffic safety | W2, W3, W4, W5, W7, W10 |

## Known gaps in this plan

- No live check of mail deliverability, of Stripe account behaviour or of Better Auth with this Next.js version was made.
- 503s were not reproduced; W4 targets a plausible cause only.
- Competitor and provider prices come from page summaries on 2026-10-09 and must be rechecked before use in public text.
- Every legal and GDPR statement is a question for the lawyer.

## Changes by the synthesis

- Header: added the synthesis line (working copy, migration numbers are placeholders).
- Suggested order: replaced by the week plan in `docs/roadmap/README.md`.
- W1: one flag module for all lanes; payment flag name is `BILLING` (PL32 and PL45 used `PAYMENTS`); D4 adds `RAW_SERIES_DISPLAY`.
- W2: owns `src/db/pool.ts`; PL18 extends it.
- W4: cross-reference to PL18 and PL29 for the `/api/health` shape; staging is PL14.
- W7: PL33 merged here (one limiter in `src/security/rate-limit.ts`, eviction and forged-header tests added); step 4 moves to PL34.
- W8: PL13 becomes the DB-mode project inside this setup.
- W9: merged with PL11 and PL14; PL14 is the build task; dependency line adds PL11 and PL14.
- W11: owns the waitlist purge; lands after D5 (dependency added); grants per PL19.
- W12: the only mailer; PL25 uses it.
- W14, W27, W29, W40, W41, W42: follow the PL35 checklist; PL37 reviews.
- W16: the 2026-11-05 date follows EN27 if the windows change.
- W18: added dependency PL43 (inventory is the input).
- W20: sitemap grows with D36 and D37.
- W22, W23: one glossary file, `scanner/prompts/glossary-sk.md`, shared with EN33 (step 3 and step 5 paths changed); one review session with EN33; open PR #82 touches the same pages.
- W26: a line in the PL45 checklist.
- W28: role split follows PL19.
- W32: lands after EN27 and EN28 (same track record files); dependency EN28 added.
- W33: query moved to `src/data/history.ts` as `scoreHistory`, the module D43 extends.
- W34: reads the EN37 weekly record; on the cut list.
- W37: CronJob slot from the D40 table.
- W39: built on the PL44 core; data map is PL43's file; dependency PL44 added.
- W44: "E1" replaced by PL24 (PL22 to PL24 are tasks-open E1).
- W45: PL37's signed review is a pre-condition.
