"use client";
import { useParams } from "next/navigation";
import { defaultLocale, getMessages, isLocale } from "@/i18n";

export default function Loading() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  return (
    <div className="frame page loading" aria-busy="true">
      <p className="loading-label" role="status">
        {getMessages(locale).common.loading}
      </p>
      <span className="skeleton skeleton-title" />
      <span className="skeleton skeleton-line" />
      <span className="skeleton skeleton-line is-short" />
      <div className="skeleton-table" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="skeleton skeleton-row" />
        ))}
      </div>
    </div>
  );
}
