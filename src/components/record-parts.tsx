import type { HTMLAttributes, ReactNode } from "react";
import "./record-pages.css";

/** App-style page head for the record and reading pages: title and lede left, meta pills and actions right. */
export function RecordHead({ title, lede, stamp, meta, actions, children }: { title: string; lede?: string; stamp?: ReactNode; meta?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="rp-head">
      <div className="rp-head-main">
        <div className="rp-head-title">
          <h1 className="title">{title}</h1>
          {stamp}
        </div>
        {lede ? <p className="lede">{lede}</p> : null}
        {meta ? <div className="rp-head-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="rp-head-actions">{actions}</div> : null}
      {children}
    </header>
  );
}

type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  id: string;
  title: string;
  lede?: string;
  meta?: ReactNode;
  /** Flush body: a table or chart runs edge to edge inside the card. */
  flush?: boolean;
  tone?: "plain" | "soft";
  children: ReactNode;
};

/** A titled card section. Extra props (the paywall markers) land on the section element. */
export function RecordCard({ id, title, lede, meta, flush = false, tone = "plain", children, className, ...rest }: CardProps) {
  return (
    <section {...rest} className={["rp-card", className].filter(Boolean).join(" ")} aria-labelledby={id} data-flush={flush ? "" : undefined} data-tone={tone === "soft" ? "soft" : undefined}>
      <div className="rp-card-head">
        <div className="rp-card-titles">
          <h2 id={id}>{title}</h2>
          {lede ? <p>{lede}</p> : null}
        </div>
        {meta ? <div className="rp-card-meta">{meta}</div> : null}
      </div>
      <div className="rp-card-body">{children}</div>
    </section>
  );
}

/** One KPI card: figure first, label under it, optional note. `featured` is the navy card. */
export function KpiCard({ label, children, note, featured = false }: { label: string; children: ReactNode; note?: ReactNode; featured?: boolean }) {
  return (
    <div className="rp-kpi" data-featured={featured ? "" : undefined}>
      <dt className="rp-kpi-label">{label}</dt>
      <dd className="rp-kpi-value num">{children}</dd>
      {note ? <dd className="rp-kpi-note">{note}</dd> : null}
    </div>
  );
}

export function KpiRow({ children, count }: { children: ReactNode; count: number }) {
  return <dl className="rp-kpis" style={{ "--cols": count } as React.CSSProperties}>{children}</dl>;
}

/** Sticky pill bar of in-page anchors. Plain links, no script. */
export function JumpTabs({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  return (
    <nav className="rp-jump kit-tabs" aria-label={label}>
      {items.map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}
    </nav>
  );
}
