import "server-only";

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { get } from "@vercel/blob";

import { isBlobUrl, localPathFor } from "./storage";

/**
 * How much of an open-ended range to actually answer with.
 *
 * A browser opens a video with `Range: bytes=0-` — "everything from here" — and taking
 * that literally means streaming a whole lesson through one function call. On a
 * serverless host that call is killed long before a 300MB video finishes, so the
 * player sits there and never starts.
 *
 * HTTP allows a server to return *less* than was asked for, which is what every decent
 * video server does: answer a bounded chunk, let the browser come back for the next.
 * Every request then stays short, whatever the size of the file.
 *
 * Four megabytes is a few seconds of video — enough that a player is not making
 * constant requests, small enough to be well inside any timeout.
 */
const CHUNK_BYTES = 4 * 1024 * 1024;

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
      // An open-ended range is answered a chunk at a time — see CHUNK_BYTES.
      const end = match[2]
        ? Math.min(Number(match[2]), size - 1)
        : Math.min(start + CHUNK_BYTES - 1, size - 1);
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
 * Blobs here are **private** — fetching one's URL without credentials answers 403 — so
 * they are read with the SDK, which authenticates, rather than with a plain fetch. The
 * Range header is passed along so a student can drag the scrubber of an hour-long
 * lesson without re-downloading it, and the body is piped rather than buffered so a
 * two-gigabyte video never has to fit in memory.
 *
 * Anything that is not one of ours — a link somebody pasted — is fetched plainly.
 */
export async function proxyRemoteFile(
  url: string,
  request: Request,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const range = request.headers.get("range");

  if (isBlobUrl(url)) {
    try {
      // The same bounding as the local path: an open-ended range is rewritten into a
      // chunk before it is asked for, so one request never tries to move a whole
      // lesson through a function that will be killed part way.
      const bounded = (() => {
        if (!range) return undefined;
        const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (!match || match[2]) return range;
        const start = match[1] ? Number(match[1]) : 0;
        return `bytes=${start}-${start + CHUNK_BYTES - 1}`;
      })();

      const result = await get(url, {
        access: "private",
        ...(bounded ? { headers: { Range: bounded } } : {}),
      });
      if (!result || !result.stream) {
        return new Response("Not found", { status: 404 });
      }

      const from = result.headers;
      const headers: Record<string, string> = {
        "Content-Type": from?.get("content-type") ?? contentType(url),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        ...extraHeaders,
      };
      const length = from?.get("content-length");
      if (length) headers["Content-Length"] = length;
      // Present only when the range was honoured, which is what makes this a 206.
      const contentRange = from?.get("content-range");
      if (contentRange) headers["Content-Range"] = contentRange;

      return new Response(result.stream, {
        status: contentRange ? 206 : 200,
        headers,
      });
    } catch (error) {
      console.error("[serve] could not read a private blob:", error);
      return new Response("Upstream unavailable", { status: 502 });
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: range ? { Range: range } : undefined,
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
