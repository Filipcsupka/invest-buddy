/** Request id the proxy sent with this page load (Server-Timing `rid`), else the Next error digest. */
export function errorReference(digest?: string): string | undefined {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const id = nav?.serverTiming?.find((t) => t.name === "rid")?.description;
    if (id) return id;
  } catch { /* Timing API missing: fall back to the digest. */ }
  return digest || undefined;
}

/** For useSyncExternalStore: browser values never change after load, so there is nothing to subscribe to. */
export const subscribeNothing = () => () => {};
