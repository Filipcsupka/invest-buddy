import { readFileSync } from "node:fs";
import { join } from "node:path";

/** WCAG contrast check for the colour tokens in src/app/globals.css, light and dark. No browser needed. */
type Pair = { light: string; dark: string };
const themes = ["light", "dark"] as const;

export function tokens(css: string): Map<string, Pair> {
  const out = new Map<string, Pair>();
  for (const m of css.matchAll(/--([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)) out.set(m[1], { light: m[2], dark: m[3] });
  return out;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const bands = ["broken", "ignore", "wait", "watch", "setup"];
const grounds = ["ground", "sheet", "sheet-hover", "sheet-raised"];

/** [foreground token, background token, minimum ratio, what it is]. 4.5 for text, 3 for UI borders. */
export const pairs: [string, string, number, string][] = [
  ...["ink", "ink-2", "ink-3", "signal", "gain", "loss", "st-none"].flatMap((fg) => grounds.map((bg): [string, string, number, string] => [fg, bg, 4.5, "text"])),
  ...bands.flatMap((band) => ["ground", "sheet", `st-${band}-wash`].map((bg): [string, string, number, string] => [`st-${band}`, bg, 4.5, "status text"])),
  ...bands.map((band): [string, string, number, string] => [`st-${band}-on`, `st-${band}`, 4.5, "status fill label"]),
  ["st-none", "st-none-wash", 4.5, "status text"],
  ["gain", "gain-wash", 4.5, "text"],
  ["loss", "loss-wash", 4.5, "text"],
  ["signal", "signal-wash", 4.5, "text"],
  ["on-signal", "signal", 4.5, "text"],
  ["ground", "ink", 4.5, "button and skip link"],
  ["rule-strong", "ground", 3, "UI border"],
  ["rule-strong", "sheet", 3, "UI border"],
  // Foundation kit: state chips (band text on wash is above), score values, signal ramp, tier mark, banner and lock card.
  ...bands.map((band): [string, string, number, string] => [`st-${band}`, "sheet-raised", 4.5, "score value on raised sheet"]),
  ...bands.map((band): [string, string, number, string] => [`st-${band}`, "ground", 3, "score fill and dial arc"]),
  ["st-none", "ground", 4.5, "insufficient chip text"],
  ["st-none", "sheet", 4.5, "insufficient chip text"],
  ["signal-strong", "ground", 4.5, "hover text"],
  ["signal-strong", "sheet", 4.5, "hover text"],
  ["signal-strong", "signal-wash", 4.5, "hover text on wash"],
  ["signal", "signal-tint", 4.5, "selected row text"],
  ["ink", "signal-tint", 4.5, "selected row text"],
  ["on-signal", "signal-strong", 4.5, "pressed button"],
  ["tier", "ground", 4.5, "tier frame tag"],
  ["tier", "sheet", 4.5, "tier frame tag on sheet"],
  ["tier", "tier-wash", 4.5, "tier text on wash"],
  ["tier-on", "tier", 4.5, "Paid badge"],
  ["ink", "tier-wash", 4.5, "admin banner"],
  ["ink-2", "tier-wash", 4.5, "admin banner note"],
  ["tier-line", "ground", 3, "paid frame"],
  ["tier-line", "sheet", 3, "paid frame on sheet"],
  ["tier-line", "sheet-raised", 3, "lock card border"],
  ["rule-strong", "sheet-raised", 3, "UI border"],
  ["on-signal", "signal", 3, "rule pass mark"],
  // v2 chrome: navy header and footer, orange call to action.
  ["navy-ink", "navy", 4.5, "header and footer text"],
  ["navy-ink-2", "navy", 4.5, "header link and footer note"],
  ["navy-ink-2", "navy-2", 4.5, "header link on hover"],
  ["navy-ink", "navy-2", 4.5, "header link current"],
  ["accent-on", "accent", 4.5, "call to action label"],
  ["accent-on", "accent-hover", 4.5, "call to action hover"],
  ["accent-ink", "ground", 4.5, "accent text"],
  ["accent-ink", "sheet", 4.5, "accent text on sheet"],
  ["navy-line", "navy", 1.2, "header divider (decorative)"],
  ["accent", "navy", 3, "call to action edge on navy"],
];

/** Every checked pair with its ratio in both themes, for reports and the /design notes. */
export function contrastTable(css: string): { fg: string; bg: string; min: number; what: string; light: number; dark: number }[] {
  const t = tokens(css);
  return pairs.map(([fg, bg, min, what]) => {
    const ratio = (theme: (typeof themes)[number]) => {
      const a = t.get(fg)?.[theme];
      const b = t.get(bg)?.[theme];
      return a && b ? Math.round(contrast(a, b) * 100) / 100 : 0;
    };
    return { fg, bg, min, what, light: ratio("light"), dark: ratio("dark") };
  });
}

export function checkContrast(css: string): string[] {
  const t = tokens(css);
  const failures: string[] = [];
  for (const [fg, bg, min, what] of pairs) {
    for (const theme of themes) {
      const a = t.get(fg)?.[theme];
      const b = t.get(bg)?.[theme];
      if (!a || !b) {
        failures.push(`missing token ${a ? bg : fg} (${theme})`);
        continue;
      }
      const ratio = contrast(a, b);
      if (ratio < min) failures.push(`${theme}: ${fg} ${a} on ${bg} ${b} = ${ratio.toFixed(2)}, needs ${min} (${what})`);
    }
  }
  return failures;
}

if (process.argv[1]?.endsWith("check-contrast.ts")) {
  const failures = checkContrast(readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8"));
  if (process.argv.includes("--table")) for (const row of contrastTable(readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8"))) console.log(`${row.fg} on ${row.bg}\t${row.light.toFixed(2)}\t${row.dark.toFixed(2)}\t(min ${row.min}, ${row.what})`);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`contrast ok: ${pairs.length} pairs, light and dark`);
}
