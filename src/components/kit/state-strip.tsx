"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IconArrowRight } from "../icons";
import { IconPause, IconPlay } from "./kit-icons";
import { StateChip } from "./state-chip";
import type { KitState } from "./types";

export interface StateChange {
  ticker: string;
  from: KitState;
  to: KitState;
  fromLabel: string;
  toLabel: string;
  /** Company page, for example `/en/company/NVDA`. */
  href?: string;
  /** Full sentence for screen readers, for example "NVDA: Watching to Conditions met". */
  sentence: string;
}

export interface StateStripProps {
  /** Visible label and region name, for example "State changes, 16 Oct 2026". */
  label: string;
  changes: StateChange[];
  /** Text when `changes` is empty. */
  empty: string;
  pauseLabel: string;
  playLabel: string;
  /** Seconds per item for one pass. Default 7, slow enough to read every chip. */
  secondsPerItem?: number;
}

/**
 * A slow strip of the latest state changes. It moves only while it is on screen and the visitor is not
 * hovering, focusing or pausing it; the pause button meets WCAG 2.2.2. With reduced motion it is a still,
 * scrollable list without the duplicated copy. The first copy is the real list; the second is aria-hidden
 * and out of the tab order, there only to close the loop.
 */
export function StateStrip({ label, changes, empty, pauseLabel, playLabel, secondsPerItem = 7 }: StateStripProps) {
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  if (!changes.length) {
    return (
      <section className="kit-strip" aria-label={label} data-empty="">
        <p className="kit-strip-label">{label}</p>
        <p className="kit-strip-empty">{empty}</p>
      </section>
    );
  }
  const items = (copy: boolean) =>
    changes.map((change) => {
      const body = (
        <>
          <span className="kit-strip-visual" aria-hidden="true">
            <span className="kit-strip-ticker">{change.ticker}</span>
            <StateChip state={change.from} label={change.fromLabel} size="sm" />
            <IconArrowRight className="icon kit-strip-arrow" />
            <StateChip state={change.to} label={change.toLabel} size="sm" />
          </span>
          <span className="visually-hidden">{change.sentence}</span>
        </>
      );
      return (
        <li key={`${copy ? "b" : "a"}-${change.ticker}`} className="kit-strip-item">
          {change.href ? (
            <Link href={change.href} className="kit-strip-link" tabIndex={copy ? -1 : undefined}>
              {body}
            </Link>
          ) : (
            <span className="kit-strip-link">{body}</span>
          )}
        </li>
      );
    });
  return (
    <section ref={ref} className="kit-strip" aria-label={label} data-paused={paused || offscreen ? "" : undefined} style={{ "--strip-duration": `${Math.max(changes.length, 3) * secondsPerItem}s` } as CSSProperties}>
      <div className="kit-strip-head">
        <p className="kit-strip-label">{label}</p>
        <button type="button" className="kit-strip-toggle" onClick={() => setPaused((p) => !p)}>
          {paused ? <IconPlay /> : <IconPause />}
          <span>{paused ? playLabel : pauseLabel}</span>
        </button>
      </div>
      <div className="kit-strip-viewport">
        <div className="kit-strip-rail">
          <ul className="kit-strip-list">{items(false)}</ul>
          <ul className="kit-strip-list kit-strip-copy" aria-hidden="true">{items(true)}</ul>
        </div>
      </div>
    </section>
  );
}
