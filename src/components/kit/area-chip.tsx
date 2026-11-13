import type { Locale } from "@/i18n";

/** The three investor-path areas. Stocks is the Active path, ETF the Passive path, Indices the Market overview. */
export type Area = "stocks" | "etf" | "indices";

const labels: Record<Locale, Record<Area, string>> = {
  en: { stocks: "Stocks", etf: "ETFs", indices: "Indices" },
  sk: { stocks: "Akcie", etf: "ETF", indices: "Indexy" },
};

export const areaLabel = (locale: Locale, area: Area) => labels[locale][area];

/**
 * Area chip: a dot and the area name in the area colour on its wash (tokens `--area-*`, checked in scripts/check-contrast.ts).
 * Marks page headers and the dashboard path cards, so the area matches the sidebar group. The name is always printed.
 */
export function AreaChip({ locale, area }: { locale: Locale; area: Area }) {
  return (
    <span className="kit-area" data-area={area}>
      <span className="kit-area-dot" aria-hidden="true" />
      <span>{areaLabel(locale, area)}</span>
    </span>
  );
}
