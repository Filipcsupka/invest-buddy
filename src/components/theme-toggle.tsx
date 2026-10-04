"use client";
import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "./icons";

type Theme = "light" | "dark";
const storageKey = "ib-theme";
const query = "(prefers-color-scheme: dark)";

function resolved(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia(query).matches ? "dark" : "light";
}

function subscribe(notify: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  window.addEventListener("ib-theme", notify);
  return () => {
    media.removeEventListener("change", notify);
    window.removeEventListener("ib-theme", notify);
  };
}

export function ThemeToggle({ toDark, toLight, generic }: { toDark: string; toLight: string; generic: string }) {
  const theme = useSyncExternalStore<Theme | null>(subscribe, resolved, () => null);
  const label = theme === null ? generic : theme === "dark" ? toLight : toDark;
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next: Theme = resolved() === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          /* storage blocked: the choice lasts for this page only */
        }
        window.dispatchEvent(new Event("ib-theme"));
      }}
    >
      <IconSun className="icon theme-icon-light" />
      <IconMoon className="icon theme-icon-dark" />
    </button>
  );
}

/** Runs before first paint so a stored choice never flashes the other theme. */
export const themeScript = `try{var t=localStorage.getItem("${storageKey}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
