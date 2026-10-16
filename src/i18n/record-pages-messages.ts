import type { Locale } from "./index";

/**
 * Copy added by the track record, methodology, insiders, portfolio and legal page redesign. Kept apart from messages.ts so parallel
 * page work does not collide. ADR-001: describes records and rules, never tells a reader to act. Figures match the existing
 * methodology worked example (17 of 23 points, 14 of 17 points, 19 point coverage line) and the Slovak text carries the same figures.
 */
const en = {
  contents: "On this page",
  record: {
    methodTitle: "How the record is kept",
    startLabel: "Log started",
    firstSnapshot: "First snapshot",
    snapshotsLabel: "Snapshots",
    signalsLabel: "Signals recorded",
    measuredLabel: "Measured at 20 days",
    tickersLabel: "Tickers per snapshot",
    missesStay: "Misses stay in the record.",
    benchmarkRow: "Benchmark",
  },
  method: {
    weight: "Weight",
    threshold: "Threshold",
    exampleOne: "17 of 23 points with data met",
    exampleTwo: "14 of 17 points with data met, and 17 is under 19",
    exampleAria: "Worked example {n}",
    stepPoints: "Percentage",
  },
};

const sk: typeof en = {
  contents: "Na tejto stránke",
  record: {
    methodTitle: "Ako sa záznam vedie",
    startLabel: "Záznam od",
    firstSnapshot: "Prvá snímka",
    snapshotsLabel: "Snímky",
    signalsLabel: "Zaznamenané signály",
    measuredLabel: "Vyhodnotené po 20 dňoch",
    tickersLabel: "Tickery v snímke",
    missesStay: "Zlyhania ostávajú v zázname.",
    benchmarkRow: "Porovnanie",
  },
  method: {
    weight: "Váha",
    threshold: "Prah",
    exampleOne: "Splnených 17 z 23 bodov s údajmi",
    exampleTwo: "Splnených 14 zo 17 bodov s údajmi a 17 je menej ako 19",
    exampleAria: "Vzorový príklad {n}",
    stepPoints: "Percento",
  },
};

export type RecordPagesMessages = typeof en;
const recordPagesMessages: Record<Locale, RecordPagesMessages> = { en, sk };

export function getRecordPagesMessages(locale: Locale): RecordPagesMessages {
  return recordPagesMessages[locale];
}
