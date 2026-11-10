import { expect, test } from "@playwright/test";

/*
 * Regression: inside each row of the Welcome sample scoreboard, the SAMPLE mark, the ticker, the company name, the score label and the
 * state chip must not overlap (owner report 2026-11-10: "Sample" and "Score" were printed over the company name). Geometry check on the
 * text boxes, so it holds in both themes and does not depend on pixel snapshots.
 */
const widths = [375, 768, 1024, 1200, 1440];

for (const locale of ["en", "sk"]) {
  for (const width of widths) {
    test(`scoreboard rows have no overlapping text at ${width}px (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}`);
      await page.evaluate(() => document.fonts.ready);
      const clashes = await page.evaluate(() => {
        const out: string[] = [];
        for (const row of document.querySelectorAll('[data-w="board"] li')) {
          const boxes = [...row.querySelectorAll("*")]
            .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()))
            .map((el) => {
              const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
              const range = document.createRange();
              range.setStartBefore(own[0]!);
              range.setEndAfter(own.at(-1)!);
              return { text: own.map((n) => n.textContent!.trim()).join(" "), box: range.getBoundingClientRect() };
            });
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i]!.box;
              const b = boxes[j]!.box;
              const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (x > 1 && y > 1) out.push(`${boxes[i]!.text} / ${boxes[j]!.text}`);
            }
          }
          // Nothing in the row may spill past the board's edge either.
          const board = row.closest('[data-w="board"]')!.getBoundingClientRect();
          for (const { text, box } of boxes) if (box.right > board.right + 1 || box.left < board.left - 1) out.push(`${text} outside the board`);
        }
        return out;
      });
      expect(clashes).toEqual([]);
    });
  }
}
