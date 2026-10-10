# Telegram alerts

The digest job (`src/jobs/digest.ts`, CronJob `invest-buddy-digest`, 07:30 Tue to Sat, Europe/Bratislava) posts the day's rule state changes to one Telegram channel. Everyone gets the same message. Splitting free and paid tiers comes later, once this channel has run reliably.

## How it works

- After the daily scoring run, the job reads `alerts` for the latest `ingest_runs.as_of` and builds one message: state changes with the old and new state and score, the informational-screening line, and a link to the dashboard. Language comes from `DIGEST_LOCALE` (the CronJob sets `sk`).
- When `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are both set, the message goes to Telegram (Bot API `sendMessage`, plain text, no link preview). Otherwise the job keeps the old behaviour and prints to the log, which needs `DIGEST_TO`.
- Days with no state change are skipped. Set `TELEGRAM_POST_EMPTY=on` to post them anyway.
- Each post is recorded in `notification_deliveries` (migration 044) before it is sent, keyed by channel, chat, day and language. A rerun of the same day posts nothing. If the send fails, the row is removed, so the next run tries again.
- On HTTP 429 the job waits for Telegram's `retry_after`. Errors from 5xx and the network are retried up to 3 times. Errors never include the bot token.
- Job counts in the log show `telegram: sent | duplicate | empty`.

## One-time setup (owner)

1. In Telegram, open @BotFather, send `/newbot` and keep the token.
2. Create a channel (public or private). Add the bot as an administrator with the right to post messages.
3. Chat id: for a public channel use `@channelname`. For a private channel, post any message in it, open `https://api.telegram.org/bot<token>/getUpdates` in a browser and copy `channel_post.chat.id` (it starts with `-100`).
4. Create the secret in namespace `invest` as a sealed secret named `invest-buddy-telegram` with keys `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, through the infra repo like the other secrets. Never commit the plain value.
5. Copy the CronJob change from `deploy/gitops` into the infra repo. The env entries are `optional`, so the job still starts while the secret is missing.
6. First proof: run the job once by hand, for example `kubectl -n invest create job --from=cronjob/invest-buddy-digest digest-test-1`. Its log should end with `"telegram":"sent"` (or `"empty"` on a day without changes), and the post should appear in the channel.
7. After the proof, set `suspend: false` on `invest-buddy-digest` in infra. `src/jobs/cronjob-order.test.ts` asserts the mirror keeps it suspended, so flip that assertion in the same PR.

## Wording

Messages use rule states and points only, never buy or sell wording (ADR-001). `src/jobs/digest.test.ts` checks the banned words in both languages. A public channel is still a public signal feed, so it falls under the same open lawyer question as the paid feed (tasks-open G5).

## Later

- Split by tier: a public channel with a weekly summary for the free tier, and per-user daily messages from the bot for paid users (account linking through `t.me/<bot>?start=<token>`).
- More channels can reuse the `Notifier` interface in `src/notify/telegram.ts`.
