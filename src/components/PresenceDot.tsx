"use client";

import { useEffect, useState } from "react";

import {
  HEARTBEAT_MS,
  PRESENCE_COLOR,
  PRESENCE_LABEL,
  PRESENCE_NOTE,
  presenceOf,
} from "@/lib/presence";

/**
 * The dot beside a name.
 *
 * A client component holding a ticking clock, because presence *decays*: someone shown
 * as online has to become idle and then offline on their own, without the page being
 * reloaded. It re-reads the same two stamps every few seconds and recomputes — so the
 * dot goes stale correctly even if the admin leaves this tab open all afternoon.
 *
 * What it cannot do is notice someone *arriving* — that needs new stamps from the
 * server, which is what the refresh on the students page is for. Decay here, arrival
 * there: between them the table stays honest without either doing much work.
 */
export function PresenceDot({
  lastSeenAt,
  lastActiveAt,
  /** A deactivated account is not "offline", it is shut. Presence does not apply. */
  disabled = false,
  showLabel = true,
}: {
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  // Starts at the moment of first render and moves on its own from there. Recomputed a
  // little more often than the heartbeat, so a transition is never more than a few
  // seconds late.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (disabled) return;
    const timer = setInterval(() => setNow(Date.now()), HEARTBEAT_MS / 3);
    return () => clearInterval(timer);
  }, [disabled]);

  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
        <span
          aria-hidden
          className="size-2 rounded-full border border-strong"
          style={{ background: "transparent" }}
        />
        {showLabel && "No access"}
      </span>
    );
  }

  const state = presenceOf(lastSeenAt, lastActiveAt, now);

  return (
    <span
      title={PRESENCE_NOTE[state]}
      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${
        state === "offline" ? "text-ink-muted" : "text-ink"
      }`}
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${state === "online" ? "presence-live" : ""}`}
        style={{ background: PRESENCE_COLOR[state] }}
      />
      <span className="sr-only">Presence: </span>
      {showLabel && PRESENCE_LABEL[state]}
    </span>
  );
}
