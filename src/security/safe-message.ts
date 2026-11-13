/** Bound upstream diagnostics and remove credentials before logging them. */
export const safeMessage = (message: unknown) => String(message).replace(/[\r\n]+/g, " ")
  .replace(/((?:^|[?&;\s])(?:[^=?&;\s]*(?:key|token)[^=?&;\s]*|secret|t|q)=)[^&;\s]+/gi, "$1[redacted]")
  .replace(/(bearer\s+)\S+/gi, "$1[redacted]").slice(0, 200);
