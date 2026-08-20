"use client";

import { useEffect } from "react";

import { subscribeTheme } from "./ThemeToggle";

/**
 * Keeps the browser tab's LVRGD mark on the right side of black-and-white.
 *
 * The `media` attributes in the root layout already answer this for anyone running on
 * their OS setting, and they do it before the first paint. What they cannot see is the
 * in-app theme toggle: someone on a light Mac who has switched this app to dark gets a
 * dark tab strip and, without this, a black mark on it that they cannot make out.
 *
 * So the static links carry the first paint and this takes over once React is running,
 * replacing them with a single link it owns outright — leaving them in place would mean
 * two competing rules for the same icon and a browser-dependent winner.
 */
export function FaviconSync() {
  useEffect(() => {
    const OWNED = "data-favicon-sync";

    const link = (() => {
      const existing = document.querySelector<HTMLLinkElement>(`link[${OWNED}]`);
      if (existing) return existing;

      // Drop the media-conditional pair; the apple-touch icon is a different rel and
      // is left alone.
      document
        .querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
        .forEach((el) => el.remove());

      const created = document.createElement("link");
      created.rel = "icon";
      created.type = "image/png";
      created.setAttribute(OWNED, "");
      document.head.appendChild(created);
      return created;
    })();

    const dark = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      // The toggle stamps data-theme when the reader has overridden the OS; with no
      // attribute the OS setting is the answer. Same precedence as globals.css.
      const override = document.documentElement.getAttribute("data-theme");
      const isDark = override ? override === "dark" : dark.matches;
      // A dark tab strip needs the white mark, and vice versa.
      const next = isDark ? "/icon-dark.png" : "/icon-light.png";
      if (!link.href.endsWith(next)) link.href = next;
    };

    apply();
    const unsubscribe = subscribeTheme(apply);
    dark.addEventListener("change", apply);

    return () => {
      unsubscribe();
      dark.removeEventListener("change", apply);
    };
  }, []);

  return null;
}
