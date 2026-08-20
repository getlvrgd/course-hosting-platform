"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-reads the page from the server on a timer, so presence dots pick up people
 * arriving rather than only decaying.
 *
 * Paused while the tab is in the background — an admin with this open behind their
 * work should not be generating a query every twenty seconds all day — and it fires
 * once on the way back so returning to the tab shows the present, not whenever they
 * left it.
 *
 * `router.refresh` re-renders the server components in place; it does not remount the
 * page, so an open `⋯` menu or a half-typed field survives it.
 */
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), everyMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        router.refresh();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, everyMs]);

  return null;
}
