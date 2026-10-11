"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { errorReference } from "@/app/error-reference";
import { IconArrowRight, IconReset } from "@/components/icons";
import { defaultLocale, getMessages, isLocale } from "@/i18n";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const m = getMessages(locale);
  const [reference, setReference] = useState<string | undefined>(error.digest);
  useEffect(() => setReference(errorReference(error.digest)), [error.digest]);
  return (
    <div className="frame page state-page" role="alert">
      <h1 className="title">{m.errors.errorTitle}</h1>
      <p className="lede">{m.errors.errorBody}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s3)" }}>
        <button type="button" className="button" onClick={reset}>
          <IconReset />
          {m.errors.retry}
        </button>
        <Link className="button" href={`/${locale}`}>
          {m.errors.homeAction}
          <IconArrowRight />
        </Link>
      </div>
      {reference ? <p className="muted">{m.errors.requestIdHint} <code data-testid="request-id">{reference}</code></p> : null}
    </div>
  );
}
