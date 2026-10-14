import { describe, expect, it, vi } from "vitest";
import { buildPayload, submitWaitlist, validEmail } from "./waitlist-client";

const payload = buildPayload({ email: " a@b.co ", consent: true, website: "" }, "sk", "b");
const reply = (status: number) => vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;

describe("waitlist client", () => {
  it("builds the W14 request body", () => {
    expect(payload).toEqual({ email: "a@b.co", locale: "sk", consent: true, website: "", priceVariant: "b" });
  });
  it("checks the address shape", () => {
    expect(validEmail("a@b.co")).toBe(true);
    for (const bad of ["", "a", "a@b", "a b@c.de", `${"x".repeat(250)}@b.co`]) expect(validEmail(bad)).toBe(false);
  });
  it("posts JSON to /api/waitlist", async () => {
    const send = reply(200);
    expect(await submitWaitlist(payload, send)).toBe("ok");
    const [url, init] = (send as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/waitlist");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });
  it.each([[400, "invalid"], [422, "invalid"], [429, "rate_limited"], [500, "failed"]])("maps status %i to %s", async (status, outcome) => {
    expect(await submitWaitlist(payload, reply(status))).toBe(outcome);
  });
  it("reports a network error as failed", async () => {
    expect(await submitWaitlist(payload, vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe("failed");
  });
});
