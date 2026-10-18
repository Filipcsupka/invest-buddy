"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { StateKey } from "@/i18n/rules";

export type StateFilter = StateKey | "all";
type Value = { state: StateFilter; setState: (next: StateFilter) => void };

const Context = createContext<Value | null>(null);

/** Shares the selected rule status between the scanner table and the lists below it. */
export function StateFilterProvider({ children, initial = "all" }: { children: ReactNode; initial?: StateFilter }) {
  const [state, setState] = useState<StateFilter>(initial);
  return <Context.Provider value={{ state, setState }}>{children}</Context.Provider>;
}

/** Uses the shared filter when a provider exists, otherwise a local one. */
export function useStateFilter(): Value {
  const shared = useContext(Context);
  const [state, setState] = useState<StateFilter>("all");
  return shared ?? { state, setState };
}
