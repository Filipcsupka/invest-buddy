# Free, paid and admin tier map (draft)

Status 2026-10-16. Updated with the owner decisions of the same day: a generous free tier, the whole track record free, no scanner row cap, no prices in beta, and the Telegram direction (sections 2, 3, 6 and 7). The tier code is in `src/config/tiers.ts`; `docs/paywall-segments.md` is the short pointer plus the legal gates.

Sources: competitor synthesis item 12 and the price anchors (`ops-brain/projects/investing-platform/research/competitors/_synthesis.md`), `research/market-homework/99-lessons.md` (free tier design), `130-positioning-and-business-model.md` section 8, `roadmap-2026q4/lane-web.md` W27 to W45, ADR-001, `docs/wording-gate.md`, and the current code (`src/paywall/segments.ts`, `src/components/paywall-segment.tsx`, `src/config/flags.ts`, `src/proxy.ts`, `src/app/sitemap.ts`).

## What the competitors gate

- Free tiers are capped by plain counts, not by hiding the result: TradingView 3 alerts and 1 watchlist, Simply Wall St 5 reports a month, Danelfin 10 reports a month, MarketScreener 40 screener results, Stock Rover's lowest paid plan 20 scores a month (99-lessons, V).
- Paid levers that recur: alerts (Finviz Elite, justETF), history depth (Finviz 3 versus 8 years, Fundamenty, Koyfin), fuller screens and export (Fundamenty Ultra, Finviz Elite) (130 section 8).
- Never hide the status itself, and keep locks visible (synthesis item 12). Validea hides thresholds behind the paywall; the synthesis lists that under "Avoid". Seeking Alpha gates full grades; 130 says we choose not to.
- Method text sits next to every performance figure and stays readable (Danelfin, Stockopedia, Validea, Finax). Alocano publishes its full method for free.
- Price anchors for later: justETF 9.90 EUR, Fundamenty 14 to 29 EUR, Alocano 249 to 449 CZK, Danelfin 22 EUR and up. The price is not part of this map.

## 1. Tier model

Three viewer tiers:

| Tier | Who | Sees |
| --- | --- | --- |
| `free` | Anonymous visitors and signed-in users without a paid entitlement, once `AUTH` is on | Free segments in full, depth-limited segments up to the free limit, a lock card for each paid segment |
| `paid` | Signed-in users with an active entitlement (W28, W30) | Everything in the tier map |
| `admin` | Everyone while `AUTH` is off; later only the owner account | Everything in the tier map, with a visible "Paid" badge on every paid or depth-limited segment |

Today's build has no auth, so every request resolves to `admin`. That keeps the site as open as it is now and makes the split reviewable on the live pages. When `AUTH` turns on, anonymous visitors become `free` and only the owner account stays `admin`.

Legal and owner gates are separate from tiers and do not change:

| Gate | What it holds back | Effect |
| --- | --- | --- |
| `ADVICE_OUTPUT` (off) | Action labels, size tiers, plans, `/sizing`, `/ideas` (see `docs/wording-gate.md`) | 404 or evidence-only card for every tier |
| `OWNER_VIEW` (off) | Owner EUR amounts, `/owner-allocation`, owner cash, `/owner/horizons` | 404 for every tier |
| `IDEAS_PAGE` | `/ideas` list | 404 for every tier |

Order of checks: the proxy and the page apply the legal and owner gates first and never read the viewer. The tier check runs only on content that passed those gates. `admin` does not bypass any of them. Owner pages are outside the tier map; their sections carry no tier and no badge. `WAITLIST` and `INSIDERS_PAGE` stay product switches and are not tiers either.

`PAYWALL` gets a new meaning: "enforce tiers for non-admin viewers". It no longer hides `/scanner`.

| `AUTH` | `PAYWALL` | Resolved viewer | Paid segments |
| --- | --- | --- | --- |
| off | any | `admin` | Shown with "Paid" badge |
| on | off | owner `admin`, others `free` | Shown to everyone; badge for admin only (soft launch, nothing locked) |
| on | on | owner `admin`, entitled `paid`, others `free` | `free` sees lock card or limited depth |

Admin preview: `?view=free` makes an `admin` request render as `free`, so the owner can check the lock cards before auth exists. The proxy turns it into a request header and adds `X-Robots-Tag: noindex`. It is ignored for non-admin viewers.


## 2. Tier table

Owner decision 2026-10-16: the free tier is generous, so a visitor sees why the paid tier is worth it. "Free sees" is the free viewer's version once tiers are enforced. Rows without an id need no marker. The ids match `src/config/tiers.ts`.

### Public pages

| Page / section | Segment id | Tier | Reason and evidence | Free sees |
| --- | --- | --- | --- | --- |
| Landing `/` | - | free | Shows the method before signup (justETF keeps information free) | All |
| Methodology `/methodology` | - | free | Rules, thresholds, weights and limits are the product's edge; thresholds never go behind a paywall (Alocano free; Validea avoided) | All |
| Legal `/legal/*` | - | free | Needed to read any score | All |
| Pricing `/pricing` (`WAITLIST`) | - | free | Free and paid comparison built from `tiers.ts`, no prices, waitlist form | All |
| Waitlist confirm and unsubscribe | - | free | Transactional | All |
| Dashboard `/dashboard`: table with status, score, search | - | free | Entry point and the status of every ticker; never hide the status (synthesis 12) | All |
| Dashboard: macro events, data status | - | free | Context for the status | All |
| Dashboard: discovery candidates (future) | `discovery-list` | paid | New names beyond the fixed screen (130: later, paid) | Lock card with count |
| Heatmap `/heatmap`, all metrics | - | free | Shareable SEO page with no advice (synthesis 15) | All |
| Insiders `/insiders`, last 180 days | - | free | Public SEC Form 4 data | Events from the last `insiderDays` (180) |
| Insiders: older events | `insiders-history` | paid | History depth lever (Finviz, Koyfin) | Note "older events are in the paid tier" |
| Portfolio: performance | `portfolio-performance` | free | ADR-001 asks for disclosure of the owner's holdings; Finex shows its real portfolio in public | All |
| Portfolio: weights | `portfolio-weights` | free | Same disclosure reason | All |
| Sizing `/sizing` (`ADVICE_OUTPUT`) | `sizing-matrix`, `sizing-cash`, `sizing-add`, `sizing-example` | free | ADR-001 says sizing is not a product; charging for it would deepen that conflict (130). Stays 404 while the gate is off | All, once the gate allows |
| Ideas `/ideas` (`IDEAS_PAGE` + `ADVICE_OUTPUT`) | `ideas-list` | paid | Most advice-like output; paid only if the lawyer clears it (130) | Lock card, once the gates allow |

### Scanner `/scanner`

| Section | Segment id | Tier | Reason and evidence | Free sees |
| --- | --- | --- | --- | --- |
| Search, state and sector filters, default sort, liquidity floor and its toggle | - | free | Basic screen; the floor is a data-quality default (synthesis 6) | All |
| Basic presets with names and match counts | - | free | Counts are status, not depth | All |
| Result rows, every ticker | `scanner-rows-full` | free | Owner 2026-10-16: no row cap. With about 36 tickers a cap would hide the product; `scannerRows` stays `null` | All rows |
| Score range, minimum F/T/M, source and held filters, sort by F/T/M | `scanner-filters-advanced` | paid | Full screens are paid at Koyfin and MarketScreener | Controls shown disabled with a lock note |
| "Rules met since N days", gained and lost counts, change presets | `scanner-streak` | paid | History-derived (TipRanks streak, synthesis 11) | Column hidden, lock note in the header |
| Saved screens (future, W36) | `saved-screens` | paid, free count | TradingView, Stock Rover limits | Up to `savedScreens` |

### Company page `/company/[ticker]`

| Section | Segment id | Tier | Reason and evidence | Free sees |
| --- | --- | --- | --- | --- |
| Header, SEO summary, status panel, score, F/T/M | - | free | Never hide the status; crawlable per-ticker pages (Danelfin SEO, Simply Wall St 120k pages) | All |
| Rules checklist with thresholds, values, points | - | free | Thresholds never behind a paywall; the open breakdown sets us apart (Simply Wall St, Chartmill; Validea avoided) | All |
| Rejection checks, inputs and sources | - | free | Explain the basic result (130 keeps `rules` and `inputs` free) | All |
| Flags block | - | free | Same flags for every user (synthesis 10) | All |
| Data status and coverage badge | - | free | Trust (Alocano, Stock Rover) | All |
| Price chart | - | free | Kept as today; the display licence question (ADR-002) is separate from tiers | All |
| Score history | `score-history` | paid, depth-limited | History depth is the standard lever (Finviz 3 vs 8 years) | Last `scoreHistoryDays` (90) days, note about the rest |
| Idea evidence (card with `ADVICE_OUTPUT` off: rule state and sources) | - | free | Evidence explains the status | All |
| Idea card with action, tier, plan (`ADVICE_OUTPUT` on) | `idea-card` | paid | Paid only if the lawyer clears it (130) | Lock card under the evidence |
| Watchlist star (future, W36) | `watchlist` | paid, free count | TradingView 1 watchlist free | Up to `watchlistTickers` |

### Track record `/track-record`

Owner 2026-10-16: the whole record is free. Publishing the misses is product principle 3, and Validea-style hiding of the record is on the synthesis "Avoid" list.

| Section | Segment id | Tier | Reason and evidence | Free sees |
| --- | --- | --- | --- | --- |
| Lede, live note, method text, data status | - | free | Method text beside every figure (Danelfin, Stockopedia, Finax) | All |
| Summary with signal count, losing count and worst outcome | - | free | Losers stay visible; no headline rate without method (synthesis 8, Tickeron avoided) | All |
| SPY benchmark (live and fixture) | `track-record-benchmark` | free | Context for the summary | All |
| By-period table | `track-record-periods` | free | Part of the full record | All |
| Worst outcomes list | `track-record-worst` | free | The misses are published | All |
| Signals table | `track-record-signals` | free | Part of the full record | All |
| Score snapshot history | `track-record-history` | free | Part of the full record; `trackRecordHistoryDays` is `null` | All |

### Delivery and export

| Feature | Id | Tier | Reason and evidence | Free gets |
| --- | --- | --- | --- | --- |
| Telegram public channel (today, one channel) | - | free | Same daily state changes for everyone (`docs/alerts-telegram.md`); the free funnel | All |
| Weekly summary mail (W38) | `alerts-weekly` | free | 130: free-limited weekly | All |
| Per-user daily alerts on the watchlist (W37) | `alerts-daily` | paid, free count | Alerts are the main paid lever (Finviz Elite, justETF; TradingView 3 free) | Up to `alerts` tickers |
| CSV export (W35) | `csv-export` | paid | Heavy users (Fundamenty Ultra, Finviz Elite) | Not offered; button with lock note |

### Owner (outside tiers)

`/owner-allocation` (`owner-cash`, `owner-suggestions`) and `/owner/horizons` stay behind `OWNER_VIEW` and basic auth. They get no tier and no badge, and `admin` does not open them.

## 3. Free-tier depth

One place: `TIER_LIMITS` in `src/config/tiers.ts`. Pages, the pricing table and later the alert job read only from there. `null` means no limit. The free values below are in the code; the owner confirmed the direction (generous free tier) on 2026-10-16 and has not signed off every number.

| Key | Free | Paid | Basis |
| --- | --- | --- | --- |
| `scoreHistoryDays` | 90 | `null` | History started 2026-10-02, so 90 days is a lever only from the new year; the free window grows into the paid one slowly |
| `scannerRows` | `null` | `null` | Every ticker is free |
| `savedScreens` | 1 | 20 | TradingView 1 watchlist, Stock Rover plan limits |
| `alerts` | 3 | 50 | TradingView 3 free alerts |
| `watchlistTickers` | 10 | 200 | Sharesight free plan: 10 holdings |
| `insiderDays` | 180 | `null` | Half a year of events is enough to read the pattern |
| `trackRecordHistoryDays` | `null` | `null` | The whole record is free |

Paid caps exist only to stop abuse. Prices: none in beta (W17). The pricing page says so and shows no number.

## 4. Implementation

### Files and contracts

- `src/config/tiers.ts` (new): `TIERS: Record<SegmentId, { tier: "free" | "paid"; mode: "lock" | "limit"; limit?: LimitKey }>` and `TIER_LIMITS`. Pure data, typed by the keys of `PAYWALL_SEGMENTS`, so a new segment without a tier fails the type check.
- `src/paywall/segments.ts`: stays the registry of ids and descriptions. Drop `owner-cash` and `owner-suggestions`. Add `scanner-filters-advanced`, `scanner-streak`, `insiders-history`, `track-record-periods`, `ideas-list`. Feature ids for later (`discovery-list`, `saved-screens`, `watchlist`, `alerts-weekly`, `alerts-daily`, `csv-export`) go in a separate `FEATURES` list in `tiers.ts`, because they are not page markers yet.
- `src/viewer/get-viewer.ts` (new): `getViewer(): Promise<{ tier: "free" | "paid" | "admin"; preview: boolean }>`. `AUTH` off returns `admin`. Later it reads the W29 session and W30 entitlements. Helpers `canSee(viewer, id)` and `limitFor(viewer, key)` are pure and tested apart from the request.
- `src/components/paywall-segment.tsx`: async server component.
  - `admin`: children plus a small "Paid" badge rendered as a sibling before the element, so the existing `cloneElement` shape and `data-paywall-candidate` stay as they are. Adds `data-tier="paid"`.
  - `paid`, or a free segment: children unchanged.
  - `free` on a `lock` segment: `TierLock` card instead of the children. The locked text must not be in the HTML.
  - `free` on a `limit` segment: children (the page already passed limited rows) plus a one-line depth note.
- `src/components/tier-lock.tsx` and `tier.module.css` (new): lock card and badge. Own CSS module, so `globals.css` stays untouched.
- `src/i18n/tier-messages.ts` (new, EN and SK): badge text, lock card text and one teaser line per segment id. Kept out of `messages.ts` to avoid merge conflicts with other lanes.
- Pages call `canSee`/`limitFor` before an expensive loader, so locked data is never fetched. Example: the company page passes `limitFor(viewer, "scoreHistoryDays")` to the history query.
- Un-hide `/scanner`: remove the `section === "scanner" && !featureFlags.PAYWALL` rule in `src/proxy.ts` and the `if (!flags().PAYWALL) notFound()` in the scanner page. Update the `PAYWALL` comment in `flags.ts`. `docs/paywall-segments.md` is corrected: `/scanner` never redirected, it returned 404 while `PAYWALL` was off.

### SEO

- Tiers never change whether a page is indexed. Crawlers are anonymous, so once tiers are enforced they get the free version, and locked text is not in the HTML (W31 acceptance test on rendered markup).
- No page whose main content is paid goes in the sitemap. Today that only affects `/ideas`, which the legal gate already keeps out.
- The sitemap lists the bare `/scanner` and `/heatmap` (both free and carry no advice). Filtered scanner URLs keep `noindex`, `?view=` previews get `X-Robots-Tag: noindex`, and neither appears in the sitemap (`sitemap.test.ts` checks that no listed URL has a query string).
- `TickerSeoSummary`, titles and descriptions use free fields only (status, rules met), as they do today.
- Reading the viewer makes a page dynamic. Any later page cache (W5) must key on tier or cache only the free shell.

### Tests

- `tiers.test.ts`: every registry id has a tier; every `limit` entry names a key in `TIER_LIMITS`; no owner id in the map.
- `get-viewer.test.ts`: the `AUTH`/`PAYWALL` matrix above; `?view=free` honoured only for `admin`.
- `segments.test.tsx`: admin output equals today's markup plus the badge sibling; free lock output contains none of the child text; free limit output keeps the children.
- Gate tests: with `admin`, `ADVICE_OUTPUT` off still gives 404 for `/sizing` and `/ideas` and the evidence-only card; `OWNER_VIEW` off still gives 404 for owner routes.
- Doc drift: a test reads the id column of this file's tables and compares it with `TIERS`.

## 5. Work packages

WP1 lands first. WP2 to WP4 can start in parallel against the contracts in section 4 and rebase on WP1. No two packages edit the same file.

| WP | Scope | Files owned |
| --- | --- | --- |
| WP1 core | Tier map, limits, viewer, gate component, lock card, tier strings, proxy and flag change, owner markers removed, tests | `src/config/tiers.ts`, `src/config/tiers.test.ts`, `src/config/flags.ts`, `src/viewer/*`, `src/paywall/segments.ts`, `src/paywall/segments.test.tsx`, `src/components/paywall-segment.tsx`, `src/components/tier-lock.tsx`, `src/components/tier.module.css`, `src/i18n/tier-messages.ts`, `src/proxy.ts` and its tests, `src/app/[locale]/owner-allocation/page.tsx` |
| WP2 company and record | Score history limit, idea card wrap only when `ADVICE_OUTPUT` is on, track record split (periods marker, summary line with losing count and worst outcome, history limit) | `src/app/[locale]/company/[ticker]/*`, `src/components/score-history.tsx`, `src/components/idea-card.tsx`, `src/db/history.ts` and its tests, `src/app/[locale]/track-record/*`, `src/i18n/record-signal.ts` |
| WP3 screens | Scanner un-hide in the page, row cap, advanced filter and streak markers; insiders depth; scanner link in nav; dashboard, heatmap and portfolio checked as free (no change expected) | `src/app/[locale]/scanner/*`, `src/app/[locale]/insiders/*`, `src/components/insider-panel*`, `src/app/[locale]/dashboard/*`, `src/app/[locale]/heatmap/*`, `src/app/[locale]/portfolio/*`, `src/components/nav.tsx`, `src/app/page-log.test.ts` |
| WP4 docs and pricing | Rewrite `docs/paywall-segments.md` as a pointer plus legal-gate table; pricing page free and paid table built from `TIERS` and `TIER_LIMITS`; sitemap test wording; this file's status | `docs/paywall-segments.md`, `docs/tier-map.md`, `docs/wording-gate.md`, `src/app/[locale]/pricing/*`, `src/i18n/launch-messages.ts`, `src/app/sitemap.ts`, `src/app/sitemap.test.ts` |

i18n rule: nobody edits `src/i18n/messages.ts` for this work. WP1 writes every lock and teaser string listed in section 2 into `tier-messages.ts`. If WP2 or WP3 needs another string, it goes in a page-local file such as `src/i18n/tier-company-messages.ts`, following `scanner-floor-messages.ts`.


## 6. Owner questions

Answered on 2026-10-16:

1. Admin "Paid" badges: admin sees everything with Paid badges (master account, auth later). While `AUTH` is off every visitor resolves to `admin`, so the badges show on the public site until auth exists. Answered; whether to hide them behind a preview switch in the meantime is still open (see below).
2. Track record: the whole record is free, misses included. Answered (section 2). Sections stay marked in the registry as free ids.
3. Depth numbers: direction confirmed (generous free tier). The values in section 3 are what the code uses. Answered for direction; individual numbers can still change in `TIER_LIMITS`.
4. Scanner cap: no cap. Every ticker is free; advanced filters and the streak are paid. Answered.
5. Delay on free scores: no delay, same-day scores for everyone. Answered. `PRODUCT.md` still mentions "delayed top-level scores" and should be corrected.
6. Telegram: one public channel stays the free funnel, with per-user alerts as the paid product. Answered in principle; the delivery mechanism is open (section 7).
7. Prices: none in beta (W17). Answered.

Still open:

- Should the Paid badges be visible to anonymous visitors before `AUTH` exists, or only with a preview switch? Today the proxy only turns on `?view=free` for admin.
- Section 7: which delivery option for paid alerts.
- The lawyer questions on `ideas-list` and `idea-card` (G5 in `docs/tasks-open.md`) decide whether those two ever ship, in any tier.

## 7. Telegram decision for the owner

Today: one public channel, about 2 subscribers, fed by the digest job (`docs/alerts-telegram.md`). Everyone gets the same daily state changes, with up to 3 rule-change lines per ticker. No Telegram code changes with this document.

Proposal:

- Keep the public channel as the free funnel. Same daily state changes, same message for all, no change.
- Paid alerts come later as per-user alerts, once auth and billing exist. They carry rule-level changes on the user's watchlist ("Now meets", "No longer meets") and a weekly digest of new matches. They need accounts, so they cannot start before W29 and W30.

Options for the paid delivery:

| Option | What it needs | Membership and unsubscribe | Fit |
| --- | --- | --- | --- |
| A. One channel for all | Nothing new | None; everyone sees everything, so nothing can be paid | Fine for the free funnel only. It cannot carry a per-user watchlist. |
| B. Two channels: public and private paid | A second channel with its own chat id (new secret key), the bot as admin there, an invite-link flow | Someone must add and remove members when a plan starts or ends. Telegram invite links can be single-use and expiring; removal is a bot call, but it has to be wired to billing. Unsubscribe means leaving the channel or losing the entitlement. | One feed for all paid users. It cannot filter by each user's watchlist, so it is a bigger feed, not a personal one. |
| C. Bot DM per user | The existing bot works for DMs. Needs account linking (`t.me/<bot>?start=<token>` from the settings page) and a store of user chat ids, and the delivery job must read each user's watchlist | The user must press Start first; a user can block the bot at any time (the send then fails and the link should be marked inactive). Unsubscribe is a setting in the app plus `/stop` in the bot. | The only option that gives a per-user watchlist. Sends are many small messages, so the job needs rate limits (Telegram caps bulk sends) and the existing `notification_deliveries` dedupe keyed per user. |

Recommendation: A for free, C for paid. The paid product is defined by the watchlist, and only a bot DM can follow it. Option B adds membership management and still does not personalise. Revisit B only if users ask for a shared private feed. Cost of C is the account link, one new table for chat ids, and a per-user job in `src/jobs/digest.ts`. It reuses the bot, the message formatter and the delivery table.

What the owner has to supply for C when auth and billing exist: nothing new for the bot token (the same `invest-buddy-telegram` secret); a decision whether the bot name stays public; and the privacy text change for storing a Telegram chat id (legal pages).

Open point for the owner: confirm A plus C, or ask for B first. The lawyer question on a public signal feed (G5) applies to A and to every option.
