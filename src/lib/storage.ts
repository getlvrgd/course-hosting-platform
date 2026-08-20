import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { UPLOAD_PREFIX, type StoredFile } from "./storage-shared";

/**
 * Where an uploaded video or attachment actually goes.
 *
 * Two backends, chosen by whether a blob token is configured:
 *
 *   * **Vercel Blob**, in production. The browser uploads straight to it and only the
 *     signed token passes through this app — which is the whole point, because a
 *     serverless function caps a request body at a few megabytes and a lesson video is
 *     hundreds. See src/app/api/upload/route.ts.
 *
 *   * **The local disk**, when no token is set. The file is posted to this app, written
 *     under `.uploads/`, and served back by src/app/api/files/[...path]/route.ts. Fine
 *     for building courses on a laptop; useless on a host with a read-only filesystem,
 *     which is exactly why the token decides rather than NODE_ENV.
 *
 * Either way the lesson row only ever stores a URL, so a course built locally and one
 * built in production are the same shape and neither needs migrating.
 */

export { UPLOAD_PREFIX, type StoredFile };

/**
 * Whether an upload from the browser can actually happen.
 *
 * Specifically a **read-write token**, not merely "a blob store exists". The SDK
 * authenticates two ways — a long-lived `BLOB_READ_WRITE_TOKEN`, or OIDC using
 * `BLOB_STORE_ID` with a short-lived token the platform injects — but the client
 * upload flow is not one of the two. `handleUpload` resolves a read-write token as its
 * very first act and throws without one, whatever else is configured.
 *
 * So a store connected the newer way, publishing `BLOB_STORE_ID` and
 * `BLOB_WEBHOOK_PUBLIC_KEY` and no token, is a store this app cannot upload to. Saying
 * "configured" because *something* blob-shaped is present would put an Upload button
 * on screen that fails at the moment somebody picks a file — which is the failure this
 * check exists to prevent.
 */
export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/**
 * Whether this deployment can accept an upload at all.
 *
 * With blob storage, always — the browser sends the file straight there and this app
 * only hands out a token. Without it, only where there is a disk that survives the
 * request: a laptop, or a host with a volume mounted at `UPLOAD_DIR`.
 *
 * A serverless host has neither. Worse, its request bodies are capped at a few
 * megabytes, so a video posted to this app is refused by the platform before any code
 * here runs — which is why the editor asks this question up front and says so, rather
 * than offering an Upload button that fails on a file the size of a lesson.
 */
export const uploadsPossible = () =>
  blobConfigured() || Boolean(process.env.UPLOAD_DIR) || !process.env.VERCEL;

/** Refused before anything is written. Generous, because these are lesson videos. */
export const MAX_UPLOAD_BYTES = 2_000_000_000;

/**
 * The types an upload may be.
 *
 * Video is deliberately broad — `video/*` — because "every format" is the ask, and
 * what a browser can actually play is a question for the player, not the uploader: a
 * .mov that Safari plays and Chrome does not is still worth storing and still worth
 * offering as a download.
 */
/**
 * Is this URL a file in our blob store?
 *
 * Everything uploaded there is **private**: the store refuses public blobs outright,
 * and fetching a private blob's URL without credentials answers 403. So a blob URL is
 * never something to put in an `<img>` or a `<video>` — it has to be read with the SDK
 * and streamed back by this app, which is what src/lib/serve.ts does.
 *
 * That is a better arrangement than it sounds. It is the leak the download settings
 * could only ever paper over: a public blob URL, once copied, works for anyone in the
 * world forever. A private one is worthless without a session here.
 */
export const isBlobUrl = (url: string) =>
  /^https:\/\/[^/]*\.(public\.)?blob\.vercel-storage\.com\//.test(url) ||
  /^https:\/\/[^/]*\.blob\.vercel-storage\.com\//.test(url);

export const ATTACHMENT_ACCEPT =
  "application/pdf,image/*,video/*,audio/*,text/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv";

export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/mpeg,video/webm,video/*";

/**
 * Where the local fallback writes.
 *
 * Resolved when it is asked for rather than at import time. At module scope the
 * bundler reads `process.cwd()` as "this module touches arbitrary paths" and traces
 * the entire project into the deployed bundle — the `turbopackIgnore` marker says the
 * path is deliberate and is not a hint to go looking.
 */
const localDir = () =>
  process.env.UPLOAD_DIR ??
  path.join(/* turbopackIgnore: true */ process.cwd(), ".uploads");

/**
 * A filename that is safe on disk and in a URL, with a random stem so two people
 * uploading `final.mp4` on the same afternoon do not overwrite each other.
 */
export function safeName(original: string) {
  const base = original
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80);
  const stem = crypto.randomUUID().slice(0, 8);
  return `${stem}-${base || "file"}`;
}

/** Writes a posted file to the local `.uploads` directory. The dev-only path. */
export async function putLocal(file: File): Promise<StoredFile> {
  const name = safeName(file.name);
  const dir = path.join(/* turbopackIgnore: true */ localDir(), UPLOAD_PREFIX);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, name),
    Buffer.from(await file.arrayBuffer()),
  );
  return {
    url: `/api/files/${UPLOAD_PREFIX}/${name}`,
    name: file.name,
    size: file.size,
    type: file.type,
  };
}

/**
 * Resolves a stored path back to a file on disk, refusing anything that tries to climb
 * out of the upload directory. `..` in a URL segment is the whole reason this exists.
 */
export function localPathFor(segments: string[]): string | null {
  const root = path.resolve(/* turbopackIgnore: true */ localDir());
  const joined = path.join(/* turbopackIgnore: true */ root, ...segments);
  const resolved = path.resolve(joined);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
