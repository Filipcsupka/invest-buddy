import type { ReactNode } from "react";
import type { Locale } from "@/i18n";
import { getRecordPagesMessages } from "@/i18n/record-pages-messages";
import "./record-pages.css";

export interface TocItem {
  id: string;
  label: string;
}

/**
 * Long-form reading frame: a sticky contents rail beside the text. Below 1000px the contents become a sticky pill bar above
 * the text. `flow="cards"` expects titled cards as children, `flow="doc"` sets them as one article card. Plain anchors, no script. The body keeps prose at 68ch; tables inside it may run wider.
 */
export function ReadingLayout({ locale, toc, children, flow = "cards" }: { locale: Locale; toc: TocItem[]; children: ReactNode; flow?: "cards" | "doc" }) {
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
      <div className="rp-body" data-flow={flow}>{children}</div>
    </div>
  );
}
