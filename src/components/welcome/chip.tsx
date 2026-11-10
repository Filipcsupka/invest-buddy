import s from "./story.module.css";

/** Status of an area: open to all, free account, Plus, or opens soon. Locked kinds draw the lock (CSS ::before), never colour alone. */
export type Chip = "open" | "free" | "plus" | "soon";

export function ChipTag({ chip, label }: { chip: Chip; label: string }) {
  return <span className={s.chip} data-chip={chip}>{label}</span>;
}
