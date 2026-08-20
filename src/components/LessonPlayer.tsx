"use client";

import { useEffect, useRef, useState } from "react";

import { recordWatched, setLessonComplete } from "@/app/actions/progress";
import { formatBytes, posterOf, type LessonNode } from "@/lib/course";
import { EMBEDDABLE, toEmbed } from "@/lib/embed";

import { DownloadMenu } from "./DownloadMenu";
import { FormattedBody } from "./RichText";
import { BTN, BTN_PRIMARY } from "./ui";

/**
 * A lesson, as a student watches it.
 *
 * Completion happens two ways, and which one a lesson gets is decided by where its
 * video lives rather than by a setting:
 *
 *   * An **uploaded** video is played by the browser's own `<video>`, so the page can
 *     see the playhead. It reports where they got to every fifteen seconds and the
 *     server decides — at 90% — that the lesson is done. Ninety rather than the very
 *     end, because credits, an outro and clicking away at the last sentence are all
 *     still "watched it".
 *   * An **embed** plays inside YouTube's or Loom's iframe, which will not tell this
 *     page anything about the playhead. Those lessons are ticked off by hand.
 *
 * The button is always there either way. Someone who watched a lesson on their phone
 * and came back to tick it should not have to sit through it again, and pretending the
 * automatic path is airtight would be the wrong kind of strict.
 */
export function LessonPlayer({
  lesson,
  complete,
  resumeAt,
  protect = false,
  askForCode = false,
}: {
  lesson: LessonNode;
  complete: boolean;
  /** Seconds to pick up from, for an uploaded video. */
  resumeAt: number;
  /** Uploads are being served through this app, with the save controls taken away. */
  protect?: boolean;
  /** The browser's save button is replaced by one that asks for a code. */
  askForCode?: boolean;
}) {
  const [done, setDone] = useState(complete);
  const [seen, setSeen] = useState(lesson.id);
  const [pending, setPending] = useState(false);

  // The prop is the truth after a navigation — moving to the next lesson and back must
  // not carry the previous lesson's tick across.
  if (seen !== lesson.id) {
    setSeen(lesson.id);
    setDone(complete);
  }

  const toggle = async () => {
    const next = !done;
    setDone(next);
    setPending(true);
    try {
      await setLessonComplete(lesson.id, next);
    } catch {
      setDone(!next); // Put it back rather than claim something that did not save.
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <Media
        lesson={lesson}
        resumeAt={resumeAt}
        protect={protect}
        askForCode={askForCode}
        onComplete={() => setDone(true)}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={pending}
          className={done ? BTN : BTN_PRIMARY}
        >
          {done ? "✓ Completed — undo" : "Mark as complete"}
        </button>
        {lesson.videoKind === "FILE" && !done && (
          <span className="text-[12px] text-ink-muted">
            Or just watch it — this ticks itself once you reach the end.
          </span>
        )}
      </div>

      {lesson.content && (
        <div className="mt-6 rounded-2xl border border-subtle bg-surface p-4 sm:p-5">
          <FormattedBody text={lesson.content} className="text-ink-secondary" />
        </div>
      )}

      {lesson.attachments.length > 0 && (
        <div className="mt-6">
          <h2 className="text-[14px]">Files</h2>
          <ul className="mt-2 space-y-1.5">
            {lesson.attachments.map((file) => (
              <li key={file.id}>
                <a
                  // Through this app, not at the storage URL — files are kept
                  // privately and that URL answers 403 to a browser.
                  href={`/api/attachment/${lesson.id}/${file.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-subtle bg-surface px-3 py-2 transition-colors hover:border-strong"
                >
                  <span aria-hidden className="text-[13px]">
                    ⬇
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                    {file.name}
                  </span>
                  <span className="tabular shrink-0 text-[12px] text-ink-muted">
                    {formatBytes(file.size)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- media -- */

/** How often the playhead is reported. Often enough to resume usefully, rare enough
 *  that an hour-long lesson is 240 writes rather than fourteen thousand. */
const HEARTBEAT_SECONDS = 15;

function Media({
  lesson,
  resumeAt,
  protect,
  askForCode,
  onComplete,
}: {
  lesson: LessonNode;
  resumeAt: number;
  protect: boolean;
  askForCode: boolean;
  onComplete: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    const element = video.current;
    if (!element || lesson.videoKind !== "FILE") return;

    // Picking up where they left off, but never at the very end — landing on the last
    // second of a finished lesson looks broken.
    const seekTo = resumeAt > 5 ? resumeAt : 0;
    const onLoaded = () => {
      if (seekTo > 0 && seekTo < element.duration - 10) element.currentTime = seekTo;
    };

    const report = async (force = false) => {
      const at = Math.floor(element.currentTime);
      if (!force && at - lastSent.current < HEARTBEAT_SECONDS) return;
      lastSent.current = at;
      const result = await recordWatched(
        lesson.id,
        at,
        Math.floor(element.duration || 0),
      ).catch(() => null);
      if (result?.complete) onComplete();
    };

    const onTime = () => void report();
    const onEnded = () => void report(true);
    // Leaving mid-lesson is the common case, so the last position is flushed on the
    // way out rather than only on the next heartbeat.
    const onLeave = () => void report(true);

    element.addEventListener("loadedmetadata", onLoaded);
    element.addEventListener("timeupdate", onTime);
    element.addEventListener("ended", onEnded);
    element.addEventListener("pause", onLeave);
    window.addEventListener("pagehide", onLeave);

    return () => {
      element.removeEventListener("loadedmetadata", onLoaded);
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("ended", onEnded);
      element.removeEventListener("pause", onLeave);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [lesson.id, lesson.videoKind, resumeAt, onComplete]);

  const url = lesson.videoUrl ?? "";

  if (lesson.kind === "PDF" && url) {
    return (
      <object
        data={url}
        type="application/pdf"
        className="h-[70vh] min-h-96 w-full rounded-2xl border border-subtle bg-page"
      >
        <div className="p-6 text-center text-[13px] text-ink-secondary">
          Your browser won&apos;t show this PDF inline.{" "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Open it in a new tab
          </a>
          .
        </div>
      </object>
    );
  }

  if (lesson.videoKind === "FILE" && url) {
    return (
      /* The menu sits on the video, where a player's own options belong. `relative`
         is on this wrapper rather than the <video>, which cannot contain anything. */
      <div className="relative">
        {askForCode && (
          <div className="absolute top-2 right-2 z-10">
            <DownloadMenu lessonId={lesson.id} filename={lesson.videoName} />
          </div>
        )}
        <video
        ref={video}
        src={url}
        controls
        preload="metadata"
        playsInline
        poster={posterOf(lesson) ?? undefined}
        // Takes the save button out of the browser's own player and stops the
        // right-click "Save video as". Both are conveniences being withdrawn rather
        // than locks — what actually protects the file is that `url` is a route on
        // this app that checks a session, not the storage address. See forPlayer.
        {...(protect
          ? {
              controlsList: "nodownload noplaybackrate noremoteplayback",
              disablePictureInPicture: true,
              onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
            }
          : {})}
          className="aspect-video w-full rounded-2xl border border-subtle bg-black"
        />
      </div>
    );
  }

  if (lesson.videoKind === "EMBED" && url) {
    const embed = toEmbed(url);
    if (embed) {
      return (
        <iframe
          src={embed.src}
          title={embed.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="aspect-video w-full rounded-2xl border border-subtle bg-black"
        />
      );
    }
    return (
      <div className="rounded-2xl border border-subtle bg-surface p-8 text-center">
        <p className="text-[14px] font-bold text-ink">This lesson opens elsewhere</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-ink-secondary">
          It is hosted somewhere that will not play inside this page. Embeddable hosts
          are {EMBEDDABLE}.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN_PRIMARY} mt-3`}
        >
          Open the video ↗
        </a>
      </div>
    );
  }

  return (
    <div className="grid aspect-video w-full place-items-center rounded-2xl border border-dashed border-subtle bg-surface">
      <p className="text-[13px] text-ink-muted">Nothing has been added here yet.</p>
    </div>
  );
}
