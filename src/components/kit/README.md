# Component kit

Shared parts for the page rebuilds. Import from `@/components/kit`. Styles are in `kit.css`, loaded once by `src/app/[locale]/layout.tsx`. Every colour comes from a token in `src/app/globals.css`. Copy for the kit lives in `src/i18n/kit-messages.ts`, so `messages.ts` stays untouched.

Review every component in every state at `/en/design` and `/sk/design`. The route opens outside production builds, with `DATA_MODE=fixture`, or with `DESIGN_VIEW=on`. It is noindex and not in the sitemap.

## Motion

Components that move take `motion`:

- `"none"` (default): still.
- `"load"`: plays once on first paint. CSS only, no JavaScript.
- `"view"`: plays once when a quarter of it scrolls into view, through the `Motion` island. Content that is already on screen at hydration does not move, so nothing jumps back to its start frame.

Every keyframe is a `from` frame over the final state. Reduced motion, no JavaScript and printing all show the final reading. Give a page one authored moment. Do not put motion on every section.

## Components

| Component | Props | Notes |
| --- | --- | --- |
| `StateChip` | `state: KitState`, `label`, `size?: "sm" \| "md" \| "lg"`, `describedBy?`, `iconOnly?` | Seven states: `setup`, `watch`, `pullback`, `wait`, `ignore`, `broken`, `insufficient`. Label, shape and band colour each carry the state. `kitState(state, pullback)` folds the qualifier in. Labels come from `m.status.labels` and `m.states.pullback`. |
| `ScoreBar` | `percent: number \| null`, `state`, `stateLabel`, `locale`, `label?`, `motion?`, `describedBy?`, `size?: "sm" \| "md"` | `role="meter"` with the percent and state as value text. Ticks at the 48, 60 and 72% cutoffs. `null` gives a dashed empty track and "No score". |
| `ScoreDial` | as ScoreBar, plus `size?: "md" \| "lg"`, `caption?` | 270 degree arc. The percent sits in the middle on tabular figures. |
| `RuleTable` | `locale`, `label`, `caption?`, `labelledBy?`, `motion?`, `describedBy?`, `children` | Header row: Rule, Needs, Value, Result, Points. Group rows: `<tr className="kit-rule-group"><th colSpan={5} scope="colgroup">`. |
| `RuleRow` | `name`, `needs`, `value?`, `result: "pass" \| "fail" \| "none"`, `max`, `locale`, `id?`, `detail?`, `index?` | Points read "+3 of 3", "0 of 2" or "No data", never 0 for missing data. `id` becomes `rule-{id}`. Pass `index` for the check-in stagger. Under 640px, Needs folds under the name. |
| `CountUp` | `value`, `locale`, `format?: "number" \| "percent"`, `motion?` (default `"load"`), `className?` | Counts integers from 0 to 999 with a registered CSS property. The final localized text sizes the box and is what screen readers read. Decimals and larger numbers stay still. |
| `Reveal` | `children`, `as?`, `className?`, `id?`, `mode?: "view" \| "scroll"`, `delay?` | Opacity, a 1.25rem rise and a 4px blur, exponential ease-out. `scroll` uses a CSS view timeline where the browser has one. |
| `StateStrip` | `label`, `changes: StateChange[]`, `empty`, `pauseLabel`, `playLabel`, `secondsPerItem?` | Client component. Slow loop that stops on hover, on focus, with the pause button and while off screen. With reduced motion it is a still list that scrolls. |
| `TierBadge` | `tier: "free" \| "paid"`, `label` | Paid is a solid mulberry stamp with a padlock. Free is a neutral outline. |
| `TierFrame` | `badgeLabel`, `tier?`, `note?`, `children`, `className?` | Hairline frame with the badge set into its top edge. Set `--frame-bg` when it sits on `--sheet`. |
| `LockCard` | `title`, `behindLabel`, `items`, `badgeLabel`, `status?`, `statusNote?`, `action?` | Stands in for a paid section. The status renders first and stays visible. The paid content is left out of the page, not blurred. |
| `TierBanner` | `mode?: "hidden" \| "admin"`, `title`, `note`, `badgeLabel` | Slim banner under the header. The layout passes `"hidden"` until the tier logic decides. |
| `SectionHead` | `title`, `as?: "h2" \| "h3"`, `id?`, `lede?`, `meta?`, `rule?: "ink" \| "quiet"` | Rule above, title left, meta right. Nothing goes above the title. |
| `DataTable` | `label`, `caption?`, `bounded?`, `density?: "default" \| "compact"`, `stickyFirst?`, `describedBy?`, `children` | Labelled, focusable scroll region with a sticky header. Cells take `className="num"`. Mark a selected row with `data-selected`. `DataTableEmpty` gives a full-width empty row. |
| `Motion`, `MotionRoot` | `as?`, HTML attributes | The island behind `motion="view"`, and the server wrapper that picks it. |

## Rules for page writers

- Put the disclaimer next to every score and pass its id as `describedBy`. Keep the SAMPLE DATA stamp where data is sample.
- Do not use colour alone. A chip always has its label, and a bar or dial sits next to a chip.
- Use band colours (`--st-*`) for state only. Rule passes use the signal. Tier marks use `--tier` only.
- Run `npm run check:contrast` after any token change. `npx tsx scripts/check-contrast.ts --table` prints every pair.
