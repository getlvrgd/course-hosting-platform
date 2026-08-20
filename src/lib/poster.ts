import "server-only";

import { oembedEndpoint, posterFrom } from "./embed";

/**
 * The still for an embedded video, resolved once when the link is attached.
 *
 * Two steps, cheapest first: YouTube and Drive publish their thumbnails at an address
 * that can be constructed from the link, so those never touch the network. Loom, Vimeo
 * and Wistia have to be asked, which is what oEmbed is for.
 *
 * Resolved at save time rather than on every render, because a course page showing
 * twenty lessons would otherwise make twenty requests to three different companies
 * every time anybody opened it.
 *
 * Everything here fails to null rather than throwing. A lesson whose still could not be
 * fetched is a lesson with a ▶ in the outline, which is a perfectly good outcome —
 * losing the *video* because its thumbnail service was down would not be.
 */

/** Long enough for a slow answer, short enough that saving never feels stuck. */
const TIMEOUT_MS = 2500;

export async function resolvePoster(url: string): Promise<string | null> {
  const derived = posterFrom(url);
  if (derived) return derived;

  const endpoint = oembedEndpoint(url);
  if (!endpoint) return null;

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
      // The answer is stable for the life of the video, so let the platform keep it.
      cache: "force-cache",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { thumbnail_url?: unknown };
    const thumbnail = body.thumbnail_url;
    if (typeof thumbnail !== "string") return null;

    // It is going into an <img src>, so only ever an https address — a host answering
    // with something stranger is a host we do not use a picture from.
    return thumbnail.startsWith("https://") ? thumbnail : null;
  } catch {
    // Timed out, offline, rate-limited, or answered with something that is not JSON.
    return null;
  }
}
