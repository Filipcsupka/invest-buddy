import Link from "next/link";
import type { StoredAiCard } from "@/db/ai-cards";
import type { Locale } from "@/i18n";
import { getMessages, formatDate } from "@/i18n";
import styles from "./screen.module.css";

export function AiCardView({ card, locale, expanded = false, earlierCount = 0 }: { card: StoredAiCard; locale: Locale; expanded?: boolean; earlierCount?: number }) {
  const m = getMessages(locale).aiScreen;
  const s = card.sections;
  const setup = Object.entries(s.setup).filter(([, value]) => value);
  const plan = Object.entries(s.plan).filter(([key, value]) => key !== "other" && value) as [string, string][];
  const tone = card.call === "START" || card.call === "ADD" ? "buy" : card.call === "REDUCE" || card.call === "STOP_ADD" ? "reduce" : "watch";
  const name = /^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\s+(?:is|was|reported|delivered|raised|announced)\b/.exec(card.summary)?.[1];
  return <article className={styles.card} data-tone={tone}>
    <div className={styles.cardHead}><div><p className={styles.eyebrow}>{card.cardDate ? formatDate(locale, card.cardDate) : ""}{card.tag ? ` · ${card.tag}` : ""}</p><h3><Link href={`/${locale}/ai-screen/${encodeURIComponent(card.symbol)}`}>{card.symbol}</Link></h3>{name && name.toUpperCase() !== card.symbol && <p className={styles.eyebrow}>{name}</p>}</div><span className={styles.call}>{card.callText}{card.amountText ? ` · ${card.amountText}` : ""}</span></div>
    <p className={styles.summary}>{card.summary || card.rawText.split(/\r?\n/).find((line) => line.trim() && !line.includes("—"))}</p>
    {setup.length > 0 && <div className={styles.chips} aria-label={m.setup}>{setup.map(([key, value]) => <span className={styles.chip} key={key}>{key}: {value}</span>)}</div>}
    {s.numbers.length > 0 && <dl className={styles.numbers}>{s.numbers.map((n, index) => <div key={`${n.label}-${index}`}><dt>{n.label}</dt><dd>{n.value}</dd></div>)}</dl>}
    {plan.length > 0 && <div className={styles.plan}><h4>{m.plan}</h4><dl>{plan.map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{value}</dd></div>)}</dl>{s.plan.other.map((line, index) => <p key={index}>{line}</p>)}</div>}
    {card.evidenceNames.length > 0 && <div className={styles.evidence}><h4>{m.evidence}</h4><p>{card.evidenceNames.join(" · ")}</p><small>{m.unverified}</small></div>}
    {(s.whatHappened.length > 0 || s.whyItMatters.length > 0 || s.risk.length > 0) && <details open={expanded} className={styles.details}><summary>{m.why} / {m.what} / {m.risk}</summary>
      {s.whatHappened.length > 0 && <section><h4>{m.what}</h4><ul>{s.whatHappened.map((line, index) => <li key={index}>{line}</li>)}</ul></section>}
      {s.whyItMatters.length > 0 && <section><h4>{m.why}</h4><ul>{s.whyItMatters.map((line, index) => <li key={index}>{line}</li>)}</ul></section>}
      {s.risk.length > 0 && <section><h4>{m.risk}</h4><ul>{s.risk.map((line, index) => <li key={index}>{line}</li>)}</ul></section>}
    </details>}
    {earlierCount > 0 && <Link className={styles.historyLink} href={`/${locale}/ai-screen/${encodeURIComponent(card.symbol)}#history`}>{earlierCount === 1 ? m.earlierCall : m.earlierCalls.replace("{count}", String(earlierCount))}</Link>}
    {expanded && <details className={styles.details}><summary>{m.raw}</summary><pre className={styles.raw}>{card.rawText}</pre></details>}
  </article>;
}
