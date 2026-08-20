"use client";

import { useCallback, useSyncExternalStore } from "react";

export const THEME_KEY = "sd:theme";
export type Theme = "system" | "light" | "dark";

/**
 * Light / dark / follow-the-system.
 *
 * "System" is a real third state, not a synonym for light: someone whose Mac switches
 * to dark at sunset should get that here too unless they have said otherwise. Choosing
 * light or dark stamps `data-theme` on <html>, which every token in globals.css is
 * written to obey ahead of the media query.
 *
 * The stored choice is applied before first paint by an inline script in the root
 * layout — see THEME_SCRIPT. Without it a dark-mode user would see a white flash on
 * every navigation, because the server has no way to know their preference.
 */
export function ThemeToggle() {
  // The stored preference is external state, so it is subscribed to rather than
  // copied into an effect. The server snapshot is "system", which is what the button
  // hydrates against before the real value swaps in.
  const raw = useSyncExternalStore(
    subscribe,
    useCallback(() => {
      try {
        return localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    }, []),
    () => null,
  );
  const theme: Theme = raw === "light" || raw === "dark" ? raw : "system";

  const apply = (next: Theme) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private browsing can refuse storage; the toggle still works for this page.
    }
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    notify();
  };

  const order: Theme[] = ["system", "light", "dark"];
  const next = order[(order.indexOf(theme) + 1) % order.length];

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      title={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
      className="grid size-7 place-items-center rounded-lg border border-subtle text-ink-secondary transition-colors hover:border-strong hover:text-ink"
    >
      <Icon theme={theme} />
    </button>
  );
}

const LABEL: Record<Theme, string> = {
  system: "system",
  light: "light",
  dark: "dark",
};

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Notified whenever the stored preference changes, in this tab or another. Exported so
 * anything outside the button that has to follow the theme — the tab icon, for one —
 * hears about a change at the same moment the page does.
 */
export function subscribeTheme(onChange: () => void) {
  return subscribe(onChange);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // "storage" fires for other tabs; local writes call notify() themselves.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function Icon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 fill-current">
        <circle cx="8" cy="8" r="3.2" />
        <path d="M8 .8v2.1M8 13.1v2.1M.8 8h2.1M13.1 8h2.1M2.9 2.9l1.5 1.5M11.6 11.6l1.5 1.5M13.1 2.9l-1.5 1.5M4.4 11.6l-1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 fill-current">
        <path d="M13.5 10.4A5.8 5.8 0 0 1 5.6 2.5a5.9 5.9 0 1 0 7.9 7.9z" />
      </svg>
    );
  }
  // System: half-filled circle, the conventional "auto" mark.
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" />
    </svg>
  );
}

/**
 * Runs before the browser paints anything, so the saved theme is already on <html>
 * when the first pixels land. Inlined in <head>; kept tiny and wrapped in try/catch
 * because it executes before React and before any error boundary exists.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;
