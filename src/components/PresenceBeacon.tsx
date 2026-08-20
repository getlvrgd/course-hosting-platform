"use client";

import { useEffect } from "react";

import { HEARTBEAT_MS, IDLE_AFTER_MS } from "@/lib/presence";

/**
 * Tells the server this page is open, and whether anyone is using it.
 *
 * Mounted once in the nav, so it runs on every signed-in page and nowhere else.
 *
 * What counts as *using it*: a pointer, a key, a scroll or a wheel in the last few
 * minutes, with the tab in the foreground. A backgrounded tab is reported as idle even
 * if they were typing a second before switching away — the page is still open, which
 * is the distinction being drawn, and "online" should mean someone is actually looking.
 *
 * Nothing is sent on the way out. A browser tearing a page down is the least reliable
 * moment to ask it to make a request, and offline already falls out of the heartbeats
 * simply stopping — see src/lib/presence.ts.
 */
export function PresenceBeacon() {
  useEffect(() => {
    let lastTouch = Date.now();
    let stopped = false;

    const touched = () => {
      lastTouch = Date.now();
    };

    const send = () => {
      if (stopped) return;
      const active = !document.hidden && Date.now() - lastTouch < IDLE_AFTER_MS;
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
        // The heartbeat must never hold up a navigation the person actually wants.
        keepalive: true,
      }).catch(() => {
        // Offline, asleep, or the server restarting. The next beat sorts it out.
      });
    };

    // Coming back to the tab is itself activity, and worth reporting straight away
    // rather than up to half a minute later.
    const onVisible = () => {
      if (!document.hidden) {
        touched();
        send();
      }
    };

    const events = ["pointerdown", "keydown", "wheel", "scroll"] as const;
    for (const event of events) {
      document.addEventListener(event, touched, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisible);

    send();
    const timer = setInterval(send, HEARTBEAT_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
      for (const event of events) document.removeEventListener(event, touched);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
