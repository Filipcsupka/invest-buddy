# Welcome motion spec

1. One story: the page shows how a score is built. All motion serves that; sign-in, pricing and account pages stay plain.
2. Hero: the headline rises in by line behind a mask, the sample board tilts slightly toward the pointer, and a grid spotlight on the navy panel follows the pointer. Nothing loops.
3. Pinned sequence (desktop, 900px and up): the "How a score is built" section pins for about two screens. Scroll scrubs one timeline: the ten rules check in one by one, each group bar fills, the percent counts up, and the state chip changes band as the score crosses 48, 60 and 72%.
4. Phone: the same timeline plays by scroll without a pin, one rule per short step, so the page never traps the thumb.
5. Rule set band: a slow marquee of the ten rule names with their points. Hover or focus pauses it; reduced motion and no JavaScript show one static row that scrolls sideways, the same height, so arming the loop moves nothing.
6. Area cards and tier cards tilt a few degrees toward the pointer on fine pointers only. The primary call to action is magnetic within 12px.
7. Lenis smooths wheel scroll on the Welcome route only. Anchor links scroll through Lenis and then move focus to the target; the sign-in dialog stops Lenis while open.
8. GSAP, ScrollTrigger and Lenis load by dynamic import after the page is interactive. The server HTML is the final state, so no JavaScript and `prefers-reduced-motion: reduce` both show the full static page with no hijacked scroll.
9. Only transform, opacity and clip-path animate. Effects pause offscreen and when the tab is hidden. No WebGL.
10. No urgency, no fake counters: every number that counts up is a SAMPLE figure computed by the real engine on fictional companies.
