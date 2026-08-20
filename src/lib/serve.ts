import "server-only";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { localPathFor } from "./storage";

/**
 * Handing a stored file back to the browser.
 *
 * Shared by the two routes that do it — `/api/files` for attachments, and `/api/watch`
 * for a protected video — so range handling is written once. Getting ranges right is
 * what makes a video seekable: without a 206 the browser re-downloads from the start
 * every time someone drags the scrubber, and resuming where they left off would too.
 */

/** Enough of a table to cover what a course actually holds. */
export function contentType(file: string) {
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return (
    {
      mp4: "video/mp4",
      m4v: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      mpeg: "video/mpeg",
      mpg: "video/mpeg",
      mkv: "video/x-matroska",
      avi: "video/x-msvideo",
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      zip: "application/zip",
      csv: "text/csv",
      txt: "text/plain",
    }[ext] ?? "application/octet-stream"
  );
}

/**
 * Streams a file off the local disk, honouring a Range request.
 *
 * `localPathFor` settles `..` before anything is opened — the path comes from a URL,
 * so escaping the upload directory is the attack this has to refuse.
 */
export async function serveLocalFile(
  segments: string[],
  request: Request,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const file = localPathFor(segments);
  if (!file) return new Response("Not found", { status: 404 });

  let size: number;
  try {
    const info = await stat(file);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = contentType(file);
  const range = request.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new Response("Range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      const stream = Readable.toWeb(
        createReadStream(file, { start, end }),
      ) as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": type,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
          ...extraHeaders,
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      ...extraHeaders,
    },
  });
}

/**
 * Streams a file that lives in blob storage back through this app.
 *
 * The response is piped rather than buffered, and the Range header is passed straight
 * through, so seeking works and a two-gigabyte lesson never has to fit in memory.
 */
export async function proxyRemoteFile(
  url: string,
  request: Request,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const range = request.headers.get("range");

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: range ? { Range: range } : undefined,
      // The stored object never changes — a new upload gets a new URL — so anything in
      // front of this app may keep it.
      cache: "no-store",
    });
  } catch {
    return new Response("Upstream unavailable", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  }

  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? contentType(url),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    ...extraHeaders,
  };
  const length = upstream.headers.get("content-length");
  if (length) headers["Content-Length"] = length;
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers["Content-Range"] = contentRange;

  return new Response(upstream.body, { status: upstream.status, headers });
}
