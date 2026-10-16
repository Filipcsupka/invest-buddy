import type { CSSProperties, ReactNode } from "react";
import { MotionRoot } from "./motion-root";

type RevealTag = "div" | "section" | "article" | "aside" | "figure" | "ul" | "ol";

export interface RevealProps {
  children: ReactNode;
  as?: RevealTag;
  className?: string;
  id?: string;
  /** "view" (default): rises in once, time based, when a quarter of it enters the viewport.
   *  "scroll": tied to scroll position with a CSS view timeline; browsers without it show the content still. */
  mode?: "view" | "scroll";
  /** Extra delay in ms, for a second block that should follow the first. Keep it under 300. */
  delay?: number;
  "aria-labelledby"?: string;
}

/**
 * Section reveal with an exponential ease-out (opacity, a short rise and a 4px blur that clears).
 * The server renders it visible; only content that is still below the fold after hydration is armed,
 * so nothing on screen blinks. Reduced motion: no movement. Use it for one authored moment, not every section.
 */
export function Reveal({ children, as = "div", className, id, mode = "view", delay, ...rest }: RevealProps) {
  const cls = className ? `kit-reveal ${className}` : "kit-reveal";
  const style = delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined;
  if (mode === "scroll") {
    const Tag = as;
    return <Tag className={cls} data-reveal="scroll" id={id} style={style} {...rest}>{children}</Tag>;
  }
  return <MotionRoot motion="view" as={as} className={cls} id={id} style={style} {...rest}>{children}</MotionRoot>;
}
