"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SideIcon } from "./nav-icons";

export function NavLinks({ locale, label, items }: { locale: string; label: string; items: { href: string; text: string; icon?: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="nav-links">
      {items.map((item) => {
        const href = `/${locale}${item.href}`;
        const current = pathname === href || pathname.startsWith(`${href}/`) || (item.href === "/dashboard" && pathname.startsWith(`/${locale}/company/`));
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
