import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleMailer, MemoryMailer, mailerFromEnv } from "./mailer";

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

  it("selects the console mailer by default and refuses an unbuilt provider", () => {
    expect(mailerFromEnv({})).toBeInstanceOf(ConsoleMailer);
    expect(mailerFromEnv({ MAIL_PROVIDER: "console" })).toBeInstanceOf(ConsoleMailer);
    expect(() => mailerFromEnv({ MAIL_PROVIDER: "resend" })).toThrow(/not supported yet/);
  });
});
