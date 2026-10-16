/**
 * ADR-001 line shown directly under the score widget and under generated text, not only in the footer.
 * Wording is the shared `common.disclaimer` key. Final text needs the lawyer check (TASK-064).
 */
export function AdrLine({ text, id }: { text: string; id?: string }) {
  return <p className="disclaimer is-compact" id={id} data-adr-line="">{text}</p>;
}

export function Disclaimer({ text, id, compact = false }: { text: string; id?: string; compact?: boolean }) {
  return (
    <p className={compact ? "disclaimer is-compact" : "disclaimer"} id={id}>
      {text}
    </p>
  );
}
