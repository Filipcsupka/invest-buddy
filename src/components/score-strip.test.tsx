import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SCORE_STRIP_LIMIT, ScoreStrip } from "./score-strip";
import type { ScreenRow } from "./view-model";

const row = (n: number, percent: number | null): ScreenRow => ({ ticker: `T${n}`, state: percent === null ? "insufficient" : "watch", stateLabel: "Watch", percent, percentLabel: percent === null ? null : `${percent}%` }) as ScreenRow;

it.each(["en", "sk"] as const)("shows the top scored names as company links and nothing else (%s)", (locale) => {
  const rows = [...Array.from({ length: 20 }, (_, i) => row(i, 90 - i)), row(99, null)];
  const html = renderToStaticMarkup(<ScoreStrip locale={locale} rows={rows} />);
  expect(html.match(/<li /g)).toHaveLength(SCORE_STRIP_LIMIT);
  expect(html).toContain(`href="/${locale}/company/T0"`);
  expect(html).not.toContain("T12");
  expect(html).not.toContain("T99");
  expect(html).toContain("21");
});

it("renders nothing when no name has a score", () => {
  expect(renderToStaticMarkup(<ScoreStrip locale="en" rows={[row(1, null)]} />)).toBe("");
});
