"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

export interface TextGlobeProps {
  /** One phrase per latitude ring, repeated when there are fewer phrases than rings. */
  lines: string[];
  /** Diameter in px at full size; the CSS scales it down on narrow screens. */
  size?: number;
  paused?: boolean;
}

const LATITUDES = [-66, -48, -32, -16, 0, 16, 32, 48, 66];
const SEGMENTS = 20;

/**
 * Decorative text globe: rings of text wrapped on a turning sphere, drag to spin. The same information is in the list
 * next to it, so the globe is hidden from assistive technology. Reduced motion shows it still; dragging still works.
 */
export function TextGlobe({ lines, size: maxSize = 380, paused = false }: TextGlobeProps) {
  const sphere = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(maxSize);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setSize(Math.max(200, Math.min(maxSize, Math.round((el.parentElement?.clientWidth ?? maxSize) - 64))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [maxSize]);
  const state = useRef({ angle: 0, velocity: 0.12, dragging: false, lastX: 0 });
  const R = size / 2;
  const phrases = lines.length ? lines : [""];
  // Width of one phrase at 100px, measured after mount so every ring holds a whole number of phrases and wraps without a seam.
  const [unit, setUnit] = useState<number[] | null>(null);
  const key = phrases.join("|");
  useEffect(() => {
    const el = sphere.current;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!el || !ctx) return;
    const measure = () => {
      ctx.font = `800 100px ${getComputedStyle(el).fontFamily}`;
      setUnit(LATITUDES.map((_, row) => ctx.measureText(`${(phrases[row % phrases.length] ?? "").toUpperCase()} · `).width / 100));
    };
    measure();
    document.fonts?.ready.then(measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    const el = sphere.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();
    const apply = () => el.style.setProperty("--spin", `${state.current.angle}deg`);
    const tick = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      const s = state.current;
      if (!s.dragging) {
        const target = paused || reduce ? 0 : 0.12;
        s.velocity += (target - s.velocity) * 0.04;
        s.angle += s.velocity * dt * 0.06;
        apply();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused]);
  const down = (event: React.PointerEvent) => {
    state.current.dragging = true;
    state.current.lastX = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent) => {
    const s = state.current;
    if (!s.dragging) return;
    const dx = event.clientX - s.lastX;
    s.lastX = event.clientX;
    s.angle += dx * 0.5;
    s.velocity = dx * 0.5 * 1.2;
    sphere.current?.style.setProperty("--spin", `${s.angle}deg`);
  };
  const up = (event: React.PointerEvent) => {
    state.current.dragging = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div ref={box} className="kit-globe" aria-hidden="true" style={{ "--globe": `${size}px` } as CSSProperties}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="kit-globe-core" />
      <div ref={sphere} className="kit-globe-sphere">
        {LATITUDES.map((lat, row) => {
          const rad = (lat * Math.PI) / 180;
          const radius = R * Math.cos(rad);
          const y = R * Math.sin(rad);
          const circumference = 2 * Math.PI * radius;
          const phrase = `${(phrases[row % phrases.length] ?? "").toUpperCase()} · `;
          const perEm = unit?.[row] ?? phrase.length * 0.66;
          const repeats = Math.max(1, Math.ceil(circumference / (perEm * size * 0.085)));
          const font = circumference / (repeats * perEm);
          const text = phrase.repeat(repeats);
          const width = circumference / SEGMENTS;
          return (
            <div key={lat} className="kit-globe-ring" data-alt={row % 2 ? "" : undefined} style={{ "--y": `${y}px`, "--row": row } as CSSProperties}>
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <span key={i} className="kit-globe-seg"
                  style={{ width: `${width + 3}px`, height: `${font * 1.35}px`, fontSize: `${font}px`, transform: `rotateY(${(i * 360) / SEGMENTS}deg) translateZ(${radius}px) translate(-50%, -50%)` }}>
                  <span style={{ transform: `translateX(${-i * width}px)` }}>{text}</span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
