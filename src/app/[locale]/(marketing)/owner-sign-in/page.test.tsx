import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { issueOwnerSession, OWNER_SESSION_COOKIE } from "@/security/owner-session";

const state = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: state.cookie }) }));
import OwnerSignIn from "./page";

const oldPassword = process.env.OWNER_RESEARCH_PASSWORD;
const oldSecret = process.env.OWNER_SESSION_SECRET;
afterEach(() => {
  state.cookie = "";
  if (oldPassword === undefined) delete process.env.OWNER_RESEARCH_PASSWORD; else process.env.OWNER_RESEARCH_PASSWORD = oldPassword;
  if (oldSecret === undefined) delete process.env.OWNER_SESSION_SECRET; else process.env.OWNER_SESSION_SECRET = oldSecret;
});

it.each(["en", "sk"])("renders the %s password form and a sign-out form after login", async (locale) => {
  process.env.OWNER_RESEARCH_PASSWORD = "test-password";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
  const props = { params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) };
  const form = renderToStaticMarkup(await OwnerSignIn(props));
  expect(form).toContain('action="/api/owner/login"');
  expect(form).toContain('type="password"');
  expect(form).not.toContain("test-password");
  state.cookie = `${OWNER_SESSION_COOKIE}=${issueOwnerSession("test-password")}`;
  const signedIn = renderToStaticMarkup(await OwnerSignIn(props));
  expect(signedIn).toContain('action="/api/owner/logout"');
  expect(signedIn).not.toContain('type="password"');
});
