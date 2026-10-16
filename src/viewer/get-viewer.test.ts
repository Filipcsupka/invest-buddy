import { afterEach, expect, it, vi } from "vitest";

const headerValue = vi.fn<() => string | null>();
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => headerValue() }) }));
import { getViewer } from "./get-viewer";
import { baseViewer, canSee, limitFor, resolveViewer } from "./viewer";

const saved = { auth: process.env.AUTH, paywall: process.env.PAYWALL };
afterEach(() => {
  headerValue.mockReset();
  for (const [key, value] of [["AUTH", saved.auth], ["PAYWALL", saved.paywall]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

const matrix = [
  // AUTH, PAYWALL, tier
  [false, false, "admin"],
  [false, true, "admin"],
  [true, false, "paid"],
  [true, true, "free"],
] as const;

it.each(matrix)("resolves AUTH %s PAYWALL %s to %s", (auth, paywall, tier) => {
  expect(baseViewer({ AUTH: auth, PAYWALL: paywall })).toEqual({ tier, preview: false });
});

it("honours ?view=free only for an admin", () => {
  expect(resolveViewer({ AUTH: false, PAYWALL: false }, "free")).toEqual({ tier: "free", preview: true });
  expect(resolveViewer({ AUTH: false, PAYWALL: false }, "other")).toEqual({ tier: "admin", preview: false });
  expect(resolveViewer({ AUTH: true, PAYWALL: true }, "free")).toEqual({ tier: "free", preview: false });
  expect(resolveViewer({ AUTH: true, PAYWALL: false }, "free")).toEqual({ tier: "paid", preview: false });
});

it("reads the request header, and falls back to the flags outside a request", async () => {
  delete process.env.AUTH;
  headerValue.mockReturnValue(null);
  expect(await getViewer()).toEqual({ tier: "admin", preview: false });
  headerValue.mockReturnValue("free");
  expect(await getViewer()).toEqual({ tier: "free", preview: true });
  process.env.AUTH = "on";
  expect(await getViewer()).toEqual({ tier: "paid", preview: false });
});

it("canSee and limitFor follow the tier", () => {
  const admin = { tier: "admin", preview: false } as const;
  const paid = { tier: "paid", preview: false } as const;
  const free = { tier: "free", preview: false } as const;
  expect(canSee(free, "idea-card")).toBe(false);
  expect(canSee(free, "score-history")).toBe(true);
  expect(canSee(free, "portfolio-weights")).toBe(true);
  expect(canSee(paid, "idea-card")).toBe(true);
  expect(canSee(admin, "idea-card")).toBe(true);
  expect(limitFor(free, "scoreHistoryDays")).toBe(30);
  expect(limitFor(free, "scannerRows")).toBe(20);
  expect(limitFor(paid, "scoreHistoryDays")).toBeNull();
  expect(limitFor(admin, "alerts")).toBe(50);
});
