import { expect, it } from "vitest";
import { SCANNER_PAGE_SIZE, scannerPage } from "./scanner-table";

it("shows deterministic pages while keeping every name reachable", () => {
  const rows = Array.from({ length: 511 }, (_, index) => `T${index.toString().padStart(3, "0")}`);
  expect(scannerPage(rows, 1)).toHaveLength(SCANNER_PAGE_SIZE);
  expect(scannerPage(rows, 2).at(-1)).toBe("T099");
  expect(scannerPage(rows, 11)).toEqual(rows);
  expect(rows).toHaveLength(511);
});
