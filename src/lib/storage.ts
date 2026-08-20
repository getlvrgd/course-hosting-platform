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

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

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
