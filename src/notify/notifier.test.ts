import { describe, expect, it } from "vitest";
import { alertNotifierFromEnv, ChannelNotifier, ConsoleNotifier, sendAlert, TelegramAlertNotifier } from "./notifier";
import { TelegramNotifier } from "./telegram";

type Call = { url: string; body: { chat_id: string; text: string } };
const TOKEN = "123456:SECRET-token";

function fakeFetch(plan: Array<{ status: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const next = plan.shift() ?? { status: 200, body: { ok: true } };
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const sleep = async () => undefined;
const build = (plan: Parameters<typeof fakeFetch>[0], maxRetries = 1) => {
  const { impl, calls } = fakeFetch(plan);
  const telegram = new TelegramNotifier({ token: TOKEN, chatId: "42", fetch: impl, sleep, maxRetries });
  return { notifier: new ChannelNotifier({ telegram: new TelegramAlertNotifier(telegram) }), calls };
};
const message = { channel: "telegram" as const, subject: "Job <late>", body: "daily & prices" };

describe("alert notifier", () => {
  it("posts the escaped subject and body to the Telegram chat", async () => {
    const { notifier, calls } = build([{ status: 200, body: { ok: true } }]);
    await notifier.send(message);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ chat_id: "42", text: "<b>Job &lt;late&gt;</b>\ndaily &amp; prices" });
  });

  it("fails on a non-2xx answer, logs no token", async () => {
    const { notifier, calls } = build([{ status: 403, body: { ok: false, description: "Forbidden" } }]);
    const lines: string[] = [];
    expect(await sendAlert(notifier, message, (l) => lines.push(l))).toBe(false);
    expect(calls).toHaveLength(1);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({ event: "alert_send_failed", channel: "telegram", reason: "TelegramError status=403" });
    expect(lines.join("")).not.toContain("SECRET");
  });

  it("retries a 5xx, then reports failure", async () => {
    const { notifier, calls } = build([{ status: 502, body: { ok: false } }, { status: 502, body: { ok: false } }]);
    const lines: string[] = [];
    expect(await sendAlert(notifier, message, (l) => lines.push(l))).toBe(false);
    expect(calls).toHaveLength(2);
    expect(lines.join("")).toContain("status=502");
  });

  it("reports a timeout by error class without the URL or token", async () => {
    const timeout = Object.assign(new Error(`aborted https://api.telegram.org/bot${TOKEN}/sendMessage`), { name: "TimeoutError" });
    const { notifier, calls } = build([timeout, timeout]);
    const lines: string[] = [];
    expect(await sendAlert(notifier, message, (l) => lines.push(l))).toBe(false);
    expect(calls).toHaveLength(2);
    expect(lines.join("")).toContain("status=0");
    expect(lines.join("")).not.toContain("SECRET");
    expect(lines.join("")).not.toContain("api.telegram.org");
  });

  it("succeeds after one retry", async () => {
    const { notifier, calls } = build([{ status: 500, body: { ok: false } }, { status: 200, body: { ok: true } }]);
    expect(await sendAlert(notifier, message, () => undefined)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("rejects a channel without a sender", async () => {
    const { notifier } = build([]);
    await expect(notifier.send({ ...message, channel: "email" })).rejects.toThrow("no alert sender configured for channel email");
  });

  it("builds from env only when the token and the owner chat id are set", () => {
    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    expect(alertNotifierFromEnv({}, log)).toBeNull();
    expect(alertNotifierFromEnv({ TELEGRAM_BOT_TOKEN: "t" }, log)).toBeNull();
    expect(alertNotifierFromEnv({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_OWNER_CHAT_ID: "1" }, log)).not.toBeNull();
    expect(lines).toHaveLength(2);
  });

  it("fails closed without the owner chat id and never uses the digest chat", () => {
    const lines: string[] = [];
    expect(alertNotifierFromEnv({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "-100digest" }, (l) => lines.push(l))).toBeNull();
    expect(lines[0]).toContain("TELEGRAM_OWNER_CHAT_ID is unset");
    expect(lines[0]).not.toContain("-100digest");
  });

  it("sends to the owner chat, not the digest chat", async () => {
    const f = fakeFetch([{ status: 200, body: { ok: true } }]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = f.impl as unknown as typeof fetch;
    try {
      const notifier = alertNotifierFromEnv({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: "-100digest", TELEGRAM_OWNER_CHAT_ID: "42" });
      await notifier!.send(message);
    } finally { globalThis.fetch = realFetch; }
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].body.chat_id).toBe("42");
  });

  it("keeps messages in the console notifier", async () => {
    const sink = new ConsoleNotifier();
    await sink.send(message);
    expect(sink.sent).toEqual([message]);
  });
});
