/** One mail. `headers` carries List-Unsubscribe when a mail is a list mail. */
export interface MailMessage { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> }

/** Adapter every mail kind goes through. The delivery provider is an owner decision (W12); until then only the two implementations below exist. */
export interface Mailer { send(message: MailMessage): Promise<void> }

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

/** `MAIL_PROVIDER` unset or `console` gives the console mailer. Any other value is refused until a provider is chosen and built (W12). */
export function mailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  const provider = env.MAIL_PROVIDER?.trim() || "console";
  if (provider === "console") return new ConsoleMailer();
  throw new Error(`MAIL_PROVIDER ${provider} is not supported yet`);
}
