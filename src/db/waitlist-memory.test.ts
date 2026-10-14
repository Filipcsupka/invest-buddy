import { describe, expect, it } from "vitest";
import { MemoryWaitlistRepository } from "./waitlist-memory";
import type { SignupInput } from "./waitlist";

const signup = (over: Partial<SignupInput> = {}): SignupInput => ({ email: "Person@Example.test", locale: "en", consentLaunch: true, consentWeekly: false, consentTextVersion: "v0", tokenHash: "h1", ...over });
const hour = 3_600_000;

describe("MemoryWaitlistRepository", () => {
  it("applies the same rules as the Postgres repository", async () => {
    let now = Date.UTC(2026, 9, 14);
    const repo = new MemoryWaitlistRepository(() => now);
    expect(await repo.create(signup())).toEqual({ sendConfirmation: true });
    expect(await repo.create(signup({ email: "PERSON@example.test", tokenHash: "h2" }))).toEqual({ sendConfirmation: false });
    expect(repo.rows).toHaveLength(1);
    now += 25 * hour;
    expect(await repo.create(signup({ tokenHash: "h3" }))).toEqual({ sendConfirmation: true });
    expect((await repo.confirm("h1")).status).toBe("invalid");
    expect((await repo.confirm("h3")).status).toBe("confirmed");
    expect((await repo.confirm("h3")).status).toBe("already");
    now += 25 * hour;
    expect(await repo.create(signup({ tokenHash: "h4" }))).toEqual({ sendConfirmation: false });
    expect((await repo.unsubscribe(1)).status).toBe("unsubscribed");
    expect((await repo.unsubscribe(1)).status).toBe("already");
    expect((await repo.unsubscribe(9)).status).toBe("invalid");
  });

  it("expires a token after 7 days", async () => {
    let now = Date.UTC(2026, 9, 14);
    const repo = new MemoryWaitlistRepository(() => now);
    await repo.create(signup());
    now += 7 * 24 * hour + 1;
    expect(await repo.peekConfirm("h1")).toBe("expired");
    expect((await repo.confirm("h1")).status).toBe("expired");
  });
});
