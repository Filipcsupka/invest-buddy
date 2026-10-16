# Telegram alerts

The digest job (`src/jobs/digest.ts`, CronJob `invest-buddy-digest`, 07:30 Tue to Sat, Europe/Bratislava) posts the day's rule state changes to one Telegram channel. Everyone gets the same message. Splitting free and paid tiers comes later, once this channel has run reliably.

## How it works

- After the daily scoring run, the job reads `alerts` for the latest `ingest_runs.as_of` and posts one message per ticker whose status band changed (`src/notify/format.ts`): band emoji slider with a marker, was and now with points, optional confirmation chips and data coverage, links to the company page and methodology, and the informational-screening line. Bands follow `docs/roadmap/lane-status.md`; missing data shows as "no data", never 0 points. With `ADVICE_OUTPUT` off the green band reads "Conditions met" ("Podmienky splnené"). Language comes from `DIGEST_LOCALE` (the CronJob sets `sk`).
- When `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are both set, the message goes to Telegram (Bot API `sendMessage`, parse mode HTML, no link preview). Otherwise the job keeps the old behaviour and prints to the log, which needs `DIGEST_TO`.
- Rule changes (TASK-085): the short message adds up to 3 lines for rules whose matched state changed against the ticker's previous scored day, `No longer meets: <rule label>` (pass to fail) and `Now meets: <rule label>` (anything to pass), in Slovak `Už nespĺňa:` and `Teraz spĺňa:`. They come from `src/db/rule-changes.ts`, which diffs `score_results.audit` rule hits on read (no table, no migration) and selects only rule id, matched and unknown. A rule that moved to unknown (data missing) gets no line, because unknown is not a fail. A ticker's first day has no previous row and no lines. The lines use the rule labels from the dictionary, never a rule's input values. The idea card does not carry them.
- Days with no state change are skipped. Set `TELEGRAM_POST_EMPTY=on` to post them anyway.
- Each post is recorded in `notification_deliveries` (migration 044) before it is sent, keyed by channel, chat, day, language and ticker. A rerun of the same day posts nothing. If a send fails, only that ticker's row is removed and the others still go out, so the next run retries just the failed one.
- On HTTP 429 the job waits for Telegram's `retry_after`. Errors from 5xx and the network are retried up to 3 times. Errors never include the bot token.
- Job counts in the log show `telegram: sent | duplicate | empty` plus `sent` and `duplicates` counts.

## Idea card (AL3)

When the judge stored an idea for a ticker that changed band, for the same date, the digest sends the idea card instead of the short message. A ticker with no stored idea still gets the short message above. The card has: band emoji, ticker and label; one line "Was ... Now ..."; a score line such as `Score 17 of 23 evidenced (74 %), data coverage 92 %` (from the audit fields of EN45, plain points when the audit has none); What happened (up to 3 bullets); Why it matters; Setup ratings (Company, Entry, Catalyst); up to 5 numbers; Plan; Evidence as links to the source URLs; the company page and methodology links; the disclaimer. EN or SK follows `DIGEST_LOCALE` and uses the stored Slovak translation, English when none is stored.

Telegram allows 4096 characters. A longer card loses whole sections, lowest priority first: numbers, setup, plan, why it matters, what happened, then evidence links from the end. A link is never cut.

`TELEGRAM_CARD_MODE`:

- `public` (default, any other value too): neutral band labels (never "Buy zone" on the card, even with `ADVICE_OUTPUT` on), no EUR amounts, no action words (Start, Add, Reduce), plan labelled Trigger, Invalidation and Opportunity cost. While `ADVICE_OUTPUT` is off, the card follows `docs/wording-gate.md` and holds back model text, ratings and plan: it shows the state, score line, evidence links, the company link and the disclaimer. With `ADVICE_OUTPUT` on, all sections show, minus EUR and action words.
- `owner`: for the owner's **private channel only**. Adds the action word and the EUR band from the idea to the header, and the plan reads When to start, When to add, When to stop, Opportunity cost. It ignores `ADVICE_OUTPUT`. Never set it on a channel others can read: it shows personal amounts and trade wording that ADR-001 keeps out of public output.

## One-time setup (owner)

1. In Telegram, open @BotFather, send `/newbot` and keep the token.
2. Create a channel (public or private). Add the bot as an administrator with the right to post messages.
3. Chat id: for a public channel use `@channelname`. For a private channel, post any message in it, open `https://api.telegram.org/bot<token>/getUpdates` in a browser and copy `channel_post.chat.id` (it starts with `-100`).
4. Create the secret in namespace `invest` as a sealed secret named `invest-buddy-telegram` with keys `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, through the infra repo like the other secrets. Never commit the plain value.
5. Copy the CronJob change from `deploy/gitops` into the infra repo. The env entries are `optional`, so the job still starts while the secret is missing.
6. First proof: run the job once by hand, for example `kubectl -n invest create job --from=cronjob/invest-buddy-digest digest-test-1`. Its log should end with `"telegram":"sent"` (or `"empty"` on a day without changes), and the post should appear in the channel.
7. Done 2026-10-10: the first manual run sent (`"telegram":"sent"`, 9 alerts). After the proof, set `suspend: false` on `invest-buddy-digest` in infra. `src/jobs/cronjob-order.test.ts` asserts the mirror keeps it suspended, so flip that assertion in the same PR.

## New candidates (weekly, DS1)

The discovery job (`src/jobs/discovery.ts`, Saturday 09:30) posts one "New candidates" message per week after it stores candidates (`src/notify/discovery.ts`). It uses the same bot, chat and `DIGEST_LOCALE` as the digest.

- The message lists the week's stored candidates, best rule score first. Each entry has the ticker as a link (the SEC filing that surfaced it, else the SEC company search), the name, the rule score out of 25 with the rule state label, revenue growth when SEC data gave it, and up to three sources with links and kind labels (SEC 8-K, revenue growth, theme, clinical trial, ownership filing, 13F holding, price and volume move). English and Slovak.
- Wording follows the same gate as the alerts: rule state labels only, "Conditions met" until `ADVICE_OUTPUT` is on, and the informational-screening line. Source details such as a theme chain stay in the language they were stored in.
- Only sent when both Telegram variables are set. The CronJob entries are `optional`, so the job still runs without the secret `invest-buddy-telegram`.
- Each post is recorded in `notification_deliveries` before it is sent, with kind `discovery:<locale>` and the week's Monday as the date. A rerun of the same week posts nothing, and a failed send removes the record so the next run retries. A failed send is logged and the job still ends green; the run log field `telegram` shows `sent`, `duplicate`, `empty`, `off` or `failed`.
- The message is built from the stored rows of the week, so a rerun after a crash between saving and sending still posts them. Messages over 4096 characters are split at line breaks by the notifier.
- The owner copies the Telegram env entries from the `deploy/gitops` mirror (`invest-buddy-discovery`) into the infra repo.

## Owner alerts (watchdog, PL27)

The watchdog (`src/jobs/watchdog.ts`, CronJobs `invest-buddy-watchdog` and `invest-buddy-watchdog-noon`) and the one-off `src/jobs/alert-test.ts` send to the owner's private chat, never to the digest chat.

- Bot token: `TELEGRAM_BOT_TOKEN` from secret `invest-buddy-telegram`. Chat: `TELEGRAM_OWNER_CHAT_ID` from secret `invest-buddy-telegram-owner`. `TELEGRAM_CHAT_ID` is not read.
- The secret `invest-buddy-telegram-owner` must exist in namespace `invest` before the watchdog CronJobs are un-suspended. The env entries are not `optional`, so a Pod without it does not start.
- Fails closed: without the token or the owner chat id nothing is sent, a JSON line `alert_notifier_unconfigured` is logged, and the job exits non-zero.
- Rules: a missed job, stale health dates, a full database volume, an expiring certificate. A job with no `job_runs` row at all is skipped until it has run once, so the first enable does not flood the chat.
- One alert per problem per 23 hours (`alert_state`). The window is 23 hours, not 24, so a daily run a few minutes later than the day before is not skipped.
- No AI ceiling rule: `scanner/run-extract.mjs` and `scanner/run-judge.mjs` do not write `job_runs`, so an exit 5 stop is not visible to the watchdog.

## Wording

Messages use rule states and points only, never buy or sell wording (ADR-001). `src/jobs/digest.test.ts` checks the banned words in both languages. A public channel is still a public signal feed, so it falls under the same open lawyer question as the paid feed (tasks-open G5).

## Later

- Split by tier: a public channel with a weekly summary for the free tier, and per-user daily messages from the bot for paid users (account linking through `t.me/<bot>?start=<token>`).
- More channels can reuse the `Notifier` interface in `src/notify/telegram.ts`.
