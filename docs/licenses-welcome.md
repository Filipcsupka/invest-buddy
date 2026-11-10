# Welcome page: third-party code and licences

Checked 2026-11-09 from the installed packages.

| Package | Version (pinned) | Licence | Where it loads |
| --- | --- | --- | --- |
| gsap (core and ScrollTrigger) | 3.15.0 | GreenSock standard "no charge" licence, https://gsap.com/standard-license. The package README says GSAP is free for commercial use, all plugins included. No paid Club licence is needed. | Welcome route only, dynamic import from `src/components/welcome/welcome-motion.tsx` |
| lenis | 1.3.27 | MIT, copyright 2024 darkroom.engineering (`node_modules/lenis/LICENSE`) | Same lazy chunk as gsap |

The licence summary for gsap comes from the package README. The standard-licence page itself was not read in this change; check it before any change in how the site is sold or embedded.

No React Bits source was copied. The spotlight, tilt, magnetic button, marquee and count-up effects are written for this repo in `src/components/welcome/motion-engine.ts` and `welcome.module.css`.
