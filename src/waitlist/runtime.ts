import { waitlistRepository } from "@/db/waitlist";
import { mailerFromEnv } from "@/mail/mailer";
import { tokenSecret } from "./tokens";
import type { WaitlistDeps } from "./service";

/** Real dependencies for routes and pages. Null without DATABASE_URL; throws when the token secret or mail provider is misconfigured. */
export function waitlistDeps(): WaitlistDeps | null {
  const repo = waitlistRepository();
  if (!repo) return null;
  return { repo, mailer: mailerFromEnv(), secret: tokenSecret() };
}
