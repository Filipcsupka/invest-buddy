# Welcome, sign-in and pricing: screens and measurements

Production build (`WAITLIST=on DATA_MODE=fixture npm run build`, standalone server), measured 2026-11-09 on a laptop. Lighthouse 13.5.0, mobile preset with its default throttling.

## Payload

| Route | HTML raw | HTML gzip | Render |
| --- | --- | --- | --- |
| `/en` | 144 KB | 22 KB | static (SSG), `Cache-Control: s-maxage=3600, stale-while-revalidate`, no `Set-Cookie` |
| `/sk` | 146 KB | 24 KB | static (SSG) |
| `/en/pricing` | 81 KB | 15 KB | static (SSG) |
| `/en/reset` | 35 KB | 8 KB | static (SSG) |
| `/en/sign-in` | 40 KB | 9 KB | dynamic (reads `next` and `error` from the query) |

JavaScript, gzip, all files a browser fetched:

- Shared app shell: about 189 KB on every route, the methodology page included. It was there before this change.
- Welcome's own client code (sticky bar, sign-in form, dialog, signed-in swap): about 15 KB, part of the shell chunks.
- Motion chunk (gsap, ScrollTrigger, Lenis, the effects): 49.5 KB, fetched only on the Welcome route after the page is idle. It is never fetched with `prefers-reduced-motion: reduce`.

## Lighthouse (mobile)

| Route | Performance | Accessibility | Best practices | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- |
| `/en` | 92 | 100 | 100 | 3.2 s | 0 | 70 to 110 ms |
| `/sk` | 87 to 88 | 100 | 100 | 3.8 s | 0 | 80 ms |
| `/en/pricing` | 93 | 100 | 100 | 3.2 s | 0 | 50 ms |
| `/en/sign-in` | 94 | 100 | 100 | 3.0 s | 0 | 50 ms |

LCP is over the 2.0 s budget. The LCP element is the hero lede, and Lighthouse attributes 450 to 940 ms to the two shared render-blocking stylesheets (globals and kit). That applies to every route.

## Screens

Full pages unless noted. 1440 px shots are saved at half size, 768 px at 0.6.

- Welcome: `welcome-{375,768,1440}-{light,dark}.png`, `welcome-sk-1440-light.png`
- Welcome with reduced motion: `reduced-welcome-{375,1440}-{light,dark}.png`
- Scroll story frame strips: `scroll-strip-1440.png`, `scroll-strip-390.png` (eight frames each, from the hero to the assembled score)
- Pricing: `pricing-{375,768,1440}-{light,dark}.png`
- Sign-up, recovery codes and reset: `signin-signup-*`, `signin-codes-*`, `reset-*` at 375, 768 and 1440 in both themes
- Every auth state at 375 px, light: `state-signin-{mode,sending,weak-password,invalid-email,wrong-password,exists,rate-limited,network,unavailable,denied,codes-failed}-375-light.png`, `state-reset-{bad-code,done,rate-limited}-375-light.png`

Auth responses in the state shots are mocked in the browser. No auth handler ran.
