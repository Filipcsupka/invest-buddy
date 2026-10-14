export type SubmitResult = "ok" | "email" | "consent" | "rate" | "error";

export interface SubmitPayload {
  email: string;
  locale: "en" | "sk";
  consentLaunch: boolean;
  consentWeekly: boolean;
  website: string;
  source?: string;
  priceVariant?: string;
}

/** Posts the form and maps the answer to the message the form shows. */
export async function submitSignup(payload: SubmitPayload, post: typeof fetch = fetch): Promise<SubmitResult> {
  try {
    const response = await post("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) return "ok";
    if (response.status === 429) return "rate";
    if (response.status === 400) {
      const body = await response.json().catch(() => ({})) as { field?: string };
      return body.field === "email" ? "email" : body.field === "consent" ? "consent" : "error";
    }
    return "error";
  } catch {
    return "error";
  }
}
