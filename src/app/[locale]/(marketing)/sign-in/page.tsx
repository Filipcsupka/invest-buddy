import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { callbackError, safeNext } from "@/auth/client-api";
import { AuthForm } from "@/components/auth/auth-form";
import { ResultMark } from "@/components/kit";
import { getAuthMessages } from "@/i18n/auth-messages";
import { pageMetadata } from "@/i18n/metadata";
import { getWelcomeMessages } from "@/i18n/welcome-messages";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import Link from "next/link";
import { getIdentityMessages } from "@/i18n/identity-messages";
import styles from "./sign-in.module.css";

type Props = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getAuthMessages(locale);
  return { ...pageMetadata(locale, "/sign-in", t.title, t.lede), robots: { index: false, follow: true } };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/** One screen for sign-up and sign-in. `next` is validated before it reaches the form; `error` comes back from a failed redirect. */
async function SignIn({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const query = (await searchParams) ?? {};
  const next = safeNext(first(query.next), `/${locale}`);
  const error = callbackError(first(query.error));
  const mode = first(query.mode) === "sign-in" ? "sign-in" : "sign-up";
  const w = getWelcomeMessages(locale).tiers;
  return (
    <div className={`frame ${styles.page}`}>
      <section className={`kit-card ${styles.card}`} aria-label={getAuthMessages(locale).title}>
        <AuthForm locale={locale} next={next} error={error} mode={mode} headingLevel={1} />
        <p className={styles.owner}><Link href={`/${locale}/owner-sign-in`}>{getIdentityMessages(locale).ownerLink}</Link></p>
      </section>
      <aside className={styles.side} aria-labelledby="free-includes">
        <h2 id="free-includes" className={styles.sideTitle}>{w.freeTitle}</h2>
        <p className={styles.sideLede}>{w.freePrice}</p>
        <ul className={styles.list}>
          {w.free.map((item) => <li key={item}><span className="kit-mark" data-result="pass"><ResultMark result="pass" /></span>{item}</li>)}
        </ul>
      </aside>
    </div>
  );
}

export default withPageLog("/sign-in", SignIn);
