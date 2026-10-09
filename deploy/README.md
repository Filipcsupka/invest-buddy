# InvestBuddy deployment proposal

`~/moje/infra` (`Filipcsupka/infra`, `main`) is the source of truth for what runs. `deploy/gitops/gitops/apps/invest-buddy/` is a mirror kept so the schedule tests can read the manifests; change infra first, then copy the directory here (`rsync -a --delete <infra>/gitops/apps/invest-buddy/ deploy/gitops/gitops/apps/invest-buddy/`). Mirror last synced 2026-10-08. Other files under `deploy/gitops/` are first-rollout templates and are not live. Copying the proposal, committing it, pushing it, and syncing Argo CD each require owner approval. The app serves informational screening only.

## File map

| Proposal file | Infra destination |
| --- | --- |
| `gitops/gitops/apps/invest-buddy/` | `gitops/apps/invest-buddy/` |
| `gitops/argocd/apps/web/invest-buddy.yaml` | `argocd/apps/web/invest-buddy.yaml` |
| `gitops/argocd/apps/web/kustomization.patch` | Patch for `argocd/apps/web/kustomization.yaml` |
| `gitops/argocd/projects/default.patch` | Patch for `argocd/projects/default.yaml` |
| `gitops/gitops/sealed-secrets/invest/*.placeholder.yaml` | Templates only; never copy or render |

The production overlay has placeholder tags for the web and scanner images. Replace both with published GHCR tags before the first infra commit. The `apps` AppProject also needs the proposed `invest` destination. PostgreSQL uses a 5 Gi `local-path` volume on `k8s-worker-01`. Codex authentication uses a separate 1 Gi `local-path` volume on that node. Loss of the node can make both volumes unavailable, so test an offsite database restore and keep a recoverable Codex login before launch.

## Schedule and data path

Both scan CronJobs were suspended and are removed in the cleanup branch. They ran at 05:30 Monday to Friday in `Europe/Bratislava`, overlapping the new judge slot. Keep them suspended; any future use needs a separate schedule review. Each uses `concurrencyPolicy: Forbid`, one retry, and a 40 minute job deadline. `invest-buddy-scan-claude` passes `--agent claude`; `invest-buddy-scan-codex` passes `--agent codex`. Both post to `http://web.invest.svc.cluster.local:3000/api/ingest/scan` with `INGEST_TOKEN` from `invest-buddy-secrets`. The Claude job reads `CLAUDE_CODE_OAUTH_TOKEN` from `invest-buddy-scanner-secrets`. The Codex job mounts `invest-buddy-codex-home` at `CODEX_HOME=/codex-home`. Its init container copies `auth.json` from `invest-buddy-codex-auth-seed` only when the volume is empty. A nonempty volume without `auth.json` fails the job instead of overwriting existing data. Run only one Codex job or auth rotation writer against that PVC at a time. Do not start a manual Codex job while a scheduled one is active.

`invest-buddy-prices` runs `node dist/jobs/prices.js` at 00:30 Tuesday to Saturday in `Europe/Bratislava`, after the US close of the previous evening. Saturday covers Friday's session. It fetches 260 daily bars for the 35 universe symbols plus the SPY benchmark from Twelve Data (36 requests, throttled to 7 per minute, so about six minutes) and reads `TWELVE_DATA_API_KEY` from `invest-buddy-market-secrets`. The job exits non-zero when more than 10% of tickers fail and records each run in `price_ingest_runs`. The Basic plan allows 8 requests per minute and 800 per day; the free tier is for the private beta only and a data licence is needed before a paid launch. There is no Monday price or scoring run. Tuesday's run uses Monday's US session, and Saturday's run uses Friday's. `daily.ts` currently requires a bar dated exactly to the scoring date, so scores may stay `stale_prices` until the planned 3 calendar day freshness rule is added there.

The daily order, Tuesday to Saturday in Bratislava time, is prices 00:30, collect 01:00, detect 01:35, extract 01:50, macro 04:00 (`node dist/jobs/macro.js`, `macro-cronjob.yaml`), reconcile 04:10 (`node dist/jobs/reconcile.js`), daily scoring 04:25, judge 05:30 and digest 07:30. The weekday chain is unsuspended in this proposal. Extract and judge read the daily gate through the protected web endpoint and exit without a model call when no symbols changed. Their scheduled deadlines are 03:50 and 06:30; the five minute late-start window makes the latest ends 03:55 and 06:35. Every step's latest end is no later than the next scheduled start. Prices has a 25 minute job deadline and a five minute start window so collect can start at 01:00. The macro job is deterministic (no AI): it refreshes the 10-year yield (FRED `DGS10`, optional `FRED_API_KEY` from `invest-buddy-source-keys`) and the Cboe VIX, reads the stored daily bars, and writes `dataTailwind` and `sectorRotationIntoGrowth` for the 35 tickers with agreement `data_rule`. Its thresholds are placeholders; see `docs/data.md`. Daily has a 60 minute job deadline and a five minute start window, ending by 05:30 before judge. Extract records completion before judge can read the gate. Migration 019 must be applied before copying this proposal to infra. The fixed review calendar is F5 and needs a separate schedule. Kubernetes 1.34 supports the `timeZone` field, including daylight saving changes. Confirm `SEC_USER_AGENT` uses a monitored contact address before rollout. The verifier needs outbound HTTPS to cited public pages and `data.sec.gov`; test that egress from a job on `k8s-worker-01`. The current infra repository has no NetworkPolicy resources, so this proposal does not add one. If a scan fails or is missing, reconciliation marks that agent missing. Fields then remain single source or unknown unless a deterministic source confirms them; the job never guesses. The engine scores only reconciled findings. Check that extraction and reconciliation have completed before trusting the 04:25 result.

| Job | Purpose | Schedule (Bratislava) | Proposal state | Rollout owner |
| --- | --- | --- | --- | --- |
| prices | Refresh daily bars | Tue–Sat 00:30 | active | Filip |
| collect | Store filings and facts | Tue–Sat 01:00 | active | Filip |
| detect | Persist the daily gate | Tue–Sat 01:35 | active | Filip |
| extract | Read gate, extract changed symbols | Tue–Sat 01:50 | active, gate controlled | Filip |
| macro | Refresh deterministic macro facts | Tue–Sat 04:00 | active | Filip |
| reconcile | Verify source agreement | Tue–Sat 04:10 | active | Filip |
| daily | Score the universe | Tue–Sat 04:25 | active | Filip |
| digest | Send event digest | Tue–Sat 07:30 | active | Filip |
| judge | Review changed decisions | Tue–Sat 05:30 | active, gate controlled | Filip |
| collect-alphavantage | Refresh weekly EPS surprise | Sat 08:00 | suspended | Filip |
| discovery | Find candidates outside the universe | Sat 09:30 | active | Filip |
| retention | Expire old source data | Daily 03:00 | suspended | Filip |
| portfolio | Import Flex baseline, one NAV point per day | Tue–Sat 06:00 UTC | active | Filip |
| scan-claude, scan-codex | Legacy web search scans | removed from infra 2026-10-08 (branch `invest-buddy-cleanup-0810`, pending merge) | removed | Filip |
| backup | Save database offsite | Daily 02:30 | suspended until E1 (secrets, restore test) | Filip |

The digest needs `DIGEST_TO` (mail goes to the log only until it is set). The portfolio CronJob is active. Its 06:00 UTC Tuesday through Saturday schedule, Flex Query fields, token egress, SPY provider, market holidays, and IBKR publication terms still need review; the job already runs. A failed fetch keeps the prior snapshot and date.

The scan jobs use plain HTTP for the in-cluster ingest hop. This accepts the risk of token and payload exposure to an observer with access to cluster traffic. Keep the scanner and web in the single `invest` namespace, expose the ingest service as ClusterIP only, rotate `INGEST_TOKEN` through the approved sealed-secret flow, and block the public ingest route.

The public host routes to the web, while its Traefik middleware rewrites `/api/ingest` to an absent path. Verify that a public ingest request returns 404 after sync. The internal handler still checks its bearer token and 1 MB body limit. The Ingress requests a certificate from the existing `letsencrypt-prod` ClusterIssuer.

## Prepare the rollout

1. Confirm the public ingress address, then have the owner create the A record for `invest.filipcsupka.online`.
2. Confirm the scanner image contains both CLI agents and that the web image contains `dist/jobs/reconcile.js`, the other jobs, the migration runner, and SQL migrations. CI tests the repository and builds both images. On a main push it publishes both under `sha-<short>`. The `INFRA_BUMP=true` repository variable remains the gate for pinning both tags in infra. Keep it unset until both published images and the infra proposal are approved. `INFRA_REPO_TOKEN` needs Contents read/write on `Filipcsupka/infra` for that gate.
3. Create the database password, URL, ingest token, digest address, and backup credentials in a secret manager. Use the same password in `POSTGRES_PASSWORD` and `DATABASE_URL`, and URL-encode special characters in the URL password. Keep plaintext out of Git and shell history.
4. Confirm the offsite SFTP restic repository, verified SSH host key, and restore procedure. The backup job needs `invest-buddy-backup-secrets` and connectivity from `k8s-worker-01`.
5. Seal the application, market data, backup, Claude, and Codex seed secrets for namespace `invest`. The placeholder files are examples only. Add the sealed output files to the approved app base Kustomization.

The web init container runs `npm run migrate` before each new web pod starts. It retries while PostgreSQL is unavailable. Migrations are recorded in `schema_migrations` and guarded by an advisory lock. Check schema compatibility with the rollback image before rollout.

## Feature flags

`src/config/flags.ts` is the one place flags are read. Each is a plain env var on the web Deployment with value `on` or `off`; unset or any other value uses the default. Restart the web pods after changing one.

| Flag | Default | Effect |
| --- | --- | --- |
| `PAYWALL` | off | Paywall segments (see `docs/paywall-segments.md`). |
| `AUTH` | off | Sign-in. |
| `BILLING` | off | Payments. |
| `WAITLIST` | off | Waitlist sign-up. |
| `ADVICE_OUTPUT` | off | Action wording on idea cards and sizing. |
| `IDEAS_PAGE` | off (on when `DATA_MODE=fixture`) | `/ideas` page and nav link. |
| `OWNER_VIEW` | off | Private owner allocation view. |

Only `IDEAS_PAGE` and `OWNER_VIEW` are read by code today; the others are declared for the tasks that add them.

## Operator disclosure banner

The web hides the operator disclosure line until its text is set. It reads one plain environment variable per language and shows the text on the dashboard, company and track-record pages. Set it as a normal env var on the web Deployment (it is not a secret). Blank or unset keeps the line hidden.

```yaml
env:
  - name: OPERATOR_DISCLOSURE_EN
    value: "<English disclosure text>"
  - name: OPERATOR_DISCLOSURE_SK
    value: "<Slovak disclosure text>"
```

The wording is the owner's to write. Restart the web pods after changing it.

## Seal the authentication secrets

Run `claude setup-token` on the Mac while signed in. Store the token in the secret manager. Fetch and inspect the cluster Sealed Secrets certificate using the infra kubeconfig and the actual controller name and namespace. `kubeseal --fetch-cert` is read only. Seal locally for `invest`; never commit an unsealed Secret, paste the token in chat, or place it in a command argument. This example reads the value without showing it in shell history:

```sh
kubeseal --fetch-cert --kubeconfig "$HOME/.kube/khtz" \
  --controller-name sealed-secrets --controller-namespace kube-system \
  > /tmp/invest-buddy-sealed-secrets.crt
read -rs CLAUDE_CODE_OAUTH_TOKEN
printf %s "$CLAUDE_CODE_OAUTH_TOKEN" \
  | kubectl create secret generic invest-buddy-scanner-secrets -n invest \
  --from-file=CLAUDE_CODE_OAUTH_TOKEN=/dev/stdin \
  --dry-run=client -o yaml \
  | kubeseal --cert /tmp/invest-buddy-sealed-secrets.crt --format yaml \
  > /tmp/invest-buddy-scanner-secrets.sealed.yaml
unset CLAUDE_CODE_OAUTH_TOKEN
```

For Codex, sign in with `codex login` on a trusted machine and locate its `auth.json` in the active `CODEX_HOME` (usually `~/.codex/auth.json`). Treat it as a credential. Seal the file without printing it:

```sh
kubectl create secret generic invest-buddy-codex-auth-seed -n invest \
  --from-file=auth.json=/path/to/private/auth.json \
  --dry-run=client -o yaml \
  | kubeseal --cert /tmp/invest-buddy-sealed-secrets.crt --format yaml \
  > /tmp/invest-buddy-codex-auth-seed.sealed.yaml
```

The Codex seed is used only on an empty PVC. After a successful first login, token refresh writes back to that PVC. A subscription login can expire or be revoked. Treat a failed scan job as an authentication alert and check it without dumping credentials:

```sh
kubectl --kubeconfig "$HOME/.kube/khtz" -n invest get cronjob,job,pod
kubectl --kubeconfig "$HOME/.kube/khtz" -n invest describe job <failed-job-name>
kubectl --kubeconfig "$HOME/.kube/khtz" -n invest logs job/<failed-job-name> --tail=100
```

For Claude rotation, obtain a new setup token, seal it under the same key, sync through the approved GitOps flow, and start a new scan job after the old one ends. For Codex rotation, sign in again on the trusted machine and seal a new `auth.json`. Updating the seed Secret alone does not replace a populated PVC. Stop the Codex schedule, confirm no Codex job is running, and use an owner-approved one-off GitOps Job to copy the new sealed file to the PVC with mode `0600`; then resume the schedule and verify one scan. Keep the old credential available until the new run succeeds, then revoke it. Rotate `INGEST_TOKEN` by sealing the replacement and changing the web pod template in the same approved infra change, then verify one accepted and one rejected internal request.

The database, digest, and backup secret placeholders document the remaining keys. Use `kubectl create secret --dry-run=client -o yaml | kubeseal` with the fetched certificate, following the same local sealing pattern. The suspended portfolio job needs `invest-buddy-flex-secrets` before it is enabled.

## Copy and verify in infra

After owner approval, check both patches with `git -C ~/moje/infra apply --check`, copy `deploy/gitops/gitops/apps/invest-buddy/` to `~/moje/infra/gitops/apps/`, copy the Argo application manifest, and apply the two patches. Add the sealed outputs to the base Kustomization and replace both overlay tags. Render the app and Argo directories with `kustomize build`, then inspect `git diff --check` and `git diff` in infra. Commit and push only after a separate owner approval. Argo CD owns the live sync; do not apply the manifests directly with kubectl.

## Verify and roll back

After the approved sync, check `argocd app get invest-buddy`, `kubectl -n invest get deploy,pods,svc,ingress,cronjob,pvc`, the certificate, migration init container logs, and `GET https://invest.filipcsupka.online/api/health`. Confirm public `/api/ingest/scan` returns 404. Check the Claude and Codex jobs, reconciliation, scoring, and digest in that order. Test an isolated restic restore before relying on backups. Keep tokens and `auth.json` out of logs and command output.

Rollback is an owner-approved revert of the infra commit and push of that revert. Preserve the PostgreSQL and Codex PVCs and the offsite backup repository. A schema migration may need an application-compatible forward fix before an older image can run.
