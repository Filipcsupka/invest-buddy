import { expect, it } from "vitest";
import { marketsViewable } from "./gate";
import type { Viewer } from "@/viewer/viewer";

const owner: Viewer = { tier: "admin", preview: false, owner: true };
const plus: Viewer = { tier: "paid", preview: false, userId: "plus", plan: "plus" };
const trial: Viewer = { tier: "paid", preview: false, userId: "trial", plan: "trial" };
const free: Viewer = { tier: "free", preview: false, userId: "free", plan: "free" };
const anon: Viewer = { tier: "paid", preview: false };
const env = { MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "on" };

it.each([
  ["owner", owner, true], ["plus", plus, true], ["trial", trial, true],
  ["free", free, false], ["anonymous", anon, false],
  ["owner preview", { ...owner, preview: true }, false],
] as const)("gates market routes for %s", (_name, viewer, expected) => {
  expect(marketsViewable(viewer, env)).toBe(expected);
  expect(marketsViewable(viewer, { ...env, MARKETS_VIEWS: "off" })).toBe(false);
});
