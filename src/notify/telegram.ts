/** Posts HTML-formatted messages (parse_mode HTML, no link preview) to one Telegram chat or channel through the Bot API sendMessage method. */

export const TELEGRAM_MAX_LENGTH = 4096;

/** Text is Telegram HTML: callers escape <, > and & in anything that is not markup. */
export interface Notifier { send(text: string): Promise<void> }

export interface TelegramOptions {
  token: string;
  chatId: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  apiBase?: string;
}

export class TelegramError extends Error {
  constructor(readonly status: number, description: string) {
    // The request URL carries the bot token, so the message never includes it.
    super(`telegram sendMessage failed: ${status} ${description}`.trim());
    this.name = "TelegramError";
  }
}

/** Splits text into chunks under the Telegram limit, preferring line breaks. */
export function splitMessage(text: string, limit = TELEGRAM_MAX_LENGTH): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = rest.lastIndexOf("\n", limit);
    const at = cut > 0 ? cut : limit;
    chunks.push(rest.slice(0, at));
    rest = rest.slice(at).replace(/^\n/, "");
  }
  if (rest.length) chunks.push(rest);
  return chunks;
}

type TelegramResponse = { ok: boolean; description?: string; parameters?: { retry_after?: number } };

export class TelegramNotifier implements Notifier {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly apiBase: string;

  constructor(private readonly options: TelegramOptions) {
    if (!options.token) throw new Error("TELEGRAM_BOT_TOKEN is empty");
    if (!options.chatId) throw new Error("TELEGRAM_CHAT_ID is empty");
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxRetries = options.maxRetries ?? 3;
    this.apiBase = options.apiBase ?? "https://api.telegram.org";
  }

  async send(text: string): Promise<void> {
    for (const chunk of splitMessage(text)) await this.sendChunk(chunk);
  }

  private async sendChunk(text: string): Promise<void> {
    const url = `${this.apiBase}/bot${this.options.token}/sendMessage`;
    const body = JSON.stringify({ chat_id: this.options.chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(15_000) });
      } catch (error) {
        // Network errors can echo the URL; report only the error class.
        if (attempt < this.maxRetries) { await this.sleep(2_000 * (attempt + 1)); continue; }
        throw new TelegramError(0, error instanceof Error ? error.name : "network error");
      }
      const payload = (await response.json().catch(() => ({ ok: false }))) as TelegramResponse;
      if (response.ok && payload.ok) return;
      const retryAfter = payload.parameters?.retry_after;
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(Math.min(retryAfter ? retryAfter * 1_000 : 2_000 * (attempt + 1), 60_000));
        continue;
      }
      throw new TelegramError(response.status, payload.description ?? "");
    }
  }
}

/** Builds a notifier from TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, or null when either is unset. */
export function telegramFromEnv(env: Record<string, string | undefined> = process.env): TelegramNotifier | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return new TelegramNotifier({ token, chatId });
}
