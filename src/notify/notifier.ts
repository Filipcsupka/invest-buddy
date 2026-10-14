import { TelegramError, TelegramNotifier, type Notifier } from "./telegram";

/** Owner alerts. Email is listed for the W12 mailer and has no sender yet. */
export type AlertChannel = "telegram" | "email";

export interface AlertMessage { channel: AlertChannel; subject: string; body: string }

export interface AlertNotifier { send(message: AlertMessage): Promise<void> }

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sends alerts through the existing Telegram sender: subject in bold, body below. Both are escaped. */
export class TelegramAlertNotifier implements AlertNotifier {
  constructor(private readonly telegram: Notifier) {}

  async send(message: AlertMessage): Promise<void> {
    if (message.channel !== "telegram") throw new Error(`telegram notifier cannot send on channel ${message.channel}`);
    await this.telegram.send(`<b>${escapeHtml(message.subject)}</b>\n${escapeHtml(message.body)}`);
  }
}

/** Keeps messages in memory. For tests and dry runs. */
export class ConsoleNotifier implements AlertNotifier {
  readonly sent: AlertMessage[] = [];
  async send(message: AlertMessage): Promise<void> { this.sent.push(message); }
}

/** Sends each message through the sender registered for its channel. */
export class ChannelNotifier implements AlertNotifier {
  constructor(private readonly senders: Partial<Record<AlertChannel, AlertNotifier>>) {}

  async send(message: AlertMessage): Promise<void> {
    const sender = this.senders[message.channel];
    if (!sender) throw new Error(`no alert sender configured for channel ${message.channel}`);
    await sender.send(message);
  }
}

/**
 * Owner alerts go to the owner's private chat: TELEGRAM_OWNER_CHAT_ID (secret invest-buddy-telegram-owner) with the
 * bot token TELEGRAM_BOT_TOKEN (secret invest-buddy-telegram). Fails closed: null and a log line when either is unset.
 * It never falls back to TELEGRAM_CHAT_ID, the digest chat that others can read.
 */
export function alertNotifierFromEnv(env: Record<string, string | undefined> = process.env, log: (line: string) => void = (line) => { process.stderr.write(`${line}\n`); }): AlertNotifier | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_OWNER_CHAT_ID?.trim();
  if (!token || !chatId) {
    log(JSON.stringify({ event: "alert_notifier_unconfigured", reason: !chatId ? "TELEGRAM_OWNER_CHAT_ID is unset" : "TELEGRAM_BOT_TOKEN is unset" }));
    return null;
  }
  return new ChannelNotifier({ telegram: new TelegramAlertNotifier(new TelegramNotifier({ token, chatId })) });
}

/** Text safe to log for a failed send: error class and HTTP status only, never a message, URL or token. */
export function describeSendFailure(error: unknown): string {
  if (error instanceof TelegramError) return `TelegramError status=${error.status}`;
  return error instanceof Error ? error.name : "unknown error";
}

/** Sends and reports whether it worked. A failed alert is logged without secrets and never thrown. */
export async function sendAlert(notifier: AlertNotifier, message: AlertMessage, log: (line: string) => void = (line) => { process.stderr.write(`${line}\n`); }): Promise<boolean> {
  try {
    await notifier.send(message);
    return true;
  } catch (error) {
    log(JSON.stringify({ event: "alert_send_failed", channel: message.channel, reason: describeSendFailure(error) }));
    return false;
  }
}
