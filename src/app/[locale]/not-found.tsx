"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { IconArrowRight } from "@/components/icons";
import { defaultLocale, getMessages, isLocale } from "@/i18n";

export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const m = getMessages(locale);
  return (
    <div className="frame page state-page">
      <h1 className="title">{m.errors.notFoundTitle}</h1>
      <p className="lede">{m.errors.notFoundBody}</p>
      <Link className="button" href={`/${locale}/dashboard`}>
        {m.errors.notFoundAction}
        <IconArrowRight />
      </Link>
    </div>
  );
}
