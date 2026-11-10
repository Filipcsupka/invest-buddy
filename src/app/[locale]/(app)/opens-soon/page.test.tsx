import { expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), redirect: navigation.redirect }));
import OldPreview from "./page";

it.each(["en", "sk"])("redirects the old %s URL to the Plus preview", async (locale) => {
  await expect(OldPreview({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ page: "dashboard" }) })).rejects.toThrow(`redirect:/${locale}/plus-preview?page=dashboard`);
});

it("encodes an old query value as a relative redirect", async () => {
  await expect(OldPreview({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ page: "//evil.test" }) })).rejects.toThrow("redirect:/en/plus-preview?page=%2F%2Fevil.test");
});
