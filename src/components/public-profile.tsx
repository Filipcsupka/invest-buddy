import type { Locale } from "@/i18n";
import { formatNumber, formatPercent } from "@/i18n";
import type { PublicHorizon } from "@/data/public-horizons";
import { profileCopy } from "@/i18n/profile-messages";
import styles from "./public-profile.module.css";

export function profileName(locale: Locale, profile: PublicHorizon["profile"]): string {
  return profileCopy[locale].names[profile];
}

export function ProfileFacts({ locale, horizon }: { locale: Locale; horizon: PublicHorizon }) {
  const m = profileCopy[locale];
  const v = horizon.values;
  const number = (key: string, suffix = "") => typeof v[key] === "number" && Number.isFinite(v[key]) ? `${formatNumber(locale, v[key] as number, 1)}${suffix}` : m.noData;
  const percent = (key: string) => typeof v[key] === "number" && Number.isFinite(v[key]) ? formatPercent(locale, (v[key] as number) / 100, 1) : m.noData;
  const facts = [
    [m.revenue, percent("yoyLatest")],
    [m.cap, typeof v.marketCapUsd === "number" ? `${formatNumber(locale, v.marketCapUsd / 1_000_000_000, 1)} ${m.billions}` : m.noData],
    [m.atr, percent("atrPercent")],
    [m.drawdown, percent("drawdownPercent")],
    [m.move, percent("move5")],
    [m.volume, number("volumeRatio", "×")],
  ];
  return <dl className={styles.facts}>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="num">{value}</dd></div>)}</dl>;
}

export function ProfileBlock({ locale, horizon }: { locale: Locale; horizon?: PublicHorizon }) {
  const m = profileCopy[locale];
  return <section className={styles.block} aria-labelledby="public-profile-title" data-profile-block="">
    <h2 id="public-profile-title">{m.title}</h2>
    {horizon ? <><p className={styles.name}>{profileName(locale, horizon.profile)}</p><ProfileFacts locale={locale} horizon={horizon} /></> : <p>{m.notComputed}</p>}
  </section>;
}
