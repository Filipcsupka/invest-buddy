"use client";

import { useState, type PointerEvent } from "react";

export type HoverPoint = { x: number; y: number; date: string; close: string; ma50: string | null; ma200: string | null };

/** Pointer crosshair over the chart plot: snaps to the nearest session and shows its close and moving averages. */
export function ChartHover({ points, labels }: { points: HoverPoint[]; labels: { close: string; ma50: string; ma200: string } }) {
  const [index, setIndex] = useState<number | null>(null);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setIndex(Math.round(ratio * (points.length - 1)));
  };
  const point = index === null ? null : points[index];
  return (
    <div className="chart-hover" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setIndex(null)} aria-hidden="true">
      {point ? (
        <>
          <span className="hover-line" style={{ left: `${point.x}%` }} />
          <span className="hover-dot" style={{ left: `${point.x}%`, top: `${point.y}%` }} />
          <div className={point.x > 60 ? "hover-tip is-left" : "hover-tip"} style={{ left: `${point.x}%` }}>
            <span className="hover-date">{point.date}</span>
            <span className="hover-row"><b>{labels.close}</b><span className="num">{point.close}</span></span>
            {point.ma50 ? <span className="hover-row"><b>{labels.ma50}</b><span className="num">{point.ma50}</span></span> : null}
            {point.ma200 ? <span className="hover-row"><b>{labels.ma200}</b><span className="num">{point.ma200}</span></span> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
