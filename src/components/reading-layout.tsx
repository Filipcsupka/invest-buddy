import type { ReactNode } from "react";
import type { Locale } from "@/i18n";
import { getRecordPagesMessages } from "@/i18n/record-pages-messages";
import "./record-pages.css";

export interface TocItem {
  id: string;
  label: string;
}

/**
 * Long-form reading frame: a sticky in-page contents column beside the text. Below 1000px the contents become a short wrapped list above
 * the text. Plain anchors, no script. The body keeps prose at 68ch; tables inside it may run wider.
 */
export function ReadingLayout({ locale, toc, children }: { locale: Locale; toc: TocItem[]; children: ReactNode }) {
  const label = getRecordPagesMessages(locale).contents;
  return (
    <div className="rp-reading">
      <nav className="rp-toc" aria-label={label}>
        <p className="rp-toc-label" aria-hidden="true">{label}</p>
        <ol>
          {toc.map((item) => (
            <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>
          ))}
        </ol>
      </nav>
      <div className="rp-body">{children}</div>
    </div>
  );
}
