const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const copy = {
  en: {
    title: "Recovery codes",
    save: "Save these codes now. They will not be shown again. Each code works once.",
    none: "These codes were already shown. Generate a new set on the account page if you did not save them.",
    wrong: "The current password is incorrect. No new codes were created.",
    back: "Back to account",
  },
  sk: {
    title: "Kódy na obnovenie",
    save: "Uložte si tieto kódy teraz. Znova sa nezobrazia. Každý kód funguje raz.",
    none: "Tieto kódy už boli zobrazené. Ak ste si ich neuložili, vytvorte na stránke účtu nové.",
    wrong: "Aktuálne heslo nie je správne. Nové kódy sa nevytvorili.",
    back: "Späť na účet",
  },
} as const;

/** Standalone no-store page. `codes` null means the password check failed; an empty list means already revealed. */
export function recoveryCodesPage(codes: string[] | null, locale: "en" | "sk"): string {
  const m = copy[locale];
  const body = codes === null ? `<p>${m.wrong}</p>` : codes.length ? `<p>${m.save}</p><pre>${codes.map(escape).join("\n")}</pre>` : `<p>${m.none}</p>`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${m.title}</title></head><body><main><h1>${m.title}</h1>${body}<p><a href="/${locale}/account">${m.back}</a></p></main></body></html>`;
}
