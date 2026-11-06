"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SideIcon } from "./nav-icons";
import { sideStorageKey as sideKey } from "./pre-paint";

export function NavLinks({ locale, label, items, sectionLabel }: { locale: string; label: string; sectionLabel?: string; items: { href: string; text: string; icon?: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="nav-links" style={sectionLabel ? { flex: "none" } : undefined}>
      {sectionLabel && <span className="nav-text" style={{ color: "var(--navy-ink-2)", fontSize: "0.75rem", fontWeight: 700, padding: "0.75rem 0.75rem 0.25rem" }}>{sectionLabel}</span>}
      {items.map((item) => {
        const href = `/${locale}${item.href}`;
        const current = pathname === href || (pathname.startsWith(`${href}/`) && !(item.href === "/etf" && pathname.startsWith(`${href}/track-record`))) || (item.href === "/dashboard" && pathname.startsWith(`/${locale}/company/`));
        return (
          <Link key={item.href} href={href} aria-current={current ? "page" : undefined} title={item.text}>
            <SideIcon name={item.icon ?? item.href.slice(1)} />
            <span className="nav-text">{item.text}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function LanguageSwitch({ locale, target, name, action, cookie }: { locale: string; target: string; name: string; action: string; cookie: string }) {
  const pathname = usePathname();
  const rest = pathname.startsWith(`/${locale}`) ? pathname.slice(locale.length + 1) : "";
  return (
    <Link
      className="lang-switch"
      href={`/${target}${rest}`}
      hrefLang={target}
      lang={target}
      aria-label={action}
      title={action}
      onClick={() => {
        document.cookie = `${cookie}=${target}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      <span aria-hidden="true" className="lang-code">
        {target.toUpperCase()}
      </span>
      <span className="lang-name">{name}</span>
    </Link>
  );
}

/** Mobile menu button. The panel is plain markup in the header; this only flips data-open on it. */
export function MenuToggle({ openLabel, closeLabel }: { openLabel: string; closeLabel: string }) {
  const pathname = usePathname();
  // The menu is open for the path it was opened on, so a navigation closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header");
    if (!header) return;
    if (open) header.dataset.open = "";
    else delete header.dataset.open;
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAt(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const label = open ? closeLabel : openLabel;
  return (
    <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="side-panel" aria-label={label} title={label} onClick={() => setOpenAt(open ? null : pathname)}>
      <SideIcon name={open ? "close" : "menu"} />
    </button>
  );
}


/** The sidebar is full from 1200px and an icon rail from 900px. A stored choice overrides that on desktop. */
function effectiveRail(): boolean {
  const stored = document.documentElement.dataset.side;
  if (stored === "rail") return true;
  if (stored === "full") return false;
  return !window.matchMedia("(min-width: 1200px)").matches;
}

/** Desktop collapse button. Hidden on phones, where the menu button and drawer do this job. */
export function SideToggle({ collapseLabel, expandLabel }: { collapseLabel: string; expandLabel: string }) {
  const [rail, setRail] = useState(false);
  useEffect(() => {
    const sync = () => setRail(effectiveRail());
    sync();
    const query = window.matchMedia("(min-width: 1200px)");
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const label = rail ? expandLabel : collapseLabel;
  return (
    <button
      type="button"
      className="side-toggle"
      aria-expanded={!rail}
      aria-controls="side-panel"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = rail ? "full" : "rail";
        document.documentElement.dataset.side = next;
        try {
          localStorage.setItem(sideKey, next);
        } catch {
          /* storage blocked: the choice lasts for this page view */
        }
        setRail(!rail);
      }}
    >
      <svg className="icon side-toggle-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="3" y="4" width="14" height="12" rx="2.5" />
        <path d="M8 4v12" />
        <path className="side-toggle-chevron" d="m13.5 8.5-1.5 1.5 1.5 1.5" />
      </svg>
    </button>
  );
}
