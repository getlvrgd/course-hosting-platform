/**
 * Who is here right now.
 *
 * Three states, derived from two timestamps rather than stored as a status anyone has
 * to remember to clear:
 *
 *   * **Online** — a heartbeat landed in the last minute or so, and they were
 *     interacting with the page when it did.
 *   * **Idle** — heartbeats are still arriving, so the page is open, but nothing has
 *     been touched for a while. A backgrounded tab counts as idle too: the page is
 *     still open, they are just not looking at it.
 *   * **Offline** — the heartbeats stopped.
 *
 * Deriving it means a closed laptop, a crashed tab and a lost connection all resolve
 * to offline on their own. A stored "is_online" flag would need something to come
 * along and turn it off, and that something never runs at the moment it matters.
 *
 * The cost is a lag: closing a tab reads as offline about a minute later, not
 * instantly. That is the honest trade — the alternative is trusting a farewell message
 * from a page that is being torn down, which is exactly when a browser is least likely
 * to send one.
 */

/** How often a page reports in. */
export const HEARTBEAT_MS = 30_000;

/** Two missed heartbeats and a little grace, so one slow request is not "left". */
export const OFFLINE_AFTER_MS = 75_000;

/** Untouched for this long, with the page still open, reads as idle. */
export const IDLE_AFTER_MS = 5 * 60_000;

export type Presence = "online" | "idle" | "offline";

/**
 * The state, worked out from the two stamps and one clock read.
 *
 * `now` is passed in rather than read here so a whole table is measured against one
 * instant, and so the same function can run on the server for the first paint and in
 * the browser as the seconds tick past — see PresenceDot.
 */
export function presenceOf(
  lastSeenAt: Date | string | null,
  lastActiveAt: Date | string | null,
  now: number,
): Presence {
  if (!lastSeenAt) return "offline";
  const seen = typeof lastSeenAt === "string" ? new Date(lastSeenAt) : lastSeenAt;
  if (now - seen.getTime() > OFFLINE_AFTER_MS) return "offline";

  if (!lastActiveAt) return "idle";
  const active =
    typeof lastActiveAt === "string" ? new Date(lastActiveAt) : lastActiveAt;
  return now - active.getTime() > IDLE_AFTER_MS ? "idle" : "online";
}

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: "Online",
  idle: "Idle",
  offline: "Offline",
};

/**
 * The dot's colour. Grey for offline is deliberate: it is the absence of a state, and
 * a red dot would read as something being wrong rather than someone being out.
 */
export const PRESENCE_COLOR: Record<Presence, string> = {
  online: "var(--status-good)",
  idle: "var(--series-4)",
  offline: "var(--text-muted)",
};

export const PRESENCE_NOTE: Record<Presence, string> = {
  online: "On a page and using it",
  idle: "Page still open, nothing touched for a few minutes",
  offline: "Not here",
};
