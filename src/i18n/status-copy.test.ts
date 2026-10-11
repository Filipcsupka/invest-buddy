import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Checks the ST0 design spec so ST2, ST3 and AL1 can copy its strings and tokens as they are.
const spec = readFileSync(new URL("../../docs/design/status-slider.md", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const copyBlock = spec.split("<!-- copy:start -->")[1]?.split("<!-- copy:end -->")[0] ?? "";
const rows = copyBlock
  .split("\n")
  .filter((line) => line.startsWith("| ") && !line.startsWith("| Key") && !line.startsWith("| ---"))
  .map((line) => line.slice(2, -2).split(" | "))
  .map(([key, en, sk]) => ({ key, en, sk }));
const copy = new Map(rows.map((row) => [row.key, row]));

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const banned = /[–—]|\b(robust|seamless|leverage|unlock|empower|crucial|delve)\b/i;

describe("status spec copy", () => {
  it("has rows with three cells and unique keys", () => {
    expect(rows.length).toBeGreaterThan(60);
    for (const row of rows) expect([row.key, row.en, row.sk].every((cell) => cell?.trim()), row.key).toBe(true);
    expect(copy.size).toBe(rows.length);
  });

  it("uses the same placeholders in EN and SK", () => {
    for (const row of rows) expect(placeholders(row.sk), row.key).toEqual(placeholders(row.en));
  });

  it("keeps dashes and filler words out", () => {
    for (const row of rows) expect(banned.test(`${row.en} ${row.sk}`), row.key).toBe(false);
  });

  it("matches the lane labels with ADVICE_OUTPUT off", () => {
    const labels = { broken: ["Criteria broken", "Kritériá porušené"], ignore: ["Not now", "Mimo výberu"], wait: ["Waiting", "Čakanie"], watch: ["Watching", "Sledovanie"], setup: ["Conditions met", "Podmienky splnené"], insufficient: ["Not enough data", "Nedostatok údajov"] };
    for (const [state, [en, sk]] of Object.entries(labels)) expect(copy.get(`status.labels.${state}`), state).toMatchObject({ en, sk });
    expect(copy.get("status.labelsAdvice.setup")).toMatchObject({ en: "Buy zone", sk: "Zóna nákupu" });
  });

  it("keeps advice wording only in the flag key", () => {
    for (const row of rows) if (!row.key.startsWith("status.labelsAdvice.")) expect(/buy zone|zóna nákupu/i.test(`${row.en} ${row.sk}`), row.key).toBe(false);
  });
});

type Pair = { light: string; dark: string };
function tokens(source: string): Map<string, Pair> {
  const out = new Map<string, Pair>();
  for (const m of source.matchAll(/--([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)) out.set(m[1], { light: m[2], dark: m[3] });
  return out;
}
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("status spec colour tokens", () => {
  const site = tokens(css);
  const status = tokens(spec.split("## 3. Color tokens")[1]?.split("```")[1] ?? "");
  const bands = ["broken", "ignore", "wait", "watch", "setup", "none"];
  const themes = ["light", "dark"] as const;

  it("defines band, on and wash for every band", () => {
    for (const band of bands) for (const suffix of ["", "-on", "-wash"]) expect(status.has(`st-${band}${suffix}`), `st-${band}${suffix}`).toBe(true);
  });

  it("passes WCAG AA text contrast in both themes", () => {
    for (const theme of themes)
      for (const band of bands) {
        const color = status.get(`st-${band}`)![theme];
        for (const ground of [site.get("sheet")![theme], site.get("ground")![theme], status.get(`st-${band}-wash`)![theme]]) expect(contrast(color, ground), `${band} ${theme} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(status.get(`st-${band}-on`)![theme], color), `${band}-on ${theme}`).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("keeps step outlines at 3:1 or more", () => {
    for (const theme of themes) for (const ground of ["sheet", "ground"]) expect(contrast(site.get("rule-strong")![theme], site.get(ground)![theme]), `${theme} ${ground}`).toBeGreaterThanOrEqual(3);
  });

  it("prints the contrast table the tokens produce", () => {
    const table = [...spec.matchAll(/^\| (broken|ignore|wait|watch|setup|none) \| (light|dark) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \|$/gm)];
    expect(table).toHaveLength(12);
    for (const [, band, theme, onSheet, onGround, onWash, onFill] of table) {
      const t = theme as "light" | "dark";
      const color = status.get(`st-${band}`)![t];
      expect(contrast(color, site.get("sheet")![t]).toFixed(2), `${band} ${t} sheet`).toBe(onSheet);
      expect(contrast(color, site.get("ground")![t]).toFixed(2), `${band} ${t} ground`).toBe(onGround);
      expect(contrast(color, status.get(`st-${band}-wash`)![t]).toFixed(2), `${band} ${t} wash`).toBe(onWash);
      expect(contrast(status.get(`st-${band}-on`)![t], color).toFixed(2), `${band} ${t} on`).toBe(onFill);
    }
  });
});
