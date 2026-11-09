/** One mail. `headers` carries List-Unsubscribe when a mail is a list mail. */
export interface MailMessage { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> }

/** Adapter every mail kind goes through. */
export interface Mailer { send(message: MailMessage): Promise<void> }

export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string) {}
  async send(message: MailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      // List-Unsubscribe travels only when the caller set it, which only list mail does.
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html, ...(message.headers ? { headers: message.headers } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend delivery failed (${response.status})`);
  }
}

/** Prints the message to stdout. For local work only: the output holds the recipient and any links in the body. */
export class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    process.stdout.write(`To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
  }
}

/** Keeps sent messages in memory, for tests. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  /** Set to make the next sends fail, to test the caller's handling. */
  failWith: Error | null = null;
  async send(message: MailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }
}

/**
 * `MAIL_PROVIDER` unset gives the console mailer outside production. In production the console mailer needs `MAIL_PROVIDER=console` set on purpose,
 * because it writes recipients and links to the log.
 */
export function mailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  const explicit = env.MAIL_PROVIDER?.trim();
  const provider = explicit || "console";
  if (provider === "console") {
    if (env.NODE_ENV === "production" && !explicit) throw new Error("MAIL_PROVIDER must be set in production; set MAIL_PROVIDER=console to use the console mailer on purpose");
    return new ConsoleMailer();
  }
  if (provider === "resend") {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error("RESEND_API_KEY and MAIL_FROM are required for Resend");
    return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
  }
  throw new Error(`MAIL_PROVIDER ${provider} is not supported yet`);
}
