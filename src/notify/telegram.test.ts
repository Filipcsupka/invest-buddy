import { describe, expect, it } from "vitest";
import { splitMessage, TelegramError, TelegramNotifier, telegramFromEnv } from "./telegram";

type Call = { url: string; body: { chat_id: string; text: string } };

function fakeFetch(responses: Array<{ status: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const next = responses.shift() ?? { status: 200, body: { ok: true } };
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const sleeps: number[] = [];
const sleep = async (ms: number) => { sleeps.push(ms); };

describe("TelegramNotifier", () => {
  it("posts HTML to the chat without link previews", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { ok: true } }]);
    await new TelegramNotifier({ token: "123:secret", chatId: "@invest_test", fetch: impl, sleep }).send("hello");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/bot123:secret/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "@invest_test", text: "hello", parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  });

  it("waits retry_after on 429 and then succeeds", async () => {
    sleeps.length = 0;
    const { impl, calls } = fakeFetch([{ status: 429, body: { ok: false, description: "Too Many Requests", parameters: { retry_after: 3 } } }, { status: 200, body: { ok: true } }]);
    await new TelegramNotifier({ token: "t", chatId: "1", fetch: impl, sleep }).send("x");
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([3000]);
  });

  it("fails on a client error without retrying and never includes the token", async () => {
    const { impl, calls } = fakeFetch([{ status: 403, body: { ok: false, description: "Forbidden: bot is not a member of the channel chat" } }]);
    const error = await new TelegramNotifier({ token: "123:secret", chatId: "1", fetch: impl, sleep }).send("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TelegramError);
    expect(String((error as Error).message)).toContain("403");
    expect(String((error as Error).message)).not.toContain("secret");
    expect(calls).toHaveLength(1);
  });

  it("reports network failures by error class only after retries", async () => {
    const { impl, calls } = fakeFetch([new TypeError("fetch failed https://api.telegram.org/bot123:secret"), new TypeError("x"), new TypeError("x"), new TypeError("x")]);
    const error = await new TelegramNotifier({ token: "123:secret", chatId: "1", fetch: impl, sleep, maxRetries: 3 }).send("x").catch((e: unknown) => e);
    expect(calls).toHaveLength(4);
    expect(String((error as Error).message)).toBe("telegram sendMessage failed: 0 TypeError");
  });

  it("splits long text into several messages", async () => {
    const { impl, calls } = fakeFetch([]);
    const line = "a".repeat(100);
    await new TelegramNotifier({ token: "t", chatId: "1", fetch: impl, sleep }).send(Array.from({ length: 60 }, () => line).join("\n"));
    expect(calls.length).toBe(2);
    expect(calls.every((call) => call.body.text.length <= 4096)).toBe(true);
  });
});

describe("splitMessage", () => {
  it("keeps short text whole and cuts long lines hard", () => {
    expect(splitMessage("abc", 10)).toEqual(["abc"]);
    expect(splitMessage("ab\ncd\nef", 5)).toEqual(["ab\ncd", "ef"]);
    expect(splitMessage("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});

describe("telegramFromEnv", () => {
  it("needs both the token and the chat id", () => {
    expect(telegramFromEnv({})).toBeNull();
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: "t" })).toBeNull();
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: " " })).toBeNull();
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "@c" })).toBeInstanceOf(TelegramNotifier);
  });
});
