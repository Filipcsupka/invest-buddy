"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { StateChip } from "@/components/kit/state-chip";
import type { StateKey } from "@/i18n/rules";
import styles from "./scanner.module.css";

export function ScannerGroup({ state, label, count, range, first, selected, children }: {
  state: StateKey;
  label: string;
  count: number;
  range: string;
  first: boolean;
  selected: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (first && window.matchMedia("(max-width: 900px)").matches && ref.current) ref.current.open = true;
  }, [first]);
  return <details ref={ref} id={`scanner-group-${state}`} className={styles.group} data-state={state} open={selected || undefined}>
    <summary className={styles.groupHead}>
      <span className={styles.groupTitle}><StateChip state={state} label={label} size="md" /><span className={styles.groupCount}>{count}</span></span>
      <span className={styles.groupRange}>{range}</span><span className={styles.chevron} aria-hidden="true" />
    </summary>
    {children}
  </details>;
}
