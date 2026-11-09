import type { Metadata } from "next";
import { ResetForm } from "@/components/auth/reset-form";
import { getAuthMessages } from "@/i18n/auth-messages";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";
import styles from "../sign-in/sign-in.module.css";

export const revalidate = 3600;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getAuthMessages(locale).reset;
  return { ...pageMetadata(locale, "/reset", t.title, t.lede), robots: { index: false, follow: false } };
}

/** Password reset with a recovery code. Static shell; the form talks to /api/auth/recovery/reset. */
export default async function Reset({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  return (
    <div className={`frame ${styles.page} ${styles.single}`}>
      <section className={`kit-card ${styles.card}`} aria-label={getAuthMessages(locale).reset.title}>
        <ResetForm locale={locale} />
      </section>
    </div>
  );
}
