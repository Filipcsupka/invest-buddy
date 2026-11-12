export function isVendorSourceUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "eodhd.com" || host.endsWith(".eodhd.com") || host === "eodhistoricaldata.com" || host.endsWith(".eodhistoricaldata.com");
  } catch { return false; }
}
