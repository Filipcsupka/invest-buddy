"use client";
import { useSyncExternalStore } from "react";
import { errorReference, subscribeNothing } from "@/app/error-reference";
import { defaultLocale, getMessages, isLocale, localeCookie, type Locale } from "@/i18n";

function cookieLocale(): Locale {
  try {
    const value = document.cookie.split("; ").find((part) => part.startsWith(`${localeCookie}=`))?.split("=")[1];
    if (value && isLocale(value)) return value;
    if (navigator.language.toLowerCase().startsWith("sk")) return "sk";
  } catch { /* No document: keep the default. */ }
  return defaultLocale;
}

/** Last resort when the root layout itself fails. Own html and body, inline styles. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useSyncExternalStore(subscribeNothing, cookieLocale, () => defaultLocale);
  const reference = useSyncExternalStore(subscribeNothing, () => errorReference(error.digest), () => error.digest);
  const m = getMessages(locale);
  return (
    <html lang={locale}>
      <body style={{ margin: 0, font: "1rem/1.6 system-ui, sans-serif", background: "#f3f5f9", color: "#141b2e" }}>
        <main style={{ maxWidth: "42rem", margin: "12vh auto", padding: "2rem" }} role="alert">
          <h1 style={{ fontSize: "clamp(2rem, 6vw, 4rem)", lineHeight: 1.1 }}>{m.errors.errorTitle}</h1>
          <p>{m.errors.errorBody}</p>
          <button type="button" onClick={reset} style={{ padding: ".75rem 1.25rem", marginRight: ".75rem", background: "#141b2e", color: "#fff", border: 0, borderRadius: ".25rem", font: "inherit" }}>{m.errors.retry}</button>
          <a href={`/${locale}`} style={{ color: "inherit" }}>{m.errors.homeAction}</a>
          {reference ? <p style={{ opacity: 0.75 }}>{m.errors.requestIdHint} <code>{reference}</code></p> : null}
        </main>
      </body>
    </html>
  );
}
