"use client";
import { useEffect } from "react";

/**
 * The Welcome page's motion layer. Renders nothing. After the page is interactive and idle it loads GSAP, ScrollTrigger and Lenis by
 * dynamic import (a separate chunk that no other route requests) and arms the effects. Reduced motion, no IntersectionObserver or a
 * failed import leave the server HTML as it is: the final, readable state.
 */
export function WelcomeMotion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop: (() => void) | null = null;
    let cancelled = false;
    let idle = 0;

    const start = () => {
      if (cancelled || reduce.matches || stop) return;
      const root = document.querySelector<HTMLElement>("[data-welcome]");
      if (!root) return;
      import("./motion-engine")
        .then((engine) => {
          if (!cancelled && !reduce.matches) stop = engine.startWelcomeMotion(root);
        })
        .catch(() => {
          /* Static page stays. */
        });
    };
    const schedule = () => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      idle = ric ? ric(start, { timeout: 1500 }) : window.setTimeout(start, 400);
    };
    const onChange = () => {
      if (reduce.matches) {
        stop?.();
        stop = null;
      } else schedule();
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    reduce.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      reduce.removeEventListener("change", onChange);
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (cic) cic(idle);
      else window.clearTimeout(idle);
      stop?.();
    };
  }, []);
  return null;
}
