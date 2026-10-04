"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ locale, label, items }: { locale: string; label: string; items: { href: string; text: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="nav-links">
      {items.map((item) => {
        const href = `/${locale}${item.href}`;
        const current = pathname === href || pathname.startsWith(`${href}/`) || (item.href === "/scanner" && pathname.startsWith(`/${locale}/company/`));
        return (
          <Link key={item.href} href={href} aria-current={current ? "page" : undefined}>
            {item.text}
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
