# Welcome, sign-in and pricing: screens and measurements

## Welcome story (2026-11-10)

Everything below the hero is the presentation from the owner brief: problem and method, the score build, areas with the signed-in panel preview and a sample scanner, real SEC filings, the record, plans, questions and sign-up. It lives in `src/components/welcome/story.tsx` and reads no flag, store or request API. Pattern choices are in `story-research.md`.

Measured on a production build (`DATA_MODE=fixture npm run build`, standalone server), laptop, Lighthouse 13.5.0 mobile preset with default throttling.

### Payload

| Route | HTML raw | HTML gzip | Before (2026-11-09) |
| --- | --- | --- | --- |
| `/en` | 194 KB | 35 KB | 144 KB raw, 22 KB gzip |
| `/sk` | 200 KB | 38 KB | 146 KB raw, 24 KB gzip |

`Cache-Control: s-maxage=3600, stale-while-revalidate`, no `Set-Cookie`. About 62% of the raw HTML is the RSC payload, which repeats the markup as JSON. To stay near the 200 KB budget the story marks (state chips, result marks, locks, arrows) are CSS masks instead of inline SVG, and repeated table rows are styled by structure rather than a class per cell. The shared shell (sidebar, footer) is about 10 KB of markup on top; removing the sidebar for anonymous visitors will lower both figures.

### JavaScript (gzip, every script the browser fetched)

| Case | Total | Notes |
| --- | --- | --- |
| Welcome, motion allowed | 243 KB | Shared shell plus the 49.6 KB motion chunk (gsap, ScrollTrigger, Lenis), loaded after idle |
| Welcome, reduced motion | 193 KB | Motion chunk never fetched |
| `/en/methodology` for comparison | 195 KB | Same shared shell |

The story adds no client JavaScript: all new blocks are server components. The 120 KB budget for the route is not met because the shared app shell is about 193 KB on every route; that needs a change in the layout, outside this page.

### Lighthouse (mobile)

| Route | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/en` | 93 | 100 | 100 | 100 | 3.2 s | 0 | 20 ms |
| `/sk` | 88 to 89 | 100 | 100 | 100 | 3.7 s | 0 | 20 ms |

LCP stays the hero lede, delayed by the two shared render-blocking stylesheets (Lighthouse estimates 290 ms on `/en`, up to 990 ms on `/sk`). `/sk` was 87 to 88 before this change.

### Checks

- `e2e/welcome-board.spec.ts`: no text box overlaps another inside a scoreboard row, and nothing leaves the board, at 375, 768, 1024, 1200 and 1440 px in both locales. Fixed bug: "Sample" and "Score" were drawn over the company name when the board was narrow (375 px and 1024 to 1280 px with the sidebar). The board now picks its columns from its own width (container query) and the SAMPLE mark wraps under the ticker.
- No horizontal page scroll at 375 and 768 px. No hydration error in the console.

### Screens

Full pages, motion allowed and scrolled through once so every reveal has played. 1440 px shots are saved at half size, 768 px at 0.6, 375 px at 0.8, all as 256-colour PNG.

- Welcome: `welcome-{375,768,1440}-{light,dark}.png`, `welcome-sk-{375,1440}-light.png` (reduced motion)
- Reduced motion (the static page): `reduced-welcome-{375,1440}-{light,dark}.png`
- Score story frame strips: `scroll-strip-1440.png`, `scroll-strip-390.png`, eight frames each while the pinned sequence assembles the sample score

## Sign-in and pricing (2026-11-09)

| Route | HTML raw | HTML gzip | Lighthouse performance | Accessibility |
| --- | --- | --- | --- | --- |
| `/en/pricing` | 81 KB | 15 KB | 93 | 100 |
| `/en/reset` | 35 KB | 8 KB | | |
| `/en/sign-in` | 40 KB | 9 KB | 94 | 100 |

- Pricing: `pricing-{375,768,1440}-{light,dark}.png`
- Sign-up, recovery codes and reset: `signin-signup-*`, `signin-codes-*`, `reset-*` at 375, 768 and 1440 in both themes
- Every auth state at 375 px, light: `state-signin-{mode,sending,weak-password,invalid-email,wrong-password,exists,rate-limited,network,unavailable,denied,codes-failed}-375-light.png`, `state-reset-{bad-code,done,rate-limited}-375-light.png`

Auth responses in the state shots are mocked in the browser. No auth handler ran.
