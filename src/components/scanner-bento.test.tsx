import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScannerBento } from "./scanner-bento";
import { stateOrder, type StateKey } from "@/i18n/rules";

describe("ScannerBento", () => {
  const counts = { setup: 3, watch: 2, wait: 1, ignore: 0, broken: 1, insufficient: 0 };
  const labels = { setup: "Conditions met", watch: "Watching", wait: "Waiting", ignore: "Not now", broken: "Criteria broken", insufficient: "Not enough data" };

  it("renders one named anchor per state with the right count and share", () => {
    const markup = renderToStaticMarkup(<ScannerBento locale="en" counts={counts} total={7} labels={labels} href={(state: StateKey) => `/en/scanner?state=${state}#scanner-group-${state}`} />);
    expect(markup).toContain('aria-label="Tickers by rule state"');
    for (const state of stateOrder) {
      expect(markup).toContain(`href="/en/scanner?state=${state}#scanner-group-${state}"`);
      expect(markup).toContain(`aria-label="Show ${counts[state]} ${counts[state] === 1 ? "ticker" : "tickers"} in ${labels[state]}"`);
    }
    expect(markup).toContain('style="width:42.857142857142854%"');
    expect(markup).toContain('style="width:0%"');
  });

  it("uses Slovak labels and range copy", () => {
    const markup = renderToStaticMarkup(<ScannerBento locale="sk" counts={counts} total={7} labels={{ ...labels, setup: "Podmienky splnené" }} href={(state: StateKey) => `/sk/scanner?state=${state}#scanner-group-${state}`} />);
    expect(markup).toContain('aria-label="Tickery podľa stavu pravidiel"');
    expect(markup).toContain('aria-label="Zobraziť 3 tickery v stave Podmienky splnené"');
    expect(markup).toContain("Nedostatok vstupných údajov na hodnotenie");
  });
});
