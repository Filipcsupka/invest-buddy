type Query = Record<string, string | string[] | undefined>;

const SOURCE = /^[a-z0-9_-]{1,32}$/;

/** Where the visitor came from: `utm_source`, then `ref`, lower-cased and checked against the API's label pattern. Falls back to the page name. */
export function resolveSource(query: Query | undefined, fallback: string): string {
  for (const key of ["utm_source", "ref"]) {
    const raw = query?.[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
    if (value && SOURCE.test(value)) return value;
  }
  return fallback;
}
