# Scan runner

A script that runs as a Kubernetes CronJob (image `ghcr.io/filipcsupka/invest-buddy-scanner`) and also works on a Mac. It does the daily research pass for InvestBuddy. For each tracked ticker it asks a headless Claude Code or Codex CLI to search the web and report a fixed set of facts as JSON. It checks the JSON against the scan contract and posts one payload to the ingest API. The scoring happens on the server. The runner never sees prices, scores or the database. The contract is in `docs/scan-contract.md` and is the source of truth.

## What is in here

| Path | Purpose |
| --- | --- |
| `run-scan.mjs` | The runner. Node 20 or newer, no npm install needed. |
| `validate.mjs` | Schema validator, also usable on its own. |
| `schema/scan.schema.json` | JSON Schema (draft 2020-12) for the payload. |
| `prompts/ticker-scan.md` | Prompt for one ticker: earnings, guidance, catalyst, insider and institutional activity, narrative. |
| `prompts/macro-scan.md` | Prompt for the macro object: sector rotation, data tailwind, upcoming events. |
| `universe.json` | The 35 tickers, taken from guide sections 3 and 9 and `src/data/fixtures.ts`. Edit by hand when the app's instruments change. |
| `Dockerfile` | Scanner image: node 22 slim, the `claude` CLI, runner, prompts, schema. Runs as user 10001. |
| `launchd/` | Optional manual backup: weekday 06:30 schedule on the Mac. The scheduled scan is the CronJob. |
| `test/` | Sample payload and a test for the validator. |
| `out/` | Run logs and payload copies. Git ignores everything in it. |

## How a run works

1. Pick the tickers (all, or `--only`). Work out `asOf`, the last US trading day.
2. Run one macro call and one call per ticker, at most 3 at the same time. Each call has a timeout (300 seconds by default) and one retry.
3. Pull the JSON object out of the reply and check it against the schema. A `true` without an https evidence item that names the field counts as a failure and gets the retry.
4. Assemble the payload with a new `runId`, validate it again, write a copy to `out/`.
5. Post it, unless `--dry-run`. Tickers the server rejects are logged with the reason.
6. Exit 0 if at most 20 percent of the calls (macro included) failed, otherwise exit 1. Exit 2 means a setup problem such as a missing token. Exit 3 means the POST failed.

If the macro call fails, the payload carries a macro object with all values null, which the server scores as zero. Failed tickers are left out of the payload and listed in the log. Valid tickers are still posted.

`asOf` skips weekends but does not know US market holidays. Pass `--as-of YYYY-MM-DD` on a holiday.

## Auth in a container

The container has no browser, so it cannot use `claude /login`. Pass one of these as an environment variable (in Kubernetes, from a Secret):

| Variable | What it is | Billing |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Key from the Claude Console. | API, per token. |
| `CLAUDE_CODE_OAUTH_TOKEN` | One-year token from `claude setup-token`, run once on your Mac. | Your Pro or Max subscription. |
| `INGEST_TOKEN` | Bearer token for the ingest endpoint. Required unless `--dry-run`. | none |

Verified against the Claude Code docs (code.claude.com, authentication and legal-and-compliance pages) and by running the image:

- `claude setup-token` prints a one-year token, does not store it, and needs a Pro, Max, Team or Enterprise plan. Set it as `CLAUDE_CODE_OAUTH_TOKEN` "for CI pipelines and scripts where browser login isn't available".
- If both variables are set, `ANTHROPIC_API_KEY` wins. In `-p` mode a present key is always used. The runner logs which one is in play.
- `--bare` does not read `CLAUDE_CODE_OAUTH_TOKEN`. The runner does not use `--bare`.
- In the built image with no variables, `claude -p` exits 1 with `Not logged in · Please run /login`. With `CLAUDE_CODE_OAUTH_TOKEN=bogus` it exits 1 with `Failed to authenticate. API Error: 401 Invalid bearer token`. So the env var is read and sent. That is the only auth path proven in the container.

Not verified: a successful scan inside the container. I had no real `setup-token` value or API key available in this session, so the container never made a model call that succeeded. The same prompts did run headless on the Mac with a local login earlier. Test it yourself with the commands below before relying on the CronJob.

Codex: the docs say to use API key auth for CI (`printenv OPENAI_API_KEY | codex login --with-api-key`), or to copy `~/.codex/auth.json` to the machine and treat it as a password. They say a ChatGPT sign-in refreshes its tokens during normal use. They do not say what happens when `auth.json` sits on a read-only mounted secret, and refresh needs to write the file, so assume it breaks and do not rely on it. The image does not install Codex. Use Claude in the cluster, Codex on the Mac.

### Terms caveat for the subscription token

Anthropic's legal page says OAuth authentication "is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code". It says developers building products or services should use API key authentication through Claude Console, and that advertised Pro and Max limits "assume ordinary, individual usage". A scheduled CronJob that feeds a paid product on a subscription token is not clearly ordinary individual use. This pack does not decide that for you. If InvestBuddy is sold to others, use `ANTHROPIC_API_KEY`, or ask Anthropic sales. The subscription token is fine for trying this out on your own account.

### Mac only: ingest token

Store the token in the macOS Keychain. The command prompts for the value, so it stays out of shell history:

```sh
security add-generic-password -s investbuddy-ingest -a "$USER" -w
```

The runner looks for `INGEST_TOKEN` in the environment first, then for this Keychain item. It never reads a token from a file in the repo. On the Mac, log in to the CLI once (`claude`, or `codex login`).

### Ingest URL

`INGEST_URL` (or `--url`) defaults to `http://web.invest.svc.cluster.local:3000/api/ingest/scan`, the in-cluster service. From a Mac or for local tests pass `http://localhost:3000/api/ingest/scan` or the public `https://invest.filipcsupka.online/api/ingest/scan`.

## Build and test the container locally

From the repo root (works on colima or Docker Desktop):

```sh
docker build -f scanner/Dockerfile -t ghcr.io/filipcsupka/invest-buddy-scanner:dev .

# No model call needed: check the image starts and the failure is readable
docker run --rm ghcr.io/filipcsupka/invest-buddy-scanner:dev --dry-run --only NVDA
```

Without a token that run fails both calls with `Not logged in · Please run /login`, writes a payload with 0 tickers inside the container, and exits 1. That is expected.

With real auth, against the compose web (start it first: `docker compose up -d --build db migrate web`, which sets `INGEST_TOKEN=local-dev-token`):

```sh
docker run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
  -e INGEST_TOKEN=local-dev-token \
  -e INGEST_URL=http://host.docker.internal:3000/api/ingest/scan \
  ghcr.io/filipcsupka/invest-buddy-scanner:dev --only NVDA
```

`host.docker.internal` reached the compose web from the container on colima: a POST with the dev token and an empty body came back `400 Invalid scan` with field errors, so the route and the token check are reachable. Use `ANTHROPIC_API_KEY` in place of the OAuth variable if you prefer. Add `--dry-run` to skip the POST.

## Run in Kubernetes

The CronJob manifest lives under `deploy/`, outside this pack. It needs: the image above, `args` such as `["--concurrency", "3"]`, a weekday schedule, env from a Secret (`INGEST_TOKEN` plus one of `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`), no `INGEST_URL` (the default is the in-cluster service), and a `restartPolicy` of `Never`. The container writes logs and payload copies to `/app/scanner/out`, so use an `emptyDir` there if the root filesystem is read-only, plus an `emptyDir` on `/tmp` and on `/home/scanner/.claude`. Exit code 1 means too many calls failed, 2 means a missing token, 3 means the POST failed.

## Usage

```sh
# Try one ticker without posting. Writes scanner/out/payload-<asOf>-<id>.json
node scanner/run-scan.mjs --dry-run --only NVDA

# A few tickers with Codex instead of Claude
node scanner/run-scan.mjs --dry-run --only NVDA,AMD --agent codex

# Full run and post
node scanner/run-scan.mjs
```

Options: `--agent claude|codex`, `--model NAME`, `--concurrency 1-3`, `--timeout-s N`, `--as-of YYYY-MM-DD`, `--url URL`.

Claude runs as `claude -p --output-format json` with only `WebSearch` and `WebFetch` allowed, no session saved. Codex runs as `codex --search exec --sandbox read-only --ephemeral`. Both run in an empty temporary folder, so they cannot read the repo.

Check a payload file at any time:

```sh
node scanner/validate.mjs scanner/out/payload-2026-10-02-6a0ad3c8.json
node --test scanner/test/validate.test.mjs   # node 25 needs the file path; a directory fails
```

## Optional: schedule on macOS

The CronJob is the main schedule. The Mac template is a manual backup for when the cluster job is down. It sets `INGEST_URL` to the public address, since the cluster default does not resolve from the Mac. The template runs the runner at 06:30, Monday to Friday. launchd uses the local time of the Mac, so 06:30 is Bratislava time only if the Mac is set to that zone. If the Mac is asleep at that time, the job runs after wake. Nothing here loads itself. Do these steps yourself:

```sh
sed -e "s#__NODE__#$(which node)#" \
    -e "s#__REPO__#$PWD#" \
    -e "s#__PATH__#$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin#" \
    scanner/launchd/online.filipcsupka.investbuddy-scan.plist.template \
    > ~/Library/LaunchAgents/online.filipcsupka.investbuddy-scan.plist

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/online.filipcsupka.investbuddy-scan.plist
launchctl kickstart gui/$(id -u)/online.filipcsupka.investbuddy-scan   # optional test run now
```

Remove it:

```sh
launchctl bootout gui/$(id -u)/online.filipcsupka.investbuddy-scan
rm ~/Library/LaunchAgents/online.filipcsupka.investbuddy-scan.plist
```

Run the command from the repo root. The Keychain item is readable from a login session, so the job works after you log in but not before.

## Rotate the ingest token

1. Create the new token on the server side and deploy it.
2. Replace the Keychain item: `security add-generic-password -U -s investbuddy-ingest -a "$USER" -w`
3. Run `node scanner/run-scan.mjs --dry-run --only NVDA` is not enough to test it, since dry runs skip the token. Run a single real ticker instead: `node scanner/run-scan.mjs --only NVDA`. A 401 in the log means the old token is still in use.

## Cost and limits

A run is about 36 agent calls (35 tickers plus macro). In a dry run with one ticker on Claude, the macro call took 35 seconds and the NVDA call 49 seconds, so a full run at concurrency 3 should take roughly 10 to 15 minutes. These calls count against your subscription usage window. If you hit the limit, calls fail, get listed in the log, and the exit code turns non-zero once more than 20 percent fail. Lower `--concurrency` or run a subset with `--only`. Payloads stay well under the 1 MB limit.

## Terms of service

See the caveat under Auth in a container. Moving between subscription token and API key needs no code change, only the environment variable.

## Troubleshooting

- `no INGEST_TOKEN in env or Keychain`: do the setup step above. Dry runs do not need a token.
- `claude exited 1: Not logged in`: on a Mac run `claude` once and sign in. In a container set `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`.
- `Failed to authenticate. API Error: 401`: the token is wrong or expired. Make a new one with `claude setup-token`.
- `timeout after 300s`: raise `--timeout-s`, or lower `--concurrency`.
- `schema: ... missing https evidence`: the model set a field to `true` without a source. The retry usually fixes it. If one ticker keeps failing, read its lines in `out/run-*.log`.
- `symbol mismatch`: the model answered for a different company. Usually a one-off.
- `server rejected X: unknown symbol`: the ticker is in `universe.json` but not in the instruments table.
- HTTP 401: wrong or rotated token. HTTP 400: the log shows the field paths. HTTP 413: payload over 1 MB.
- launchd job did nothing: check `scanner/out/launchd.err.log`, and confirm the PATH in the plist contains the folder of `claude` (`which claude`).
- Logs live in `scanner/out/run-<asOf>-<id>.log`. They hold timestamps, ticker names and error text. The token is never written to them.
