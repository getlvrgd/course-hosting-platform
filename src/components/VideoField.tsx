"use client";

import { useEffect, useState } from "react";

import { copyVideoFrom, listVideoSources, type LessonPatchInput } from "@/app/actions/courses";
import { formatDuration, posterOf, type LessonNode } from "@/lib/course";
import { EMBEDDABLE, toEmbed } from "@/lib/embed";
import { probeVideo, uploadFile } from "@/lib/upload-client";

import { BTN, BTN_PRIMARY, INPUT } from "./ui";

/**
 * The middle of a lesson: a video, or a PDF.
 *
 * Three ways in, and they are genuinely different things rather than three doors to
 * the same one:
 *
 *   * **Upload** puts the file in blob storage and plays it with the browser's own
 *     `<video>`. That is the only shape where the page can see the playhead, which is
 *     what lets a student's progress be counted automatically rather than claimed.
 *   * **Embed** takes a YouTube, Loom, Vimeo, Wistia or Drive link and plays it in
 *     their iframe. Nothing is copied, and nothing about the playhead is visible — so
 *     those lessons are completed by the button instead.
 *   * **Paste** points this lesson at a video another lesson already has. The same
 *     file, referenced twice, rather than the same bytes stored twice.
 *
 * A lesson only ever has one of them, and swapping is a matter of clearing what is
 * there — which is what the button under the player does.
 */

type Panel = "none" | "embed" | "paste";

export function VideoField({
  lesson,
  hubId,
  blob,
  onPatch,
}: {
  lesson: LessonNode;
  /** Scopes "paste from another lesson" to this offer. */
  hubId: string;
  blob: boolean;
  onPatch: (patch: LessonPatchInput, immediate?: boolean) => void;
}) {
  const [panel, setPanel] = useState<Panel>("none");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPdf = lesson.kind === "PDF";

  const take = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      // Look inside the file before it goes anywhere: its runtime, and a frame to use
      // as the still. Once uploaded, finding either out again would mean downloading
      // it back — and grabbing the frame here is why a video lesson needs no thumbnail
      // chosen by hand.
      const probe = isPdf ? null : await probeVideo(file);
      const stored = await uploadFile(file, {
        blob,
        onProgress: (fraction) => setProgress(fraction),
      });
      onPatch(
        {
          videoKind: "FILE",
          videoUrl: stored.url,
          videoName: stored.name,
          durationSeconds: probe?.seconds ?? null,
          // Empty when no frame could be drawn, which clears any still left behind by
          // whatever video was here before.
          posterUrl: probe?.poster ?? "",
        },
        true,
      );
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That upload failed.");
    } finally {
      setProgress(null);
    }
  };

  // The still goes with the video it was taken from. Leaving it would put the old
  // video's frame beside whatever is added next.
  const clear = () =>
    onPatch(
      {
        videoKind: "NONE",
        videoUrl: "",
        videoName: "",
        durationSeconds: null,
        posterUrl: "",
      },
      true,
    );

  /* ------------------------------------------------------------------ uploading -- */

  if (progress !== null) {
    return (
      <div className="rounded-2xl border border-subtle bg-surface p-6">
        <p className="text-center text-[13px] font-semibold text-ink">
          Uploading {isPdf ? "document" : "video"}…
        </p>
        <div className="mx-auto mt-3 h-2 max-w-md overflow-hidden rounded-full bg-page">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="tabular mt-2 text-center text-[12px] text-ink-muted">
          {Math.round(progress * 100)}% — leave this tab open until it finishes.
        </p>
      </div>
    );
  }

  /* --------------------------------------------------------------- with a video -- */

  if (lesson.videoKind !== "NONE" && lesson.videoUrl) {
    return (
      <div>
        <Preview lesson={lesson} />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[12px] text-ink-muted">
            {lesson.videoKind === "FILE"
              ? (lesson.videoName ?? "Uploaded file")
              : (toEmbed(lesson.videoUrl)?.provider ?? "Embedded")}
            {lesson.durationSeconds
              ? ` • ${formatDuration(lesson.durationSeconds)}`
              : ""}
          </p>

          <div className="flex items-center gap-2">
            {lesson.videoKind === "EMBED" && !isPdf && (
              <LengthField
                seconds={lesson.durationSeconds}
                onSave={(seconds) => onPatch({ durationSeconds: seconds }, true)}
              />
            )}
            <button
              type="button"
              onClick={clear}
              className="rounded-full border border-subtle px-3 py-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:border-critical hover:text-critical"
            >
              🗑 Delete {isPdf ? "document" : "video"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-1 text-[12px] text-critical">
            {error}
          </p>
        )}
      </div>
    );
  }

  /* ----------------------------------------------------------------- the picker -- */

  return (
    <div className="rounded-2xl border border-subtle bg-surface px-4 py-10">
      <p className="text-center text-[15px] font-bold text-ink">
        Add {isPdf ? "a PDF to this lesson" : "a video to this lesson"}
      </p>
      <p className="mt-1 text-center text-[12px] text-ink-muted">
        {isPdf
          ? "A .pdf file, or a link to one."
          : "Any file your browser can play — .mp4, .mov, .webm, .mpeg — or a link."}
      </p>

      <div className="mx-auto mt-4 max-w-md space-y-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-subtle bg-page px-3 py-2.5 text-left transition-colors hover:border-strong">
          <span aria-hidden className="mt-0.5 text-[13px]">
            ⬆
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-ink">
              Upload {isPdf ? "PDF" : "video"}
            </span>
            <span className="block text-[12px] text-ink-secondary">
              {isPdf ? "Bring your own .pdf" : "Bring your own .mov, .mp4, etc."}
            </span>
          </span>
          <input
            type="file"
            accept={isPdf ? "application/pdf,.pdf" : "video/*"}
            className="sr-only"
            onChange={(event) => {
              void take(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => setPanel(panel === "embed" ? "none" : "embed")}
          className="flex w-full items-start gap-3 rounded-xl border border-subtle bg-page px-3 py-2.5 text-left transition-colors hover:border-strong"
        >
          <span aria-hidden className="mt-0.5 text-[13px]">
            🔗
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-ink">
              {isPdf ? "Link a PDF" : "Embed video"}
            </span>
            <span className="block text-[12px] text-ink-secondary">
              {isPdf ? "Paste a link to a hosted PDF" : "Paste a YouTube or Loom link"}
            </span>
          </span>
        </button>

        {!isPdf && (
          <button
            type="button"
            onClick={() => setPanel(panel === "paste" ? "none" : "paste")}
            className="flex w-full items-start gap-3 rounded-xl border border-subtle bg-page px-3 py-2.5 text-left transition-colors hover:border-strong"
          >
            <span aria-hidden className="mt-0.5 text-[13px]">
              ⧉
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink">Paste video</span>
              <span className="block text-[12px] text-ink-secondary">
                Copy a video from another lesson
              </span>
            </span>
          </button>
        )}

        {panel === "embed" && (
          <EmbedPanel
            isPdf={isPdf}
            onCancel={() => setPanel("none")}
            onSave={(url) => {
              onPatch({ videoKind: "EMBED", videoUrl: url, videoName: "" }, true);
              setPanel("none");
            }}
          />
        )}

        {panel === "paste" && (
          <PastePanel
            lessonId={lesson.id}
            hubId={hubId}
            onCancel={() => setPanel("none")}
            onDone={() => setPanel("none")}
          />
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-center text-[12px] text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- preview -- */

/** What the lesson will look like to a student, minus the progress tracking. */
function Preview({ lesson }: { lesson: LessonNode }) {
  const url = lesson.videoUrl ?? "";

  if (lesson.kind === "PDF") {
    return (
      <object
        data={url}
        type="application/pdf"
        className="h-[520px] w-full rounded-2xl border border-subtle bg-page"
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

  if (lesson.videoKind === "FILE") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        poster={posterOf(lesson) ?? undefined}
        className="aspect-video w-full rounded-2xl border border-subtle bg-black"
      />
    );
  }

  const embed = toEmbed(url);
  if (!embed) {
    // A link this app cannot play in the page — most hosts refuse to be framed, and a
    // silent blank box is worse than a button that visibly works.
    return (
      <div className="rounded-2xl border border-subtle bg-surface p-6 text-center">
        <p className="text-[13px] font-semibold text-ink">
          This link can&apos;t be played in the page
        </p>
        <p className="mt-1 text-[12px] text-ink-secondary">
          Students will get a button that opens it. Embeddable hosts: {EMBEDDABLE}.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[12px] text-accent underline underline-offset-2"
        >
          {url}
        </a>
      </div>
    );
  }

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

/* ---------------------------------------------------------------------- panels -- */

function EmbedPanel({
  isPdf,
  onCancel,
  onSave,
}: {
  isPdf: boolean;
  onCancel: () => void;
  onSave: (url: string) => void;
}) {
  const [url, setUrl] = useState("");
  const embed = isPdf ? null : toEmbed(url);
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(url.trim());

  return (
    <div className="rounded-xl border border-accent-edge bg-accent-soft p-3">
      <label className="block text-[12px] font-semibold text-ink-secondary">
        {isPdf ? "Link to the PDF" : "Video link"}
      </label>
      <input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={isPdf ? "https://…/workbook.pdf" : "https://www.youtube.com/watch?v=…"}
        autoFocus
        className={`${INPUT} mt-1`}
      />
      <p className="mt-1 text-[12px] text-ink-secondary">
        {isPdf
          ? "Anything served over https that the browser can display."
          : embed
            ? `Plays in the page — ${embed.provider}.`
            : `Plays in the page for ${EMBEDDABLE}. Anything else becomes a button that opens it.`}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!looksLikeUrl}
          onClick={() => onSave(url.trim())}
          className={BTN_PRIMARY}
        >
          Use this link
        </button>
      </div>
    </div>
  );
}

/** Every lesson that already has a video, so one can be pointed at from here. */
function PastePanel({
  lessonId,
  hubId,
  onCancel,
  onDone,
}: {
  lessonId: string;
  hubId: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [sources, setSources] = useState<
    { id: string; title: string; course: string; chapter: string }[] | null
  >(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let live = true;
    void listVideoSources(hubId).then((rows) => {
      if (live) setSources(rows.filter((row) => row.id !== lessonId));
    });
    return () => {
      live = false;
    };
  }, [lessonId, hubId]);

  const needle = filter.trim().toLowerCase();
  const shown = (sources ?? []).filter(
    (row) =>
      !needle ||
      `${row.title} ${row.course} ${row.chapter}`.toLowerCase().includes(needle),
  );

  return (
    <div className="rounded-xl border border-accent-edge bg-accent-soft p-3">
      <input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Search lessons…"
        autoFocus
        className={INPUT}
      />

      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {sources === null && (
          <p className="px-1 py-2 text-[12px] text-ink-muted">Looking…</p>
        )}
        {sources !== null && shown.length === 0 && (
          <p className="px-1 py-2 text-[12px] text-ink-muted">
            No other lesson has a video yet.
          </p>
        )}
        {shown.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={async () => {
              await copyVideoFrom(lessonId, row.id);
              onDone();
            }}
            className="block w-full rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-left transition-colors hover:border-strong"
          >
            <span className="block truncate text-[13px] font-semibold text-ink">
              {row.title}
            </span>
            <span className="block truncate text-[11px] text-ink-muted">
              {row.course} · {row.chapter}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onCancel} className={BTN}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The runtime of an embedded video, typed in.
 *
 * An iframe will not tell this page how long the video is, and the runtime is what the
 * outline and the course tile add up into "1h 26m" — so for an embed it is asked for
 * rather than measured. Uploads never need this.
 */
function LengthField({
  seconds,
  onSave,
}: {
  seconds: number | null;
  onSave: (seconds: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(seconds ? Math.round(seconds / 60) : 0);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BTN}>
        {seconds ? "Change length" : "Set length"}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={1440}
        value={minutes}
        onChange={(event) => setMinutes(Math.max(0, Number(event.target.value) || 0))}
        aria-label="Length in minutes"
        autoFocus
        className="w-20 rounded-lg border border-subtle bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent"
      />
      <span className="text-[12px] text-ink-muted">min</span>
      <button
        type="button"
        onClick={() => {
          onSave(minutes > 0 ? minutes * 60 : null);
          setOpen(false);
        }}
        className={BTN_PRIMARY}
      >
        Set
      </button>
    </span>
  );
}
