# Accessibility and mobile audit, Q4 2026 (W24)

Scope: dashboard, company, methodology, track record, insiders, scanner. Method: code review of markup and `src/app/globals.css` plus automated checks (no browser available in this pass). Status: fixed or deferred.

| # | Finding | Status |
| --- | --- | --- |
| 1 | Scrollable table boxes (`.table-scroll`, sizing matrix) were not keyboard reachable, so a keyboard user could not scroll a wide table. Now `role="region"`, `tabindex="0"` and a label from the table title (all tables, both locales). | Fixed |
| 2 | Tap targets under 44 px: nav links, language switch, theme toggle, footer links, state filter chips, search field, table sort buttons, ticker links in rows. Now 44 px (`2.75rem`), ticker links by an enlarged hit area. | Fixed |
| 3 | Status legend and score history tables sat outside a scroll box and could force horizontal page scroll at 360 px. Now inside one. | Fixed |
| 4 | Contrast of text, status and border tokens in light and dark. All pairs pass AA (4.5 text, 3 borders); `ink-3` on ground is 5.0 light and 5.8 dark. Now checked by `npm run check:contrast` and a test. | Checked, no change |
| 5 | Skip link, `main` focus target, `lang`, landmarks (header, nav with labels, main, footer), one `h1` per page, no skipped heading level, table header cells, `prefers-reduced-motion`. Present; now covered by `src/a11y.test.tsx` and `src/a11y-css.test.ts`. | Checked, no change |
| 6 | Real focus order, focus ring visibility on each background, 360 px layout and horizontal scroll, screen reader output. Needs a browser. | Deferred |

## Manual follow-ups

1. Playwright and `@axe-core/playwright` on all public routes in EN and SK, light and dark (W8 specs); needs a browser in CI.
2. Screenshots at 360 and 768 px, check no page-level horizontal scroll, check the status slider captions on 360 px.
3. Tab through dashboard sort, filter, language switch and theme toggle; confirm the focus ring is visible on the sticky header and on dark chips.
4. Screen reader pass (VoiceOver Safari iOS, TalkBack) on the status slider, rule rows and table regions.
5. Lighthouse accessibility and best-practices scores into `docs/perf.md`.
6. Check forced-colors mode on the status slider.
