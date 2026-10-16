# Free, paid and admin tier map (draft)

Status 2026-10-16. First draft for owner review, no code changed yet. It replaces the "Candidate" column in `docs/paywall-segments.md` once the owner signs it off (lane-web W32).

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
| `OWNER_VIEW` (off) | Owner EUR amounts, `/owner-allocation`, owner cash, `/owner/research` | 404 for every tier |
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

"Free sees" is the free viewer's version once tiers are enforced. Rows without an id need no marker.

### Public pages

| Page / section | Segment id | Tier | Reason and evidence | Free sees |
| --- | --- | --- | --- | --- |
| Landing `/` | - | free | Shows the method before signup (justETF keeps information free) | All |
| Methodology `/methodology` | - | free | Rules, thresholds, weights and limits are the product's edge; thresholds never go behind a paywall (Alocano free; Validea avoided) | All |
| Legal `/legal/*` | - | free | Needed to read any score | All |
| Pricing `/pricing` (`WAITLIST`) | - | free | Plan table and waitlist form | All |
| Waitlist confirm and unsubscribe | - | free | Transactional | All |
| Dashboard `/dashboard`: table with status, score, search | - | free | Entry point and the status of every ticker; never hide the status (synthesis 12; Finviz and TradingView free tools build habit) | All |
| Dashboard: macro events, data status | - | free | Context for the status | All |
| Dashboard: discovery candidates (future) | `discovery-list` | paid | New names beyond the fixed screen (130: later, paid) | Lock card with count |
| Heatmap `/heatmap`, all metrics | - | free | Shareable SEO page with no advice (synthesis 15) | All |
| Insiders `/insiders`, latest events | - | free | Public SEC Form 4 data | Events from the last `insiderDays` |
| Insiders: older events | `insiders-history` | paid | History depth lever (Finviz, Koyfin) | Note "older events are in the paid tier" |
| Portfolio: performance | `portfolio-performance` | free | ADR-001 asks for disclosure of the owner's holdings; Finex shows its real portfolio in public | All |
| Portfolio: weights | `portfolio-weights` | free | Same disclosure reason | All |
| Sizing `/sizing` (`ADVICE_OUTPUT`) | `sizing-matrix`, `sizing-cash`, `sizing-add`, `sizing-example` | free | ADR-001 says sizing is not a product; charging for it would deepen that conflict (130). Stays 404 while the gate is off | All, once the gate allows |
| Ideas `/ideas` (`IDEAS_PAGE` + `ADVICE_OUTPUT`) | `ideas-list` | paid | Most advice-like output; paid only if the lawyer clears it (130) | Lock card, once the gates allow |

### Scanner `/scanner`

| Section | Segment id | Tier | Reason and evidence | Free sees |
| --- | --- | --- | --- | --- |
| Search, state and sector filters, default sort, liquidity floor and its toggle | - | free | Basic screen; the floor is a data-quality default (synthesis 6) | All |
| Presets with names and match counts | - | free | Counts are status, not depth | All; opening one applies the row cap |
| Result rows up to `scannerRows` | - | free | Count cap like MarketScreener's 40 results | First rows in the default sort |
| Rows beyond the cap | `scanner-rows-full` | paid | Same | Teaser row "N more rows in the paid tier" |
| Score range, minimum F/T/M, source and held filters, sort by F/T/M | `scanner-filters-advanced` | paid | Full screens are paid at Koyfin and MarketScreener | Controls shown disabled with a lock note |
| "Rules met since N days", gained and lost counts | `scanner-streak` | paid | History-derived (TipRanks streak, synthesis 11) | Column hidden, lock note in the header |
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
| Score history | `score-history` | paid, depth-limited | History depth is the standard lever (Finviz 3 vs 8 years) | Last `scoreHistoryDays` days, note about the rest |
| Idea evidence (card with `ADVICE_OUTPUT` off: rule state and sources) | - | free | Evidence explains the status | All |
| Idea card with action, tier, plan (`ADVICE_OUTPUT` on) | `idea-card` | paid | Paid only if the lawyer clears it (130) | Lock card under the evidence |
| Watchlist star (future, W36) | `watchlist` | paid, free count | TradingView 1 watchlist free | Up to `watchlistTickers` |

### Track record `/track-record`

| Section | Segment id | Tier | Reason and evidence | Free sees |
| --- | --- | --- | --- | --- |
| Lede, live note, method text, data status | - | free | Method text beside every figure (Danelfin, Stockopedia, Finax) | All |
| Summary, including signal count, losing count and worst outcome as one line | - | free | Losers stay visible; no headline rate without method (synthesis 8, Tickeron avoided) | All |
| SPY benchmark (live and fixture) | `track-record-benchmark` | free | Context for the summary | All |
| By-period table | `track-record-periods` (new) | paid | Detailed record (owner brief for this draft) | Lock card |
| Worst outcomes list | `track-record-worst` | paid | Same | Lock card; the summary still names the worst outcome |
| Signals table | `track-record-signals` | paid | Same | Lock card with the signal count |
| Score snapshot history | `track-record-history` | paid, depth-limited | History depth | Latest scan day |

### Delivery and export

| Feature | Id | Tier | Reason and evidence | Free gets |
| --- | --- | --- | --- | --- |
| Telegram digest (today, one public channel) | - | free | Same message for everyone (`docs/alerts-telegram.md`) | All |
| Weekly summary mail (W38) | `alerts-weekly` | free | 130: free-limited weekly | All |
| Daily state-change alerts per ticker (W37) | `alerts-daily` | paid, free count | Alerts are the main paid lever (Finviz Elite, justETF; TradingView 3 free) | Up to `alerts` tickers |
| CSV export (W35) | `csv-export` | paid | Heavy users (Fundamenty Ultra, Finviz Elite) | Not offered; button with lock note |

### Owner (outside tiers)

`/owner-allocation` (`owner-cash`, `owner-suggestions`) and `/owner/research/[symbol]` stay behind `OWNER_VIEW` and basic auth. They get no tier and no badge, and `admin` does not open them.

## 3. Free-tier depth (proposed, owner to confirm)

One place: `TIER_LIMITS` in `src/config/tiers.ts`. Pages, the pricing table and later the alert job read only from there. `null` means no limit.

| Key | Free (proposed) | Paid | Basis |
| --- | --- | --- | --- |
| `scoreHistoryDays` | 30 | `null` | History started 2026-10-02, so 30 days shows nearly everything until mid November |
| `scannerRows` | 20 | `null` | Universe is about 36 tickers; revisit when discovery widens it |
| `savedScreens` | 1 | 20 | TradingView 1 watchlist, Stock Rover plan limits |
| `alerts` | 3 | 50 | TradingView 3 free alerts |
| `watchlistTickers` | 10 | 200 | Sharesight free plan: 10 holdings |
| `insiderDays` | 90 | `null` | Recent events only |
| `trackRecordHistoryDays` | 1 | `null` | Latest scan day; the dashboard shows it anyway |

All values are owner to confirm. Paid caps exist only to stop abuse.

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
- Un-hide `/scanner`: remove the `section === "scanner" && !featureFlags.PAYWALL` rule in `src/proxy.ts` and the `if (!flags().PAYWALL) notFound()` in the scanner page. Update the `PAYWALL` comment in `flags.ts`. Fix `docs/paywall-segments.md`, which says `/scanner` redirects to the dashboard while it really returns 404.

### SEO

- Tiers never change whether a page is indexed. Crawlers are anonymous, so once tiers are enforced they get the free version, and locked text is not in the HTML (W31 acceptance test on rendered markup).
- No page whose main content is paid goes in the sitemap. Today that only affects `/ideas`, which the legal gate already keeps out.
- `/scanner` stays out of the sitemap while it shows the same universe as `/dashboard` (the canonical screen in `sitemap.test.ts`). Base `/scanner` is indexable; filtered URLs keep `noindex`; `?view=` previews get `X-Robots-Tag: noindex`.
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

## 6. Open questions for the owner

1. Should the "Paid" badges show on the public site while `AUTH` is off, or only to a preview switch? Every visitor is `admin` today, and the pricing page says "free while we test, no prices yet".
2. This draft puts track record signals, by-period and worst outcomes in paid. 130 and the synthesis treat the full record as a free trust asset. Is the free summary line with the losing count and worst outcome enough?
3. The depth numbers in section 3.
4. With about 36 tickers, is a 20-row scanner cap worth having before discovery widens the universe, and should the advanced filters be paid?
5. Free scores are proposed as same-day, with no delay. PRODUCT.md mentions "delayed top-level scores" for free. Which one?
6. Should the Telegram channel stay one free public channel after tiers, with per-user daily alerts as the only paid alert product?
