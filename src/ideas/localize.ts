import { type Locale, getMessages } from "../i18n";

/**
 * Judge text sometimes keeps stored codes ("WATCH", "HIGH_CONVICTION_ADD", and in Slovak also "Strong") that the rest of the page shows
 * in words. Swap those codes for the page wording at the display edge.
 */
export function localizeCodes(locale: Locale, text: string): string {
  const m = getMessages(locale).ideas;
  const codes: Record<string, string> = { ...m.actions, ...m.ratings, Entry: m.entry, Catalyst: m.catalyst };
  const pattern = new RegExp(`(?<![\\w-])(${Object.keys(codes).sort((a, b) => b.length - a.length).join("|")})(?![\\w-])`, "g");
  return text.replace(pattern, (code) => codes[code]);
}

const EVIDENCE_SK: Record<string, string> = { "Earnings release": "Výsledková správa", "SEC XBRL": "Výkaz SEC XBRL", "SEC XBRL facts": "Výkaz SEC XBRL", "Earnings call": "Hovor o výsledkoch", "Press release": "Tlačová správa", "Investor presentation": "Prezentácia pre investorov" };
/** Source labels the judge left in English; form names such as 10-Q stay as they are. */
export const localizeEvidenceLabel = (locale: Locale, label: string): string => (locale === "sk" ? EVIDENCE_SK[label] ?? label : label);
