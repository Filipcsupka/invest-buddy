import type { ReactNode } from "react";

export interface DataTableProps {
  /** Name of the scroll region and the table, read by screen readers. Required: a11y tests check every region. */
  label: string;
  caption?: ReactNode;
  /** Bound the height so the sticky header works inside the horizontal scroll box. Default true. */
  bounded?: boolean;
  /** "default" rows are about 44px; "compact" about 36px for long lists. */
  density?: "default" | "compact";
  /** Keep the first column in place while the table scrolls sideways. */
  stickyFirst?: boolean;
  describedBy?: string;
  /** Extra class on the table, for a fixed column layout. */
  className?: string;
  children: ReactNode;
}

/**
 * Base for every data table: a focusable, labelled scroll region with a sticky header, tabular figures,
 * hairline rows and a calm hover. Cells take `className="num"` for right-aligned figures. Mark a selected
 * row with `aria-selected="true"` (in a grid) or `data-selected`.
 */
export function DataTable({ label, caption, bounded = true, density = "default", stickyFirst = false, describedBy, className, children }: DataTableProps) {
  return (
    <div className="kit-table-scroll" role="region" aria-label={label} tabIndex={0} data-bounded={bounded ? "" : undefined}>
      <table className={className ? `kit-table ${className}` : "kit-table"} data-density={density} data-sticky-first={stickyFirst ? "" : undefined} aria-describedby={describedBy}>
        {caption ? <caption>{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

/** Full-width message row for an empty result. Says what is empty and, when there is one, the way out. */
export function DataTableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr className="kit-table-empty">
      <td colSpan={colSpan}>{children}</td>
    </tr>
  );
}
