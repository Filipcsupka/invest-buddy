"use client";

import { useEffect, useState } from "react";

export interface Tab {
  /** Id of the element the tab scrolls to. */
  id: string;
  label: string;
}

/**
 * Sticky in-page tab bar. The links are plain anchors and work without script; with script the tab of the section
 * nearest the top of the viewport is marked with aria-current.
 */
export function TabBar({ label, tabs }: { label: string; tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let best = tabs[0]?.id ?? "";
      let bestTop = -Infinity;
      for (const tab of tabs) {
        const top = document.getElementById(tab.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line && top > bestTop) {
          best = tab.id;
          bestTop = top;
        }
      }
      setActive(best);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [tabs]);

  return (
    <nav className="co-tabs" aria-label={label}>
      <ul className="co-tabs-list">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <a className="co-tab" href={`#${tab.id}`} aria-current={active === tab.id ? "location" : undefined}>
              {tab.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
