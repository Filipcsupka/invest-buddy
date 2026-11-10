import type { KitState } from "@/components/kit";
import s from "./story.module.css";

/*
 * Light twins of the kit's StateChip, ResultMark and IconLock for the Welcome page. Same kit classes and the same shapes, but the glyph
 * is a CSS mask on ::before (story.module.css) instead of an inline SVG and two wrapper spans per use. The page repeats these marks about
 * a hundred times and every element is paid twice (HTML and the RSC payload), so this keeps the page inside its size budget. Meaning
 * never rests on the glyph alone: a chip carries its label and a mark sits next to its word.
 */
export type Glyph = "pass" | "fail" | "none" | "part" | "lock" | "arrow" | KitState;

export const G = ({ g }: { g: Glyph }) => <span className={s.glyph} data-g={g} aria-hidden="true" />;

export function Mark({ result, glyph }: { result: "pass" | "fail" | "none"; glyph?: Glyph }) {
  return <span className={`kit-mark ${s.mk}`} data-result={result} data-g={glyph ?? result} aria-hidden="true" />;
}

export function Chip({ state, label, size = "sm", describedBy }: { state: KitState; label: string; size?: "sm" | "md"; describedBy?: string }) {
  return <span className={`kit-chip ${s.ch}`} data-state={state} data-size={size} aria-describedby={describedBy}>{label}</span>;
}
