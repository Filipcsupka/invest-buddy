"use client";
import { useParams } from "next/navigation";
import { IconReset } from "@/components/icons";
import { defaultLocale, getMessages, isLocale } from "@/i18n";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const m = getMessages(locale);
  return (
    <div className="frame page state-page" role="alert">
      <h1 className="title">{m.errors.errorTitle}</h1>
      <p className="lede">{m.errors.errorBody}</p>
      <button type="button" className="button" onClick={reset}>
        <IconReset />
        {m.errors.retry}
      </button>
    </div>
  );
}
