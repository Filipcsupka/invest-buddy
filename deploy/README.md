# InvestBuddy deployment proposal

PROPOSAL. `deploy/gitops/` contains files for review. Filip owns the live rollout in `~/moje/infra`. Copying files there, committing, pushing, and syncing Argo CD each need owner approval. The app serves informational screening only.

## File map

| Proposal file | Infra destination |
| --- | --- |
| `gitops/gitops/apps/invest-buddy/` | `gitops/apps/invest-buddy/` |
| `gitops/argocd/apps/web/invest-buddy.yaml` | `argocd/apps/web/invest-buddy.yaml` |
| `gitops/argocd/apps/web/kustomization.patch` | Patch for `argocd/apps/web/kustomization.yaml` |
| `gitops/argocd/projects/default.patch` | Patch for `argocd/projects/default.yaml` |
| `gitops/gitops/sealed-secrets/invest/*.placeholder.yaml` | Templates only; never copy or render |

The production overlay starts with placeholder tags for both the web and scanner images. The owner must replace both with published GHCR tags before the first infra commit. The `apps` AppProject also needs the proposed `invest` destination. PostgreSQL uses a 5 Gi `local-path` volume pinned to `k8s-worker-01`. A node failure can make that volume unavailable, so test an offsite restore before launch.

## Image and schedule

The runtime image contains the web server, compiled daily, digest, and portfolio jobs, the compiled migration runner, and SQL migrations including `003_scan_findings.sql`. The web init container runs `npm run migrate` before each new web pod starts. It retries while PostgreSQL is unavailable. Migrations are recorded in `schema_migrations` and guarded by an advisory lock. Keep the published image, database schema, and rollback image compatible before approving rollout.

The scanner CronJob starts at 05:30 Europe/Bratislava on weekdays, the score CronJob runs at 06:30, and the digest runs at 07:00. Kubernetes 1.34 supports the `timeZone` field, so daylight saving changes stay tied to Bratislava time. The scanner gets one scheduled run with `concurrencyPolicy: Forbid`, a 50 minute deadline, and one retry after failure. There is no second catch-up schedule. The daily job reads stored findings with `DATA_MODE=db`; if the scan does not finish before scoring, the owner must inspect the jobs and decide how to recover. The digest needs `DIGEST_TO`. The portfolio CronJob remains suspended. Its 06:00 UTC Tuesday through Saturday schedule, Flex Query fields, token egress restriction, SPY provider, market holidays, and IBKR publication terms need review before it is enabled. A failed fetch keeps the prior snapshot and its date.

The scanner posts to `http://web.invest.svc.cluster.local:3000/api/ingest/scan` through an internal Service. The public host serves the web, while its Traefik middleware rewrites `/api/ingest` requests to an absent path before they reach the app. Verify a public ingest request returns 404 after sync. Only in-cluster callers can reach the ingest handler; it still checks the bearer token and 1 MB body limit from `docs/scan-contract.md`. The public Ingress requests a certificate from the existing `letsencrypt-prod` ClusterIssuer. The current infra repo has no NetworkPolicy resources, so this proposal adds none.

## Before the first rollout

1. Owner: create an A record for `invest.filipcsupka.online` pointing to the khtz public ingress address. Confirm the address against the current cluster before changing DNS.
2. Owner: create repository secret `INFRA_REPO_TOKEN`, a fine-grained token with Contents read/write access to `Filipcsupka/infra`. The CI workflow builds and tests PRs, publishes web and scanner images tagged `sha-<short>` on main, and pins both infra overlay tags only when repository variable `INFRA_BUMP=true`. The scanner build uses `scanner/Dockerfile` with `scanner/` as its context; CI logs a notice and skips that image until the file exists. Leave the variable unset until both images exist and the first infra rollout is approved. This matches the cv-web and memorial image-pin mechanism.
3. Owner: provide the database password, URL, ingest token, scanner authentication token or API key, digest address, and backup credentials. Set the same password in `POSTGRES_PASSWORD` and `DATABASE_URL`; URL-encode special characters in the URL password. Keep plaintext out of Git and shell history. Restrict the scan token to the runner and rotate it after exposure or operator turnover.
4. Owner: confirm the offsite SFTP restic repository, verified SSH host key, and restore procedure. The backup CronJob needs `invest-buddy-backup-secrets` and connectivity from `k8s-worker-01`.

## Seal secrets

Fetching the cluster certificate is read-only. Review the certificate identity before sealing. These commands create only local sealed YAML in `/tmp`; they do not apply a Secret to the cluster. Use the infra kubeconfig and check the actual Sealed Secrets controller name and namespace first.

```sh
kubeseal --fetch-cert --kubeconfig "$HOME/.kube/khtz" \
  --controller-name sealed-secrets --controller-namespace kube-system \
  > /tmp/invest-buddy-sealed-secrets.crt
read -rs POSTGRES_PASSWORD
read -rs DATABASE_URL
read -rs INGEST_TOKEN
read -r DIGEST_TO
read -rs RESTIC_PASSWORD
read -r RESTIC_REPOSITORY
kubectl create secret generic invest-buddy-secrets -n invest \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --from-literal=INGEST_TOKEN="$INGEST_TOKEN" \
  --from-literal=DIGEST_TO="$DIGEST_TO" --dry-run=client -o yaml \
  | kubeseal --cert /tmp/invest-buddy-sealed-secrets.crt --format yaml \
  > /tmp/invest-buddy-secrets.sealed.yaml
kubectl create secret generic invest-buddy-backup-secrets -n invest \
  --from-literal=RESTIC_PASSWORD="$RESTIC_PASSWORD" \
  --from-literal=RESTIC_REPOSITORY="$RESTIC_REPOSITORY" \
  --from-file=ssh_key=/path/to/backup-ssh-private-key \
  --from-file=known_hosts=/path/to/verified-known-hosts \
  --dry-run=client -o yaml \
  | kubeseal --cert /tmp/invest-buddy-sealed-secrets.crt --format yaml \
  > /tmp/invest-buddy-backup-secrets.sealed.yaml
unset POSTGRES_PASSWORD DATABASE_URL INGEST_TOKEN DIGEST_TO RESTIC_PASSWORD RESTIC_REPOSITORY
```

After owner approval, place the sealed outputs in `gitops/apps/invest-buddy/base/` and list them in its Kustomization. The scanner needs `invest-buddy-scanner-secrets` containing one of `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`. Do not copy the placeholders. The suspended portfolio job also needs a separately sealed `invest-buddy-flex-secrets` with `FLEX_TOKEN` and `FLEX_QUERY_ID` before enabling it.

## Scanner authentication

For subscription authentication, run `claude setup-token` once on the Mac while signed in. Put the resulting token in a secret manager, enter it interactively for sealing, and avoid placing it in a command argument or Git file. The scanner image must use `CLAUDE_CODE_OAUTH_TOKEN` for its headless Claude session. Seal it for the `invest` namespace:

```sh
read -rs CLAUDE_CODE_OAUTH_TOKEN
kubectl create secret generic invest-buddy-scanner-secrets -n invest \
  --from-literal=CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
  --dry-run=client -o yaml \
  | kubeseal --cert /tmp/invest-buddy-sealed-secrets.crt --format yaml \
  > /tmp/invest-buddy-scanner-secrets.sealed.yaml
unset CLAUDE_CODE_OAUTH_TOKEN
```

To switch to API billing, create an Anthropic API key through the owner's Anthropic account, seal it under `ANTHROPIC_API_KEY` in the same Secret name, and omit the OAuth key from the replacement Secret. Confirm the scanner image supports API key authentication before approving that change. Update the sealed Secret in infra, sync it through Argo, and verify a scan job can authenticate before revoking the old token. The CronJob references both keys as optional so either Secret shape works.

```sh
read -rs ANTHROPIC_API_KEY
kubectl create secret generic invest-buddy-scanner-secrets -n invest \
  --from-literal=ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --dry-run=client -o yaml \
  | kubeseal --cert /tmp/invest-buddy-sealed-secrets.crt --format yaml \
  > /tmp/invest-buddy-scanner-secrets.sealed.yaml
unset ANTHROPIC_API_KEY
```

## Copy and review in infra

Run this sequence only after the owner approves the infra diff, sealed secrets, DNS change, and initial image tag. `git apply --check`, `kustomize build`, and `git diff` are local checks; copying and patching the infra repo are the approval boundary.

```sh
cd /Users/filipcsupka/orca/workspaces/InvestBuddy/petrel
git -C /Users/filipcsupka/moje/infra apply --check "$PWD/deploy/gitops/argocd/apps/web/kustomization.patch"
git -C /Users/filipcsupka/moje/infra apply --check "$PWD/deploy/gitops/argocd/projects/default.patch"
cp -R deploy/gitops/gitops/apps/invest-buddy /Users/filipcsupka/moje/infra/gitops/apps/
cp deploy/gitops/argocd/apps/web/invest-buddy.yaml /Users/filipcsupka/moje/infra/argocd/apps/web/
git -C /Users/filipcsupka/moje/infra apply "$PWD/deploy/gitops/argocd/apps/web/kustomization.patch"
git -C /Users/filipcsupka/moje/infra apply "$PWD/deploy/gitops/argocd/projects/default.patch"
```

Add the three sealed files to the app base and replace both overlay tags. Then run:

```sh
kustomize build /Users/filipcsupka/moje/infra/gitops/apps/invest-buddy/overlays/prod
kustomize build /Users/filipcsupka/moje/infra/argocd/apps/web
git -C /Users/filipcsupka/moje/infra diff --check
git -C /Users/filipcsupka/moje/infra diff
```

After the owner approves the infra commit and push, Argo CD can sync the application. Do not apply these manifests directly with kubectl.

## Verify and roll back

After the approved sync, check `argocd app get invest-buddy`, `kubectl -n invest get deploy,pods,svc,ingress,cronjob,pvc`, the certificate, and the migration init container logs. Check `GET https://invest.filipcsupka.online/api/health` and confirm the public `/api/ingest/scan` path returns 404. Run a small scan through the internal Service from an approved in-cluster job, then confirm the scan, score, and digest jobs in order. Test a restic restore in an isolated database before relying on backups. Keep the scan token out of command output and logs.

To rotate `INGEST_TOKEN`, seal a replacement value under the same Secret name and include a web pod-template annotation change in the approved infra commit so Argo replaces the pod. Sync that change, update the scanner Secret or job environment, then check one authenticated ingest request and one rejected request with the old token through the internal Service. Roll back an application release by reverting its approved infra commit and pushing the revert after owner approval. Preserve the PostgreSQL PVC and offsite backup repository; deleting either needs a separate decision. A schema migration may need an application-compatible forward fix rather than a database rollback.
