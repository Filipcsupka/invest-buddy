"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
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
  const wheel = useRef<SVGSVGElement>(null);
  const orbitId = useId().replace(/:/g, "");
  const angle = useRef(0);
  const drag = useRef<{ pointer: number; x: number; time: number; velocity: number } | null>(null);
  const rotate = (degrees: number) => {
    angle.current = degrees;
    wheel.current?.style.setProperty("--orbit-angle", `${degrees}deg`);
  };
  const onOrbitDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = "";
    drag.current = { pointer: event.pointerId, x: event.clientX, time: event.timeStamp, velocity: 0 };
  };
  const onOrbitMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const elapsed = Math.max(1, event.timeStamp - current.time);
    const delta = event.clientX - current.x;
    const degrees = delta / Math.max(1, event.currentTarget.clientWidth) * 360;
    rotate(angle.current + degrees);
    drag.current = { pointer: current.pointer, x: event.clientX, time: event.timeStamp, velocity: degrees / elapsed };
  };
  const onOrbitEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return;
    const velocity = drag.current.velocity;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.type === "pointerup" && !paused) rotate(angle.current + Math.max(-0.6, Math.min(0.6, velocity)) * 240);
  };
  const onOrbitKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    rotate(angle.current + (event.key === "ArrowRight" ? 18 : -18));
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.orbitReady = "";
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    observer.observe(el);
    return () => { observer.disconnect(); delete el.dataset.orbitReady; };
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
      <div className="kit-strip-orbit" role="group" aria-label={`${label}: ${changes.length}`} aria-keyshortcuts="ArrowLeft ArrowRight" onPointerDown={onOrbitDown} onPointerMove={onOrbitMove} onPointerUp={onOrbitEnd} onPointerCancel={onOrbitEnd} onKeyDown={onOrbitKey}>
        <svg ref={wheel} className="kit-strip-orbit-wheel" viewBox="0 0 300 300" aria-hidden="true">
          <defs>{[128, 98, 68].map((radius, index) => <path key={radius} id={`${orbitId}-ring-${index}`} d={`M 150 ${150 - radius} A ${radius} ${radius} 0 1 1 150 ${150 + radius} A ${radius} ${radius} 0 1 1 150 ${150 - radius}`} />)}</defs>
          {Array.from({ length: Math.min(3, Math.max(2, changes.length)) }, (_, index) => {
            const change = changes[index % changes.length];
            const radius = [128, 98, 68][index];
            const phrase = `${change.ticker} · ${change.fromLabel} → ${change.toLabel} ·`;
            return <g className="kit-strip-orbit-ring" data-ring={index} key={`${change.ticker}-${index}`}>
              <circle cx="150" cy="150" r={radius} />
              <text><textPath href={`#${orbitId}-ring-${index}`} startOffset="1%">{Array(index === 2 ? 2 : 3).fill(phrase).join(" ")}</textPath></text>
            </g>;
          })}
        </svg>
        <span className="kit-strip-orbit-core" aria-hidden="true"><span>{changes.length}</span></span>
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
