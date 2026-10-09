import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const universe = vi.fn();
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe() }));
import { proxy } from "./proxy";

const original = { mode: process.env.DATA_MODE, ideas: process.env.IDEAS_PAGE, owner: process.env.OWNER_VIEW };
afterEach(() => {
  universe.mockReset();
  for (const [key, value] of [["DATA_MODE", original.mode], ["IDEAS_PAGE", original.ideas], ["OWNER_VIEW", original.owner]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it.each(["en", "sk"])("returns a real 404 for unavailable %s routes", async (locale) => {
  delete process.env.DATA_MODE; delete process.env.IDEAS_PAGE; delete process.env.OWNER_VIEW;
  universe.mockResolvedValue([{ ticker: "NVDA" }]);
  for (const path of ["ideas", "owner-allocation", "scanner", "company/ZZZZ"]) {
    const response = await proxy(new NextRequest(`https://example.com/${locale}/${path}`));
    expect(response.status, path).toBe(404);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await response.text()).toContain("<h1>");
  }
  const known = await proxy(new NextRequest(`https://example.com/${locale}/company/NVDA`));
  expect(known.status).toBe(200);
  expect(known.headers.get("x-request-id")).toBeTruthy();
});
