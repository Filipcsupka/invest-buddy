"use client";

import { useState } from "react";
import type { Messages } from "@/i18n";
import styles from "./screen.module.css";

type Preview = { symbol: string; cardDate: string | null; callText: string; amountText: string | null; summary: string };
export function AiCardImportForm({ labels: m }: { labels: Messages["aiScreen"] }) {
  const [raw, setRaw] = useState("");
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<Preview[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(save: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/owner/ai-cards${save ? "" : "?preview"}`, { method: "POST", headers: { Authorization: `Basic ${btoa(`owner:${password}`)}`, "Content-Type": "text/plain" }, body: raw });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || m.importError);
      setPreview(result.preview);
      if (save) { setMessage(`${m.imported}: ${result.inserted} (${result.duplicate} duplicates)`); window.location.reload(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : m.importError); }
    finally { setBusy(false); }
  }
  return <details className={styles.import}><summary>{m.import}</summary><div className={styles.importBody}>
    <label>{m.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
    <label>{m.import}<textarea value={raw} onChange={(event) => { setRaw(event.target.value); setPreview([]); }} rows={8} /></label>
    <div className={styles.actions}><button type="button" disabled={!raw.trim() || busy} onClick={() => void submit(false)}>{m.preview}</button><button type="button" disabled={!preview.length || busy} onClick={() => void submit(true)}>{m.save}</button></div>
    {message && <p role="status">{message}</p>}
    {preview.length > 0 && <div className={styles.preview}><h3>{m.preview}</h3><ul>{preview.map((c, i) => <li key={i}>{c.cardDate} · {c.symbol} · {c.callText} {c.amountText} · {c.summary}</li>)}</ul></div>}
  </div></details>;
}
