import type { Plural } from "./messages";

/** Per-ticker SEO text. Kept apart from messages.ts. English and Slovak carry the same figures. No action wording, no prices. */
interface SeoMessages {
  /** "{n} rules" counted by the total, so Slovak "z 1 pravidla" and "z 9 pravidiel" both read correctly. */
  rulesTotal: Plural;
  title: string;
  titleNoScore: string;
  description: string;
  descriptionNoDate: string;
  descriptionNoScore: string;
  summary: string;
  summaryNoDate: string;
  summaryNoScore: string;
}

export const seoMessages: Record<"en" | "sk", SeoMessages> = {
  en: {
    rulesTotal: { one: "{n} rule", few: "{n} rules", many: "{n} rules", other: "{n} rules" },
    title: "{label}: meets {met} of {rules}",
    titleNoScore: "{label}: not enough data to score",
    description: "{ticker} meets {met} of {rules} as of {date}. State: {state}. Data for {known} of {rules}. Informational screening, not advice.",
    descriptionNoDate: "{ticker} meets {met} of {rules}. State: {state}. Data for {known} of {rules}. Informational screening, not advice.",
    descriptionNoScore: "{ticker} has not enough data to score as of {date}. Informational screening, not advice.",
    summary: "As of {date}, {ticker} meets {met} of {rules} in the published screening method. State: {state}. Data covers {known} of {rules}.",
    summaryNoDate: "{ticker} meets {met} of {rules} in the published screening method. State: {state}. Data covers {known} of {rules}.",
    summaryNoScore: "As of {date}, {ticker} has not enough data to be scored.",
  },
  sk: {
    rulesTotal: { one: "{n} pravidla", few: "{n} pravidiel", many: "{n} pravidla", other: "{n} pravidiel" },
    title: "{label}: spĺňa {met} z {rules}",
    titleNoScore: "{label}: nedostatok údajov na skóre",
    description: "{ticker} spĺňa {met} z {rules} k {date}. Stav: {state}. Údaje pre {known} z {rules}. Informatívny prehľad, nie poradenstvo.",
    descriptionNoDate: "{ticker} spĺňa {met} z {rules}. Stav: {state}. Údaje pre {known} z {rules}. Informatívny prehľad, nie poradenstvo.",
    descriptionNoScore: "{ticker} nemá k {date} dosť údajov na skóre. Informatívny prehľad, nie poradenstvo.",
    summary: "K {date} {ticker} spĺňa {met} z {rules} zverejnenej metodiky. Stav: {state}. Údaje pokrývajú {known} z {rules}.",
    summaryNoDate: "{ticker} spĺňa {met} z {rules} zverejnenej metodiky. Stav: {state}. Údaje pokrývajú {known} z {rules}.",
    summaryNoScore: "K {date} {ticker} nemá dosť údajov na skóre.",
  },
};
