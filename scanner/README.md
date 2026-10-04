# Scan runner

The scan runs the same research job with either Claude Code (`claude -p`) or Codex (`codex exec`), each on its own existing subscription. No paid API key is required. It runs as a Kubernetes CronJob (image `ghcr.io/filipcsupka/invest-buddy-scanner`) and also on a Mac. For each tracked ticker the agent searches the web and reports a fixed set of facts as JSON. The runner checks the JSON against the scan contract and posts one payload to the ingest API. Scoring happens on the server. The runner never sees prices, scores or the database. The contract is `docs/scan-contract.md` (v2) and is the source of truth.

Two agents on two subscriptions need no extra paid account. Each agent runs as its own run with its own `runId`, never sees the other's output, and sets `runner.name` to `claude` or `codex`. The server compares the two (the reconcile job in the contract). Until that exists, `compare.mjs` lets you compare two dry-run files by hand.

## What is in here

| Path | Purpose |
| --- | --- |
| `run-scan.mjs` | The runner. Node 20 or newer, no npm install needed. `--agent claude` or `--agent codex`. |
| `validate.mjs` | Validator for the payload schema and the evidence rules. Also usable on its own. |
| `compare.mjs` | Prints agreement and disagreement per field for two payloads. With `--verify-quotes` it fetches each cited page and checks the quote. |
| `schema/scan.schema.json` | JSON Schema (draft 2020-12) for the v2 payload. |
| `schema/ticker-output.schema.json`, `schema/macro-output.schema.json` | Strict output shapes handed to `codex exec --output-schema`. |
| `prompts/ticker-scan.md` | Prompt for one ticker: earnings, guidance, catalyst, insider and institutional activity, narrative. |
| `prompts/macro-scan.md` | Prompt for the macro object: sector rotation, data tailwind, upcoming events. |
| `universe.json` | The 35 tickers, taken from guide sections 3 and 9 and `src/data/fixtures.ts`. Edit by hand when the app's instruments change. |
| `Dockerfile` | Image with node 22 slim, both CLIs, runner, prompts, schemas. Runs as user 10001. |
| `launchd/` | Optional manual backup: weekday 06:30 schedule on the Mac. The scheduled scan is the CronJob. |
| `test/` | Sample payload and tests for the validator. |
| `out/` | Run logs and payload copies. Git ignores everything in it. `SCAN_OUT_DIR` moves it. |

## What the prompts demand

- Prefer primary sources: the SEC filing, the company earnings release, the investor relations page. Wire services only when nothing primary covers the fact.
- Every `true` needs evidence with an https URL the agent opened, `publishedAt`, `fiscalPeriod`, and a `quote` copied character for character from the page. If the agent cannot copy a supporting sentence exactly, it must answer null.
- Null is a correct answer. The prompts say a wrong true or false is worse than null.
- Revenue acceleration means year over year growth in the latest quarter is greater than year over year growth in the prior quarter. Sequential growth does not count. Equal counts as false.
- The guide's rejection criteria feed `revenueDeclining` and `guidanceCut`. Declining revenue, or a miss with a guidance cut, makes the server reject the stock. The agent only reports the two facts.
- No prices, price targets, valuation, advice or position wording. Scores are computed on the server.

## How a run works

1. Pick the tickers (all, or `--only`). Work out `asOf`, the last US trading day.
2. Run one macro call and one call per ticker, at most 3 at the same time. Each call has a timeout (300 seconds by default) and one retry.
3. Pull the JSON object out of the reply and check it against the schema. A `true` without an https evidence item that names the field counts as a failure and gets the retry.
4. Assemble the payload with a new `runId` and `schemaVersion` 2, validate it again, write a copy to `out/` (the file name includes the agent).
5. Post it, unless `--dry-run`. Tickers the server rejects are logged with the reason.
6. Exit 0 if at most 20 percent of the calls (macro included) failed, otherwise exit 1. Exit 2 means a setup problem such as a missing token. Exit 3 means the POST failed.

If the macro call fails, the payload carries a macro object with all values null, which the server scores as zero. Failed tickers are left out of the payload and listed in the log.

The validator cannot check that a quote is verbatim, since it does not fetch pages. The server reconcile job does that. For a manual check use `compare.mjs --verify-quotes`.

`asOf` skips weekends but does not know US market holidays. Pass `--as-of YYYY-MM-DD` on a holiday.

## How each agent is called

Claude: `claude -p --output-format json --no-session-persistence --permission-mode dontAsk --tools WebSearch,WebFetch --allowedTools WebSearch,WebFetch`. Only the two web tools are available.

Codex: `codex --search -a never exec --sandbox read-only --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --output-schema <schema> -C <empty dir> -o <file>`. These flags were checked against `codex exec --help` and `codex --help` of codex-cli 0.160.0. `--search` and `-a` are top-level flags and go before `exec`. `--ignore-user-config` keeps your `~/.codex/config.toml` (MCP servers, profiles) out of the run while auth still comes from `CODEX_HOME`. The reply is the last message, read from the `-o` file.

Both run in an empty temporary folder, so they cannot read the repo. Set `SCAN_KEEP_WORK=1` to leave that folder in place instead of removing it at the end.

## Local result, NVDA dry run, 2026-10-04

I ran `--dry-run --only NVDA --as-of 2026-10-02` for both agents on this Mac at the same time, each with its local login. Both finished with no failed calls and valid v2 payloads.

| | Claude (`claude-sonnet-5-5`) | Codex (default model, not reported by the CLI) |
| --- | --- | --- |
| Macro call | 41 s | 63 s |
| NVDA call | 68 s | 132 s |
| Evidence items | 4 | 5 |
| Sources | NVIDIA press releases, Yahoo Finance | SEC exhibits (CFO commentary, press release), NVIDIA press release, MarketScreener |

`compare.mjs --verify-quotes` showed 8 fields in agreement (confidence included) and 3 fields where one agent said null and the other gave a value (`guidanceCut`, `narrativeChanged`, `dataTailwind`; Claude gave false, Codex null). No field was a direct true versus false conflict. Both gave `revenueAccelerating` true with the same figures: 106 percent year over year in the latest quarter against 85 percent in the prior one.

Quotes: 8 of 9 were found verbatim in the fetched page. The ninth, a Yahoo Finance sentence cited by Claude for `epsBeat`, could not be fetched, so it is unchecked, not wrong. The Claude quote for `productCatalyst` is a verbatim but weak sentence ("Vera Rubin, now in full production, was built to power exactly this moment."). Codex cited the SEC filings and a named catalyst. Both agents set `guidanceRaised` to null. The macro `events` lists did not overlap (4 and 5 dates, none identical), and the two macro notes disagree on the tone of the data, so macro is the weaker half. One run each says little about quality. Run a few more tickers before drawing conclusions.

## Auth in a container

The container has no browser. Claude and Codex handle this differently.

Claude. Pass `CLAUDE_CODE_OAUTH_TOKEN`, a one-year token from `claude setup-token` that you generate once on your Mac, or `ANTHROPIC_API_KEY`. In Kubernetes, put it in a Secret and read it as an environment variable. If both are set the API key wins. `--bare` does not read the OAuth token and the runner does not use it. Verified in an earlier session against the Claude Code docs and by running the image: with no variable `claude -p` exits 1 with `Not logged in`, with a bogus token it exits 1 with a 401. A successful in-container Claude scan is not verified, because no real `setup-token` value was available.

Codex. A ChatGPT login cannot be a plain read-only secret, because Codex writes into its home directory while it runs. In the container test it created `auth.json` neighbours (`state_5.sqlite`, `models_cache.json`, `installation_id`, logs and more) in `CODEX_HOME`, and the docs say sessions refresh their tokens in place. So the design is a small PVC mounted at `/home/scanner/.codex`, seeded once from a sealed secret by an init step:

1. On the Mac run `codex login` (or `codex login --device-auth` on a machine without a browser) and keep the resulting `~/.codex/auth.json`.
2. Seal that file as a Secret that holds one key, `auth.json`. Treat it like a password.
3. An init container with the same image copies it into the PVC only if `auth.json` is not already there: `[ -f /home/scanner/.codex/auth.json ] || cp /seed/auth.json /home/scanner/.codex/auth.json`. The seed is mounted read-only at `/seed`, the PVC read-write at `/home/scanner/.codex`. The PVC must be writable by uid 10001 (`fsGroup: 10001` or an init `chown`).
4. The scan container mounts the same PVC. Only one scanner pod should use it at a time (`concurrencyPolicy: Forbid`, ReadWriteOnce), since two processes refreshing one `auth.json` could clobber each other.
5. When the refresh token eventually dies, repeat steps 1 to 3 and replace the file on the PVC by hand. Do not reseed on every run, or you throw away refreshed tokens.

Verified from the official Codex docs (developers.openai.com/codex/auth, now at learn.chatgpt.com/docs/auth):

- Credentials are cached at `~/.codex/auth.json`, and `CODEX_HOME` sets the base directory.
- `cli_auth_credentials_store` can be `file`, `keyring`, `auto` or `ephemeral`. For a container use `file`.
- Device code login exists for setups where the browser flow does not work, and copying cached credentials is the documented fallback.
- ChatGPT sessions refresh tokens automatically during use.
- `auth.json` holds access tokens and must be treated like a password. For automation the docs recommend API keys as the default.

Verified here by running it (codex-cli 0.160.0, image built from this Dockerfile, Docker on colima):

- A copy of `auth.json` in a new directory mounted at `/home/scanner/.codex` gave `codex login status` = "Logged in using ChatGPT" for the non-root user 10001, and `codex exec` answered a test prompt.
- A full `run-scan.mjs --dry-run --only NVDA --agent codex` inside the container finished with no failures (macro 72 s, NVDA 96 s).
- `codex login --device-auth`, `--with-api-key` and `--with-access-token` exist in the local help output.
- The mount has to be writable. With a root-owned empty mount Codex failed with "Permission denied".

Not verified:

- That the refresh actually rewrites `auth.json` in a long-lived pod. The file hash was unchanged after my short runs, so no refresh happened.
- How long the ChatGPT refresh token lives when unused, and what happens if it is invalidated when you log in on another machine. Plan for a manual reseed now and then.
- That device auth works headless inside the cluster. I did not try it. The seed-from-Mac route is the one tested.
- Whether Codex works with a read-only `auth.json`. I did not test it. Assume it does not.
- That running on a ChatGPT login from a cluster IP is accepted by OpenAI.

### Terms caveat for the subscription tokens

Anthropic's and OpenAI's subscription terms are written for ordinary individual use, and a scheduled job that feeds a product on subscription logins may not count, so use API keys if InvestBuddy is sold to others. Anthropic's legal page says OAuth authentication "is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code" and that developers building products should use API key authentication. I did not look up OpenAI's wording for this task, so check it before relying on it. Switching between subscription and API key needs no code change, only the environment.

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

The CronJob manifest lives under `deploy/`, outside this pack. It needs: the image above, `args` such as `["--concurrency", "3"]`, a weekday schedule, env from a Secret (`INGEST_TOKEN` plus one of `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`), no `INGEST_URL` (the default is the in-cluster service), and a `restartPolicy` of `Never`. The container writes logs and payload copies to `/app/scanner/out`, so use an `emptyDir` there if the root filesystem is read-only, plus an `emptyDir` on `/tmp` and on `/home/scanner/.claude`. For Codex add the PVC at `/home/scanner/.codex` described above, and run one CronJob per agent (`args: ["--agent", "codex"]`) so each posts its own run. Give the two jobs different start times if both use a ChatGPT or Claude plan, to spread the usage window. Exit code 1 means too many calls failed, 2 means a missing token, 3 means the POST failed.

## Usage

```sh
# Try one ticker without posting. Writes scanner/out/payload-<asOf>-<id>.json
node scanner/run-scan.mjs --dry-run --only NVDA

# Same with Codex, then compare the two files
node scanner/run-scan.mjs --dry-run --only NVDA --agent codex
node scanner/compare.mjs scanner/out/payload-<date>-claude-<id>.json scanner/out/payload-<date>-codex-<id>.json --verify-quotes

# Full run and post
node scanner/run-scan.mjs
```

Options: `--agent claude|codex`, `--model NAME`, `--concurrency 1-3`, `--timeout-s N`, `--as-of YYYY-MM-DD`, `--url URL`.

Check a payload file at any time:

```sh
node scanner/validate.mjs scanner/out/payload-<date>-<agent>-<id>.json
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

A run is about 36 agent calls (35 tickers plus macro). In the NVDA dry run above, Claude needed about 68 seconds and Codex about 132 seconds for the ticker call, so a full run at concurrency 3 should take roughly 15 to 30 minutes with the stricter v2 prompts. These calls count against your subscription usage window. If you hit the limit, calls fail, get listed in the log, and the exit code turns non-zero once more than 20 percent fail. Lower `--concurrency` or run a subset with `--only`. Payloads stay well under the 1 MB limit.

## Terms of service

See the caveat under Auth in a container.

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
