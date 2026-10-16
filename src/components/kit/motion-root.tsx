import { createElement, type HTMLAttributes, type ReactNode } from "react";
import { Motion } from "./motion";
import type { KitMotion } from "./types";

type Tag = "div" | "section" | "span" | "table" | "ul" | "ol" | "article" | "aside" | "figure";

/**
 * Root element for a kit component. "view" hands over to the Motion island; "load" marks the element as running
 * from the server, so the CSS plays on first paint with no JavaScript; "none" renders a plain element.
 */
export function MotionRoot({ motion, as = "div", children, ...rest }: { motion: KitMotion; as?: Tag; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  if (motion === "view") return <Motion as={as} {...rest}>{children}</Motion>;
  return createElement(as, { "data-motion": motion === "load" ? "run" : undefined, ...rest }, children);
}
