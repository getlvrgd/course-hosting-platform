"use client";

import { upload } from "@vercel/blob/client";

import { UPLOAD_PREFIX, type StoredFile } from "./storage-shared";

/**
 * Getting a file from the desktop into storage, from the browser.
 *
 * Two paths, and the caller does not have to care which: with blob storage configured
 * the file goes **straight there** and never touches this app, which is the only way a
 * multi-gigabyte lesson video works at all. Without it, the file is posted to
 * `/api/upload/local` and written to disk for local work.
 *
 * `onProgress` is a fraction, 0–1. The local path can only report 0 and 1 — it is a
 * single fetch with no upload events — which is honest enough for a laptop.
 */
export async function uploadFile(
  file: File,
  options: { blob: boolean; onProgress?: (fraction: number) => void },
): Promise<StoredFile> {
  if (options.blob) {
    const result = await upload(`${UPLOAD_PREFIX}/${file.name}`, file, {
      // Private, always. The store refuses public blobs, and a private one is
      // worthless to anyone without a session here — which is the point. Everything
      // uploaded is served back through /api/watch and /api/attachment.
      access: "private",
      handleUploadUrl: "/api/upload",
      onUploadProgress: ({ percentage }) => options.onProgress?.(percentage / 100),
    });
    return {
      url: result.url,
      name: file.name,
      size: file.size,
      type: file.type,
    };
  }

  options.onProgress?.(0);
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/upload/local", { method: "POST", body: form });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (body?.error) throw new Error(body.error);

    /*
     * No JSON back means this never reached the app. A serverless platform caps the
     * body of a request to a function at a few megabytes and rejects anything larger
     * itself, with its own error page — so a video fails here every time while a
     * small attachment goes through, which is a baffling thing to be told "didn't go
     * through" about.
     */
    if (response.status === 413) {
      throw new Error(
        "This deployment can't accept a file that size. Add Blob storage and uploads go straight there instead, with no limit worth worrying about.",
      );
    }
    throw new Error(
      `That upload didn't go through (${response.status}). If this is a large file, the deployment needs Blob storage.`,
    );
  }
  options.onProgress?.(1);
  return (await response.json()) as StoredFile;
}

/** How wide the grabbed still is stored. A thumbnail is never shown larger than this. */
const POSTER_WIDTH = 480;
const POSTER_QUALITY = 0.72;

export type VideoProbe = {
  /** Runtime in seconds, or null for a format the browser cannot decode. */
  seconds: number | null;
  /** A still from the video as a data URL, or null if no frame could be drawn. */
  poster: string | null;
};

/**
 * Looks inside a video before it is uploaded: how long it runs, and what it looks like.
 *
 * Both come from the same `<video>` element and the file already sitting in memory, so
 * this costs one decode and no network. Doing it *before* the upload is the whole
 * point — once the file is in blob storage, finding either of these out again would
 * mean downloading it back.
 *
 * Everything resolves rather than rejects. A format the browser cannot decode — a .mkv,
 * say — still uploads and still plays wherever it can; it just arrives without a length
 * or a still, and the outline shows a ▶ instead.
 */
export function probeVideo(file: File): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    // Required by Safari before it will decode frames from a file it is not playing.
    video.playsInline = true;

    let settled = false;
    const done = (probe: VideoProbe) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(probe);
    };

    let seconds: number | null = null;

    // A frame that is decoded but never drawn is a black rectangle; a browser that
    // stalls on the seek would otherwise hang the upload behind it forever.
    const giveUp = setTimeout(() => done({ seconds, poster: null }), 8000);

    video.onerror = () => {
      clearTimeout(giveUp);
      done({ seconds: null, poster: null });
    };

    video.onloadedmetadata = () => {
      seconds = Number.isFinite(video.duration) ? Math.round(video.duration) : null;

      // A tenth of the way in, capped either side. The opening second of a video is
      // very often black or a fade, and a black thumbnail is worse than none; twenty
      // seconds in is far enough that a long intro is past and near enough that it is
      // still recognisably the start of this video.
      const target = Math.min(Math.max((video.duration || 0) * 0.1, 1), 20);
      video.currentTime = Number.isFinite(target) ? target : 0;
    };

    video.onseeked = () => {
      clearTimeout(giveUp);
      try {
        const scale = Math.min(1, POSTER_WIDTH / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

        const context = canvas.getContext("2d");
        if (!context) return done({ seconds, poster: null });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // JPEG rather than PNG: a frame of video is a photograph, and PNG of one is
        // several times the size for no visible gain at thumbnail scale.
        done({ seconds, poster: canvas.toDataURL("image/jpeg", POSTER_QUALITY) });
      } catch {
        // A frame the canvas refused to read. The length is still worth keeping.
        done({ seconds, poster: null });
      }
    };

    video.src = url;
  });
}
