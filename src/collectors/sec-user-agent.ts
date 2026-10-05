/** SEC requires a usable contact address; deployment placeholders must never be sent. */
export function validSecUserAgent(value: string | undefined): boolean {
  return !!value && !/REPLACE_WITH_/i.test(value) && /(?:^|\s)[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+(?:\s|$)/.test(value.trim());
}

export function requireSecUserAgent(value: string | undefined): string {
  if (!validSecUserAgent(value)) throw new Error("SEC_USER_AGENT must contain a real contact email address");
  return value!;
}
