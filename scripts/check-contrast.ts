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
const grounds = ["ground", "sheet", "sheet-hover"];

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
];

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
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`contrast ok: ${pairs.length} pairs, light and dark`);
}
