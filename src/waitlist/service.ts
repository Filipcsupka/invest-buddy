import { siteUrl } from "@/i18n/metadata";
import { confirmMail } from "@/mail/templates/confirm";
import { welcomeMail } from "@/mail/templates/welcome";
import type { Mailer } from "@/mail/mailer";
import type { ConfirmResult, SignupInput, UnsubscribeResult, WaitlistLocale, WaitlistPerson, WaitlistRepository } from "@/db/waitlist";
import { hashToken, newConfirmToken, unsubscribeToken, verifyUnsubscribeToken } from "./tokens";

export interface WaitlistDeps {
  repo: WaitlistRepository;
  mailer: Mailer;
  secret: string;
  baseUrl?: string;
}

const base = (deps: WaitlistDeps) => deps.baseUrl ?? siteUrl;
const links = (deps: WaitlistDeps, locale: WaitlistLocale, id: number) => {
  const token = encodeURIComponent(unsubscribeToken(id, deps.secret));
  return { page: `${base(deps)}/${locale}/waitlist/unsubscribe?token=${token}`, post: `${base(deps)}/api/waitlist/unsubscribe?token=${token}` };
};

/** Stores a pending row and mails the confirmation link. Returns whether a mail was sent; a repeat inside 24 hours and an already confirmed address send nothing. */
export async function signUp(deps: WaitlistDeps, input: Omit<SignupInput, "tokenHash">): Promise<"sent" | "skipped" | "mail_failed"> {
  const token = newConfirmToken();
  const { id } = await deps.repo.create({ ...input, tokenHash: hashToken(token) });
  if (id === undefined) return "skipped";
  try {
    await deps.mailer.send(confirmMail({
      to: input.email.trim().toLowerCase(),
      locale: input.locale,
      confirmUrl: `${base(deps)}/${input.locale}/waitlist/confirm?token=${encodeURIComponent(token)}`,
      unsubscribeUrl: links(deps, input.locale, id).page,
    }));
    return "sent";
  } catch {
    // The row stays; the next sign-up may send again instead of waiting 24 hours.
    await deps.repo.releaseConfirmation(id);
    return "mail_failed";
  }
}

/** Confirms the token. The welcome mail goes out on the first confirmation only; a failed send does not undo the confirmation. */
export async function confirmSignup(deps: WaitlistDeps, token: string): Promise<ConfirmResult> {
  const result = await deps.repo.confirm(hashToken(token));
  if (result.status === "confirmed") await sendWelcome(deps, result.person).catch(() => undefined);
  return result;
}

function sendWelcome(deps: WaitlistDeps, person: WaitlistPerson): Promise<void> {
  const link = links(deps, person.locale, person.id);
  return deps.mailer.send(welcomeMail({ to: person.email, locale: person.locale, unsubscribeUrl: link.page, unsubscribePostUrl: link.post, weekly: person.consentWeekly }));
}

/** Idempotent. A token that is not genuine is `invalid`. */
export async function unsubscribeSignup(deps: WaitlistDeps, token: string): Promise<UnsubscribeResult> {
  const id = verifyUnsubscribeToken(token, deps.secret);
  return id === null ? { status: "invalid" } : deps.repo.unsubscribe(id);
}
