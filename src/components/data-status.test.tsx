import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataStatus } from "./data-status";
import { stale } from "@/data/store";

describe("data freshness", () => {
  it("marks data older than three days, but not recent data", () => {
    const today = new Date();
    const date = (days: number) => new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10);
    expect(stale(date(5))).toBe(true);
    expect(stale(date(1))).toBe(false);
  });

  it("shows empty and dated stale notices in both languages", () => {
    for (const locale of ["en", "sk"] as const) {
      const empty = renderToStaticMarkup(<DataStatus locale={locale} lastUpdated={null} stale={false} />);
      expect(empty).toContain(locale === "en" ? "No data yet" : "Zatiaľ tu nie sú údaje");
      const staleHtml = renderToStaticMarkup(<DataStatus locale={locale} lastUpdated="2026-10-01" stale />);
      expect(staleHtml).toContain(locale === "en" ? "Stale since" : "Zastarané od");
      expect(staleHtml).toContain("2026");
    }
  });
});
