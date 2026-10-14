import { describe, expect, it } from "vitest";
import { MemoryWaitlistRepository } from "./waitlist-memory";
import type { SignupInput } from "./waitlist";

const signup = (over: Partial<SignupInput> = {}): SignupInput => ({ email: "Person@Example.test", locale: "en", consentLaunch: true, consentWeekly: false, consentTextVersion: "v0", tokenHash: "h1", ...over });
const hour = 3_600_000;

describe("MemoryWaitlistRepository", () => {
  it("applies the same rules as the Postgres repository", async () => {
    let now = Date.UTC(2026, 9, 14);
    const repo = new MemoryWaitlistRepository(() => now);
    expect(await repo.create(signup())).toEqual({ id: expect.any(Number) });
    expect(await repo.create(signup({ email: "PERSON@example.test", tokenHash: "h2" }))).toEqual({});
    expect(repo.rows).toHaveLength(1);
    now += 25 * hour;
    expect(await repo.create(signup({ tokenHash: "h3" }))).toEqual({ id: expect.any(Number) });
    expect((await repo.confirm("h1")).status).toBe("invalid");
    expect((await repo.confirm("h3")).status).toBe("confirmed");
    expect((await repo.confirm("h3")).status).toBe("already");
    now += 25 * hour;
    expect(await repo.create(signup({ tokenHash: "h4" }))).toEqual({});
    expect((await repo.unsubscribe(1)).status).toBe("unsubscribed");
    expect((await repo.unsubscribe(1)).status).toBe("already");
    expect((await repo.unsubscribe(9)).status).toBe("invalid");
  });

  it("keeps an unsubscribed address suppressed on a repeat sign-up", async () => {
    let now = Date.UTC(2026, 9, 14);
    const repo = new MemoryWaitlistRepository(() => now);
    const first = await repo.create(signup());
    await repo.confirm("h1");
    await repo.unsubscribe(first.id!);
    now += 48 * hour;
    expect(await repo.create(signup({ tokenHash: "h2" }))).toEqual({});
    expect(repo.rows[0].status).toBe("unsubscribed");
    expect(await repo.peekConfirm("h2")).toBe("invalid");
  });

  it("counts confirmation mails in a window and stops counting released ones", async () => {
    let now = Date.UTC(2026, 9, 14);
    const repo = new MemoryWaitlistRepository(() => now);
    const a = await repo.create(signup({ email: "a@example.test" }));
    await repo.create(signup({ email: "b@example.test", tokenHash: "h2" }));
    expect(await repo.confirmationsSince(24)).toBe(2);
    await repo.releaseConfirmation(a.id!);
    expect(await repo.confirmationsSince(24)).toBe(1);
    now += 25 * hour;
    expect(await repo.confirmationsSince(24)).toBe(0);
  });

  it("expires a token after 7 days", async () => {
    let now = Date.UTC(2026, 9, 14);
    const repo = new MemoryWaitlistRepository(() => now);
    await repo.create(signup());
    now += 7 * 24 * hour + 1;
    expect(await repo.peekConfirm("h1")).toBe("expired");
    expect((await repo.confirm("h1")).status).toBe("expired");
  });

  it("lets a sign-up send again after a failed send", async () => {
    const repo = new MemoryWaitlistRepository(() => Date.UTC(2026, 9, 14));
    const first = await repo.create(signup());
    expect(await repo.create(signup({ tokenHash: "h2" }))).toEqual({});
    await repo.releaseConfirmation(first.id!);
    expect(await repo.create(signup({ tokenHash: "h3" }))).toEqual({ id: first.id });
  });
});
