import { getPool } from "../db/pool";
import { loadMacroEvents, MACRO_EVENTS, type MacroEvent } from "./macro-calendar";
import { CACHE_TAGS, webCached } from "./web-cache";

async function loadUncached(from: string): Promise<MacroEvent[]> {
  if (process.env.DATA_MODE === "fixture") return [...MACRO_EVENTS];
  return loadMacroEvents(getPool(), from);
}

/** Macro calendar for web pages: stored schedule with the fallback list, cached 300 s and purged with the scores tag. */
export const storedMacroEvents = webCached(loadUncached, "macro-events", [CACHE_TAGS.scores], { bypass: () => !getPool() });
