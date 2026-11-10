import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleMailer, MemoryMailer, ResendMailer, mailerFromEnv } from "./mailer";

afterEach(() => vi.restoreAllMocks());

describe("mailers", () => {
  it("memory mailer keeps messages and can fail on demand", async () => {
    const mailer = new MemoryMailer();
    await mailer.send({ to: "a@example.test", subject: "s", text: "t" });
    expect(mailer.sent).toHaveLength(1);
    mailer.failWith = new Error("down");
    await expect(mailer.send({ to: "a@example.test", subject: "s", text: "t" })).rejects.toThrow("down");
    expect(mailer.sent).toHaveLength(1);
  });

  it("console mailer writes to stdout", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await new ConsoleMailer().send({ to: "a@example.test", subject: "Hello", text: "Body" });
    expect(write).toHaveBeenCalledWith("To: a@example.test\nSubject: Hello\n\nBody\n");
  });

  it("selects the console mailer by default and validates Resend", () => {
    expect(mailerFromEnv({})).toBeInstanceOf(ConsoleMailer);
    expect(mailerFromEnv({ MAIL_PROVIDER: "console" })).toBeInstanceOf(ConsoleMailer);
    expect(() => mailerFromEnv({ MAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(mailerFromEnv({ MAIL_PROVIDER: "resend", RESEND_API_KEY: "key", MAIL_FROM: "hello@example.test" })).toBeInstanceOf(ResendMailer);
  });

  it("sends through the Resend HTTP API without a network call in tests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await new ResendMailer("re_test", "InvestBuddy <hello@example.test>").send({ to: "a@example.test", subject: "S", text: "T", html: "<p>T</p>" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(init?.body))).toEqual({ from: "InvestBuddy <hello@example.test>", to: ["a@example.test"], subject: "S", text: "T", html: "<p>T</p>" });
    fetchMock.mockResolvedValue(new Response("bad", { status: 422 }));
    await expect(new ResendMailer("re_test", "hello@example.test").send({ to: "a@example.test", subject: "S", text: "T" })).rejects.toThrow("Resend delivery failed (422)");
  });

  it("refuses the implicit console mailer in production, allows it when set on purpose", () => {
    expect(() => mailerFromEnv({ NODE_ENV: "production" })).toThrow(/MAIL_PROVIDER must be set/);
    expect(() => mailerFromEnv({ NODE_ENV: "production", MAIL_PROVIDER: " " })).toThrow(/MAIL_PROVIDER must be set/);
    expect(mailerFromEnv({ NODE_ENV: "production", MAIL_PROVIDER: "console" })).toBeInstanceOf(ConsoleMailer);
    expect(mailerFromEnv({ NODE_ENV: "development" })).toBeInstanceOf(ConsoleMailer);
  });
});
