"use client";
import { createElement, useCallback, type HTMLAttributes, type ReactNode } from "react";

type Tag = "div" | "section" | "span" | "table" | "ul" | "ol" | "article" | "aside" | "figure";

/**
 * The one client island behind every `motion="view"` in the kit.
 *
 * Server HTML renders the final state (`data-motion="view"`), so content is visible with no JavaScript.
 * After hydration the element is armed only if it is still below the fold, so nothing on screen jumps back
 * to its start frame. When a quarter of it is in view it gets `data-motion="run"` and the CSS plays once.
 * Reduced motion: never armed.
 */
export function Motion({ as = "div", children, ...rest }: { as?: Tag; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  // A callback ref with a cleanup (React 19): set up once when the element mounts, disconnect when it goes.
  const attach = useCallback((el: HTMLElement | null) => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;
    el.dataset.motion = "armed";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        el.dataset.motion = "run";
        observer.disconnect();
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return createElement(as, { ref: attach, "data-motion": "view", ...rest }, children);
}
