# Welcome page: third-party code and licences

Checked 2026-11-09 from the installed packages.

| Package | Version (pinned) | Licence | Where it loads |
| --- | --- | --- | --- |
| gsap (core and ScrollTrigger) | 3.15.0 | GreenSock standard "no charge" licence, https://gsap.com/standard-license. The package README says GSAP is free for commercial use, all plugins included. No paid Club licence is needed. | Welcome route only, dynamic import from `src/components/welcome/welcome-motion.tsx` |
| lenis | 1.3.27 | MIT, copyright 2024 darkroom.engineering (`node_modules/lenis/LICENSE`) | Same lazy chunk as gsap |

The licence summary for gsap comes from the package README. The standard-licence page itself was not read in this change; check it before any change in how the site is sold or embedded.

No React Bits source was copied. The spotlight, tilt, magnetic button, marquee and count-up effects are written for this repo in `src/components/welcome/motion-engine.ts` and `welcome.module.css`.

## Data shown on the page

| Data | Source | Terms | Where |
| --- | --- | --- | --- |
| Annual revenue and the prior year, form, period, filing date | SEC EDGAR XBRL companyfacts API (`data.sec.gov`) | US government data, public domain. The SEC asks for a declared User-Agent with a contact address and at most 10 requests per second (registry entry `sec` in `src/data/sources-registry.ts`) | `src/components/welcome/sec-facts.json`, built by `scripts/welcome-sec-facts.ts`, accessed 2026-11-10 |
| Scores, states, score history, scanner rows | Invented sample universe scored by the real engine | Own content | `src/components/welcome/sample-data.ts` |
| Track record chart | Deterministic invented series | Own content | `src/components/welcome/story-visuals.tsx` |

No vendor data and no market prices appear on the Welcome page.
