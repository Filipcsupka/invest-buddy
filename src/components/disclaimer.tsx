export function Disclaimer({ text, id, compact = false }: { text: string; id?: string; compact?: boolean }) {
  return (
    <p className={compact ? "disclaimer is-compact" : "disclaimer"} id={id}>
      {text}
    </p>
  );
}
