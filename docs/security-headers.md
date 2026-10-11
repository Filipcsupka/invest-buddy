# Security headers and rate limit (W7)

## Headers

Set for every route from `next.config.ts` through `src/security/headers.ts`.

- `Content-Security-Policy`: same-origin default, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri` and `form-action` same-origin. Scripts and styles allow `'unsafe-inline'` because Next streams inline hydration scripts and the locale layout has an inline theme script. A nonce or hash policy is a follow-up; `unsafe-eval` is added outside production only.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with camera, microphone, geolocation, payment and USB off.
- `Strict-Transport-Security: max-age=15552000`, production only. Traefik terminates TLS for the host (`deploy/gitops/gitops/apps/invest-buddy/base/ingress.yaml`, cert-manager). No `includeSubDomains` or `preload`.

When a third-party script or image host is added (analytics, W19), extend `src/security/headers.ts` in that PR.

## Rate limit

`src/security/rate-limit.ts`, called first in `src/proxy.ts` (matcher now includes `/api/:path*`).

- In-memory token bucket per client and class (pages, API). State is per process: it resets on restart and is per replica. At two replicas the effective limit doubles.
- Defaults: 120 page requests per minute and 60 API requests per minute per client; the bucket size equals the per-minute rate. Env: `RATE_LIMIT_PAGES_PER_MIN`, `RATE_LIMIT_API_PER_MIN`, `RATE_LIMIT=off`.
- Client key: SHA-256 of the address plus a salt (`RATE_LIMIT_SECRET`, random per process if unset); the raw address is not stored. Traefik appends the peer address to `x-forwarded-for`, so the key is the entry `RATE_LIMIT_TRUSTED_HOPS` (default 1) from the right; entries a client adds are ignored. Traefik `forwardedHeaders` trust was not checked against the live cluster; PL34 owns that.
- Exempt: `/api/health`, and `/api/ingest/*` requests that carry a bearer token (the route still checks the token).
- Over the limit: `429` with `Retry-After`; JSON for `/api/*`, plain text (EN and SK) for pages. The W6 template replaces the text body when it lands.
- At most 10,000 keys per limiter; the least recently used is evicted.

Tests: `src/security/security.test.ts`, `src/proxy.test.ts`.
