export const PATHS: string[];
export const LOCALES: string[];
export function urlList(base: string): string[];
export function percentile(values: number[], p: number): number | null;
export function summarize(samples: { status: number; ttfbMs: number; totalMs: number }[]): {
  n: number;
  status: Record<string, number>;
  ttfbP50: number | null;
  ttfbP95: number | null;
  totalP50: number | null;
  totalP95: number | null;
};
export function probe(base: string, runs: number): Promise<Record<string, ReturnType<typeof summarize>>>;
