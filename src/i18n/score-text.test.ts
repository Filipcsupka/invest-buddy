import { afterEach, expect, it } from "vitest";
import { sectorLabel } from "./score-text";

const original = process.env.DATA_MODE;
afterEach(() => { if (original === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = original; });

it("hides the fixture sector label on live rows in both languages", () => {
  process.env.DATA_MODE = "db";
  expect(sectorLabel("en", "Sample extension")).toBe("Screening universe");
  expect(sectorLabel("sk", "Sample extension")).toBe("Zoznam sledovaných akcií");
  process.env.DATA_MODE = "fixture";
  expect(sectorLabel("sk", "Sample extension")).toBe("Ukážkové rozšírenie");
});
