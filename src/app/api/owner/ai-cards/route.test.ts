import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
const authorized = vi.fn();
vi.mock("@/config/flags", () => ({ flags: () => ({ OWNER_VIEW: true }) }));
vi.mock("@/app/[locale]/owner/research/auth", () => ({ ownerResearchAuthorized: () => authorized() }));
import { POST } from "./route";

it("rejects unauthorized imports and previews without writing", async () => {
  const makeRequest = (suffix = "") => new NextRequest(`http://localhost/api/owner/ai-cards${suffix}`, { method: "POST", body: "ABC — WATCH €0\n1 January 2026\nSummary.\n" });
  authorized.mockReturnValue(false);
  expect((await POST(makeRequest())).status).toBe(401);
  authorized.mockReturnValue(true);
  const response = await POST(makeRequest("?preview"));
  expect(response.status).toBe(200);
  expect((await response.json()).preview).toMatchObject([{ symbol: "ABC", callText: "WATCH", amountText: "€0" }]);
});
