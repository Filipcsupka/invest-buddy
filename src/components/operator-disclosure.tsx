export function OperatorDisclosure({ text }: { text: string }) {
  if (!text.trim()) return null;
  return <p className="disclosure">{text}</p>;
}

export function SampleStamp({ text }: { text: string }) {
  return <span className="stamp">{text}</span>;
}
