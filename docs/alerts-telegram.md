# Telegram alerts

The digest job (`src/jobs/digest.ts`, CronJob `invest-buddy-digest`, 07:30 Tue to Sat, Europe/Bratislava) posts the day's rule state changes to one Telegram channel. Everyone gets the same message. Splitting free and paid tiers comes later, once this channel has run reliably.

## How it works

- After the daily scoring run, the job reads `alerts` for the latest `ingest_runs.as_of` and posts one message per ticker whose status band changed (`src/notify/format.ts`): band emoji slider with a marker, was and now with points, optional confirmation chips and data coverage, links to the company page and methodology, and the informational-screening line. Bands follow `docs/roadmap/lane-status.md`; missing data shows as "no data", never 0 points. With `ADVICE_OUTPUT` off the green band reads "Conditions met" ("Podmienky splnené"). Language comes from `DIGEST_LOCALE` (the CronJob sets `sk`).
- When `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are both set, the message goes to Telegram (Bot API `sendMessage`, parse mode HTML, no link preview). Otherwise the job keeps the old behaviour and prints to the log, which needs `DIGEST_TO`.
- Days with no state change are skipped. Set `TELEGRAM_POST_EMPTY=on` to post them anyway.
- Each post is recorded in `notification_deliveries` (migration 044) before it is sent, keyed by channel, chat, day, language and ticker. A rerun of the same day posts nothing. If a send fails, only that ticker's row is removed and the others still go out, so the next run retries just the failed one.
- On HTTP 429 the job waits for Telegram's `retry_after`. Errors from 5xx and the network are retried up to 3 times. Errors never include the bot token.
- Job counts in the log show `telegram: sent | duplicate | empty` plus `sent` and `duplicates` counts.

## Idea card (AL3)

When the judge stored an idea for a ticker that changed band, for the same date, the digest sends the idea card instead of the short message. A ticker with no stored idea still gets the short message above. The card has: band emoji, ticker and label; one line "Was ... Now ..."; a score line such as `Score 17 of 23 evidenced (74 %), data coverage 92 %` (from the audit fields of EN45, plain points when the audit has none); What happened (up to 3 bullets); Why it matters; Setup ratings (Company, Entry, Catalyst); up to 5 numbers; Plan; Evidence as links to the source URLs; the company page and methodology links; the disclaimer. EN or SK follows `DIGEST_LOCALE` and uses the stored Slovak translation, English when none is stored.

Telegram allows 4096 characters. A longer card loses whole sections, lowest priority first: numbers, setup, plan, why it matters, what happened, then evidence links from the end. A link is never cut.

`TELEGRAM_CARD_MODE`:

- `public` (default, any other value too): neutral band labels, no EUR amounts, no action words (Start, Add, Reduce), plan labelled Trigger, Invalidation and Opportunity cost. While `ADVICE_OUTPUT` is off, the card follows `docs/wording-gate.md` and holds back model text, ratings and plan: it shows the state, score line, evidence links, the company link and the disclaimer. With `ADVICE_OUTPUT` on, all sections show, minus EUR and action words.
- `owner`: for the owner's **private channel only**. Adds the action word and the EUR band from the idea to the header, and the plan reads When to start, When to add, When to stop, Opportunity cost. It ignores `ADVICE_OUTPUT`. Never set it on a channel others can read: it shows personal amounts and trade wording that ADR-001 keeps out of public output.

## One-time setup (owner)

1. In Telegram, open @BotFather, send `/newbot` and keep the token.
2. Create a channel (public or private). Add the bot as an administrator with the right to post messages.
3. Chat id: for a public channel use `@channelname`. For a private channel, post any message in it, open `https://api.telegram.org/bot<token>/getUpdates` in a browser and copy `channel_post.chat.id` (it starts with `-100`).
4. Create the secret in namespace `invest` as a sealed secret named `invest-buddy-telegram` with keys `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, through the infra repo like the other secrets. Never commit the plain value.
5. Copy the CronJob change from `deploy/gitops` into the infra repo. The env entries are `optional`, so the job still starts while the secret is missing.
6. First proof: run the job once by hand, for example `kubectl -n invest create job --from=cronjob/invest-buddy-digest digest-test-1`. Its log should end with `"telegram":"sent"` (or `"empty"` on a day without changes), and the post should appear in the channel.
7. Done 2026-10-10: the first manual run sent (`"telegram":"sent"`, 9 alerts). After the proof, set `suspend: false` on `invest-buddy-digest` in infra. `src/jobs/cronjob-order.test.ts` asserts the mirror keeps it suspended, so flip that assertion in the same PR.

## Wording

Messages use rule states and points only, never buy or sell wording (ADR-001). `src/jobs/digest.test.ts` checks the banned words in both languages. A public channel is still a public signal feed, so it falls under the same open lawyer question as the paid feed (tasks-open G5).

## Later

- Split by tier: a public channel with a weekly summary for the free tier, and per-user daily messages from the bot for paid users (account linking through `t.me/<bot>?start=<token>`).
- More channels can reuse the `Notifier` interface in `src/notify/telegram.ts`.
