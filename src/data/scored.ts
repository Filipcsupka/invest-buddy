import { score } from "@/engine";
import { fixtureProvider, instruments } from "./fixtures";
export async function scoredUniverse() {
  return Promise.all(instruments.map(async (instrument) => ({ instrument, result: score({ ticker: instrument.ticker, bars: await fixtureProvider.bars(instrument.ticker), fundamentals: await fixtureProvider.fundamentals(instrument.ticker), macro: await fixtureProvider.macro(instrument.ticker) }) })));
}
