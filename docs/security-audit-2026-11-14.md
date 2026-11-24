# Security audit, 2026-11-14

A read-only pass over the repository, the `invest` namespace on the khtz cluster, and the live site at invest.filipcsupka.online. Nothing was changed in the cluster or the live app. Two findings were fixed the same day in #389; the rest are listed with a suggested fix and who needs to approve it.

Scope: dependency and static code review, a secret scan, a Kubernetes and GitOps manifest review, and anonymous dynamic checks against the live site. Tools: `npm audit`, `trivy` (secret and misconfig), manual code review, `kubectl` read-only, `curl` and `openssl`. Semgrep and gitleaks were not available in the worker, so SAST was manual plus trivy; a later run with those two would add coverage.

## Fixed today (#389)

- **Ingest rate-limit bypass (low).** `src/security/rate-limit.ts` exempted any `/api/ingest/` request whose Authorization header merely began with `Bearer `, with no token check, so an anonymous client could skip the API limiter with a bogus token. It now exempts a request only when the token's SHA-256 matches `INGEST_TOKEN` with a constant-time compare, the same check the ingest routes use. The routes already rejected bad tokens, so no data was exposed.
- **Framework banner (low).** The app sent `X-Powered-By: Next.js`. Set `poweredByHeader: false`.

## Open, needs a code change (no approval)

- **CSP allows inline scripts (medium).** `src/security/headers.ts` keeps `'unsafe-inline'` in `script-src` in production. No current XSS path was found (analytics and JSON-LD escape `<`, the layout inserts fixed code), but an output-encoding slip would not be blocked. Fix: move the fixed inline scripts to external assets and use nonces or hashes for Next's required scripts, then drop `'unsafe-inline'`. This can break inline scripts if done carelessly, so it needs its own change and a check in the browser.

## Open, owner or infra approval needed

These touch the cluster or the infra repo, so they follow the usual approval and GitOps path (edit the manifest, never `kubectl patch`).

- **No database backup runs (high).** `cronjob/invest-buddy-backup` is suspended and its secret `invest-buddy-backup-secrets` does not exist. The only copy is an 8-day-old laptop dump (1.8 GB) that is already smaller than the 5.8 GB live database. This is TASK-063. Fix: seal the backup secret, run one restore test to a scratch database, then un-suspend. Add a job-failure alert.
- **No NetworkPolicy in `invest` (high).** Zero policies, so postgres, web and every job accept traffic from any pod and can send traffic anywhere. The old research-verify policy was removed in infra #61. Fix: a default-deny policy plus an allow list (postgres from app pods on 5432, web from Traefik, job egress to DNS, postgres, web and TCP 443 to non-private ranges). The removed research-verify policy is a good shape to copy, since it already blocked RFC1918, `100.64.0.0/10` and `169.254.0.0/16`.
- **Every workload uses the Postgres superuser (high).** All containers log in as `invest`, which has `rolsuper`, `createrole` and `createdb`. A `auth_rw` group role with table-level DML already exists but is not used for login. Any SQL bug then has superuser reach. Fix (DB change, needs approval): an owner role for the migrate init container, a login role with DML for web and jobs, a read-only role for read-only jobs, each in its own sealed secret key.
- **Postgres data-loss path (medium).** The PV has `reclaimPolicy: Delete`, Argo runs with `prune: true` and `selfHeal: true`, the database is on a single node, and that node's disk is 78% full. If the PVC entry were removed or renamed in infra, Argo would delete the PV and its data. Fix: set the PVC/PV to Retain, or exclude it from prune.
- **Live secrets outside GitOps (medium).** `invest-buddy-auth` and `invest-buddy-owner` are mounted by web but have no SealedSecret, so a namespace rebuild loses them and rotation has no trail. `invest-buddy-telegram-owner` and `invest-buddy-backup-secrets` are referenced by suspended CronJobs and do not exist. Fix: seal the two live secrets into the infra repo (owner supplies values); seal or remove the missing refs.
- **Secret stored in a ConfigMap (medium, from trivy).** The backup-script ConfigMap holds `export PGPASSWORD` text (KSV-0109). The real value comes from a secret at runtime, but the pattern should move out of the ConfigMap when the backup work is done.
- **Namespace has no Pod Security Admission labels (medium).** Workload hardening is already at the `restricted` level everywhere checked, but the namespace does not enforce it, so a future manifest could regress silently. Fix: add `pod-security.kubernetes.io/warn` and `audit` labels, then `enforce` after a dry run.
- **Unrestricted job egress (medium).** With no NetworkPolicy, the EODHD and scanner jobs can reach node link-local addresses (169.254.169.254) and every in-cluster service, which is the SSRF case for the jobs that fetch cited URLs. Covered by the NetworkPolicy fix above. Whether Hetzner metadata is reachable from a pod was not tested.
- **Low items.** Floating `postgres:16-alpine` tag; app images pinned by tag, not digest; postgres container without `readOnlyRootFilesystem`; secrets delivered as env vars across many containers; a stale `invest-buddy-codex-auth-seed` secret; no ResourceQuota or LimitRange. Details in the worker report.

## Informational

- **Public health endpoint.** `GET /api/health` returns `{"database":"ok"}` to anyone. It leaks no credentials or versions and may be intended for uptime checks. If external probes do not need the database field, return a generic status or move the detailed check to an internal route.

## Checked and good

- **Dependencies.** No production vulnerabilities (`npm audit --omit=dev` clean). Seven moderate dev-only toolchain advisories remain (the `minimatch`/ESLint chain), none high or critical.
- **Secrets.** No committed private key, token or live credential, confirmed by trivy and a spot check of recent history. The sealed-secret placeholders hold no usable values.
- **Auth and entitlements.** Owner status comes from a signed-in user id checked against `OWNER_USER_IDS`, not a client hint. Stock scores and prices require owner or an active Plus or trial; markets pages honour the display-license flags. No path was found for a non-entitled user to receive restricted vendor-derived data, and anonymous probes of owner, stock, ETF and index pages were all refused with `private, no-store`.
- **Workload hardening.** All 59 CronJobs, web and postgres meet the Pod Security `restricted` level: non-root, seccomp RuntimeDefault, no privilege escalation, all capabilities dropped, read-only root filesystem (except postgres), and no hostPath, hostNetwork or privileged containers. Service account tokens are off and no RBAC binding grants broad verbs.
- **Network exposure.** Services are all ClusterIP. One Ingress on invest.filipcsupka.online through Traefik, HTTP redirects to HTTPS, a valid Let's Encrypt certificate to 2027-01-02, TLS 1.2 and 1.3 only, and the full set of security headers (HSTS, CSP frame-ancestors none, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy). Port 5432 is closed on the node's public IPs.

## Not tested

Authenticated flows, including real session cookie flags and the ingest POST handlers, need owner credentials or a controlled test that sends a harmless invalid POST. The dynamic pass was anonymous and GET-only. NetworkPolicy enforcement, node metadata reachability, sealed-secrets and Argo RBAC, and image CVEs were not checked.
