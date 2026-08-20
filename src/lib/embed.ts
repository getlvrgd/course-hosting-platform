/**
 * Turns a share URL into something that can be played in the page.
 *
 * Only known video hosts are embedded. Anything else gets a link card instead —
 * most sites send `X-Frame-Options: DENY`, so a generic iframe would render as a
 * silent blank box, and a button that visibly works beats an embed that quietly
 * doesn't.
 */

export type Embed = { src: string; provider: string; title: string };

const clean = (url: string) => url.trim();

export function toEmbed(raw: string | undefined | null): Embed | null {
  const url = clean(raw ?? "");
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const host = parsed.hostname.replace(/^www\./, "");
  const path = parsed.pathname;

  // Loom — /share/<id>, already-embed /embed/<id>
  if (host === "loom.com" || host.endsWith(".loom.com")) {
    const id = path.match(/\/(?:share|embed)\/([0-9a-zA-Z]+)/)?.[1];
    if (id) {
      return {
        src: `https://www.loom.com/embed/${id}`,
        provider: "Loom",
        title: "Loom video",
      };
    }
  }

  // YouTube — watch?v=, youtu.be/<id>, /embed/<id>, /shorts/<id>
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id =
      parsed.searchParams.get("v") ??
      path.match(/\/(?:embed|shorts|live)\/([\w-]+)/)?.[1];
    if (id) {
      const start = parsed.searchParams.get("t") ?? parsed.searchParams.get("start");
      const suffix = start ? `?start=${parseInt(start, 10) || 0}` : "";
      return {
        src: `https://www.youtube-nocookie.com/embed/${id}${suffix}`,
        provider: "YouTube",
        title: "YouTube video",
      };
    }
  }
  if (host === "youtu.be") {
    const id = path.slice(1);
    if (id) {
      return {
        src: `https://www.youtube-nocookie.com/embed/${id}`,
        provider: "YouTube",
        title: "YouTube video",
      };
    }
  }

  // Vimeo — /<id>, player.vimeo.com/video/<id>
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = path.match(/\/(?:video\/)?(\d+)/)?.[1];
    if (id) {
      return {
        src: `https://player.vimeo.com/video/${id}`,
        provider: "Vimeo",
        title: "Vimeo video",
      };
    }
  }

  // Google Drive — /file/d/<id>/view
  if (host === "drive.google.com") {
    const id = path.match(/\/file\/d\/([\w-]+)/)?.[1];
    if (id) {
      return {
        src: `https://drive.google.com/file/d/${id}/preview`,
        provider: "Google Drive",
        title: "Video",
      };
    }
  }

  // Wistia
  if (host === "wistia.com" || host.endsWith(".wistia.com") || host === "wistia.net" || host.endsWith(".wistia.net")) {
    const id = path.match(/\/medias\/([\w]+)/)?.[1];
    if (id) {
      return {
        src: `https://fast.wistia.net/embed/iframe/${id}`,
        provider: "Wistia",
        title: "Wistia video",
      };
    }
  }

  return null;
}

/** The hosts the editor can promise will actually play in the page. */
export const EMBEDDABLE = "Loom, YouTube, Vimeo, Wistia or Google Drive";


/* ---------------------------------------------------------------------- posters -- */

/**
 * A still for an embedded video, worked out from the link alone.
 *
 * Two hosts publish their thumbnails at an address you can construct, so for those the
 * answer needs no network call at all and cannot go out of date. Everything else
 * returns null and is asked over oEmbed instead — see src/lib/poster.ts, which is
 * server-only because it makes that request.
 */
export function posterFrom(raw: string | undefined | null): string | null {
  const url = clean(raw ?? "");
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const path = parsed.pathname;

  // YouTube — hqdefault exists for every video ever uploaded. maxresdefault does not
  // (it is only generated above a certain source resolution) and 404s when it doesn't,
  // which would leave a broken image in the outline rather than a still.
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const id =
      parsed.searchParams.get("v") ??
      path.match(/\/(?:embed|shorts|live)\/([\w-]+)/)?.[1];
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  if (host === "youtu.be") {
    const id = path.slice(1);
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  // Google Drive renders one on demand for anything it can preview.
  if (host === "drive.google.com") {
    const id = path.match(/\/file\/d\/([\w-]+)/)?.[1];
    if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w640`;
  }

  return null;
}

/**
 * The oEmbed endpoint for the hosts whose thumbnail cannot be guessed from the link.
 *
 * All three answer with a `thumbnail_url`, which is the only field wanted from them.
 */
export function oembedEndpoint(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(clean(raw));
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  const target = encodeURIComponent(parsed.toString());

  if (host === "loom.com" || host.endsWith(".loom.com")) {
    return `https://www.loom.com/v1/oembed?url=${target}`;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    return `https://vimeo.com/api/oembed.json?url=${target}`;
  }
  if (
    host === "wistia.com" ||
    host.endsWith(".wistia.com") ||
    host === "wistia.net" ||
    host.endsWith(".wistia.net")
  ) {
    return `https://fast.wistia.com/oembed?url=${target}`;
  }
  return null;
}
