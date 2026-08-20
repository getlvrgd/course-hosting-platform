"use client";

import { useState } from "react";

import type { LessonPatchInput } from "@/app/actions/courses";
import {
  dripLabel,
  formatBytes,
  LESSON_KIND_OPTIONS,
  type Attachment,
  type LessonKind,
  type LessonNode,
} from "@/lib/course";
import { uploadFile } from "@/lib/upload-client";

import { copyLink } from "./CourseEditor";
import { ImageDrop } from "./ImageDrop";
import { RichTextArea } from "./RichText";
import { VideoField } from "./VideoField";
import { BTN, BTN_DANGER, LABEL } from "./ui";

/**
 * One lesson, open for editing.
 *
 * Everything here saves itself. There is no save button because there is no moment
 * when a lesson is "submitted" — you paste a video, write two sentences, come back
 * tomorrow and add a file. The indicator in the corner is the whole feedback: it says
 * Saving while a write is in flight and Saved when it landed.
 *
 * Nothing on this pane owns state of its own except the transient bits — an upload's
 * progress, which panel is open. The lesson itself lives in the editor above, so the
 * outline's title and this title are the same string rather than two copies drifting.
 */
export function LessonPane({
  lesson,
  chapterIndex,
  basePath,
  hubId,
  blob,
  canUpload,
  saveState,
  onPatch,
  onFlush,
  onDelete,
}: {
  lesson: LessonNode;
  chapterIndex: number;
  basePath: string;
  hubId: string;
  blob: boolean;
  canUpload: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  onPatch: (lessonId: string, patch: LessonPatchInput, immediate?: boolean) => void;
  onFlush: () => Promise<void>;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [drip, setDrip] = useState(false);

  const patch = (next: LessonPatchInput, immediate = false) =>
    onPatch(lesson.id, next, immediate);

  return (
    <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-widest text-ink-muted uppercase">
              Chapter {chapterIndex}
            </p>
            <input
              value={lesson.title}
              onChange={(event) => patch({ title: event.target.value })}
              onBlur={() => void onFlush()}
              aria-label="Lesson title"
              placeholder="Untitled lesson"
              className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-[26px] font-extrabold tracking-[-0.08em] outline-none hover:border-subtle focus:border-accent focus:bg-surface"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-5">
            <SaveMark state={saveState} />
            <button
              type="button"
              onClick={async () => {
                setCopied(await copyLink(`${basePath}/${lesson.id}`));
                setTimeout(() => setCopied(false), 1800);
              }}
              className={BTN}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <VideoField
            lesson={lesson}
            hubId={hubId}
            blob={blob}
            canUpload={canUpload}
            onPatch={patch}
          />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <span className={LABEL}>Lesson thumbnail</span>
            <Thumbnail lesson={lesson} onPatch={patch} />
          </div>

          <div>
            <span className={LABEL}>Lesson type</span>
            <p className="mt-0.5 mb-2 text-[12px] text-ink-muted">
              What the middle of this lesson is.
            </p>
            <div className="flex flex-wrap gap-2">
              {LESSON_KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => patch({ kind: option.value as LessonKind }, true)}
                  aria-pressed={lesson.kind === option.value}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    lesson.kind === option.value
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-subtle text-ink-secondary hover:border-strong hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <span className={LABEL}>File attachments</span>
          <Attachments
            lesson={lesson}
            blob={blob}
            canUpload={canUpload}
            onChange={(attachments) => patch({ attachments }, true)}
          />
        </div>

        <div className="mt-6">
          <span className={LABEL}>Drip feeding settings</span>
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setDrip((was) => !was)}
              aria-expanded={drip}
              className={BTN}
            >
              <span aria-hidden>🔒</span>
              {dripLabel(lesson.dripDays)}
            </button>

            {drip && (
              <div className="mt-2 max-w-md rounded-xl border border-subtle bg-surface p-3">
                <p className="text-[12px] text-ink-secondary">
                  Counted from the day each student&apos;s account was created, so
                  someone joining in March gets the same run-up as someone who joined in
                  January. You and your admins are never held back by it.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={3650}
                    value={lesson.dripDays}
                    onChange={(event) =>
                      patch(
                        { dripDays: Math.max(0, Number(event.target.value) || 0) },
                        true,
                      )
                    }
                    aria-label="Days before this unlocks"
                    className="w-24 rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
                  />
                  <span className="text-[13px] text-ink-secondary">
                    days after joining — 0 unlocks it immediately
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <span className={LABEL}>Content</span>
          <p className="mt-0.5 mb-1.5 text-[12px] text-ink-muted">
            What this lesson covers. ⌘B, ⌘I, ⌘U and ⌘K work here.
          </p>
          <RichTextArea
            value={lesson.content ?? ""}
            onChange={(value) => patch({ content: value })}
            rows={8}
            placeholder="What this lesson covers…"
          />
        </div>

        <div className="mt-8 border-t border-subtle pt-4">
          <button type="button" onClick={onDelete} className={BTN_DANGER}>
            Delete this lesson
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the thumbnail -- */

/**
 * The picture for this lesson — which, for anything with a video, is already sorted.
 *
 * A video lesson takes its still from the video itself: grabbed from the file as it
 * was uploaded, or fetched from YouTube or Loom when the link was pasted. So this is
 * normally not a control at all, just a note saying where the picture came from.
 *
 * The override is folded away behind it rather than left out. Occasionally the frame
 * that got grabbed is a bad one, and "you cannot change it" would be its own kind of
 * broken — but it is not the thing anyone should meet first, because the whole point
 * is that forty lessons do not need forty thumbnails found for them.
 */
function Thumbnail({
  lesson,
  onPatch,
}: {
  lesson: LessonNode;
  onPatch: (patch: LessonPatchInput, immediate?: boolean) => void;
}) {
  const [override, setOverride] = useState(false);
  const auto = lesson.posterUrl;
  const chosen = lesson.thumbnailUrl;

  // No video to take a still from — a PDF, or a lesson still being written. Here the
  // picture genuinely has to be chosen, so the picker is the whole control.
  if (!auto && !chosen) {
    return (
      <>
        <p className="mt-0.5 mb-2 text-[12px] text-ink-muted">
          {lesson.kind === "PDF"
            ? "PDFs don't have a frame to take, so pick one here."
            : "Added automatically once a video is attached. Until then, pick one here."}
        </p>
        <ImageDrop
          name={`thumb-${lesson.id}`}
          value=""
          onChange={(value) => onPatch({ thumbnailUrl: value }, true)}
          hint="Drag a thumbnail in, paste it, or click to choose"
        />
      </>
    );
  }

  return (
    <>
      <p className="mt-0.5 mb-2 text-[12px] text-ink-muted">
        {chosen
          ? "Chosen by hand — this is what students see."
          : "Taken from the video. Nothing to do here."}
      </p>

      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={chosen || auto || ""}
          alt="What students see beside this lesson"
          className="h-14 w-24 shrink-0 rounded-md border border-subtle object-cover"
        />

        <div className="flex flex-wrap gap-1.5">
          {chosen ? (
            <button
              type="button"
              onClick={() => onPatch({ thumbnailUrl: "" }, true)}
              className="rounded-full border border-subtle px-2.5 py-1 text-[12px] font-semibold text-ink-secondary hover:border-strong hover:text-ink"
            >
              {auto ? "Go back to the video's still" : "Remove"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOverride((was) => !was)}
              aria-expanded={override}
              className="rounded-full border border-subtle px-2.5 py-1 text-[12px] font-semibold text-ink-secondary hover:border-strong hover:text-ink"
            >
              Use my own instead
            </button>
          )}
        </div>
      </div>

      {override && !chosen && (
        <div className="mt-2">
          <ImageDrop
            name={`thumb-${lesson.id}`}
            value=""
            onChange={(value) => {
              onPatch({ thumbnailUrl: value }, true);
              setOverride(false);
            }}
            hint="Drag a thumbnail in, paste it, or click to choose"
          />
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------------- the mark -- */

function SaveMark({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Didn't save";
  return (
    <span
      role="status"
      className={`text-[12px] font-semibold ${
        state === "error" ? "text-critical" : "text-ink-muted"
      }`}
    >
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ attachments -- */

/**
 * The files hanging off a lesson: a workbook, a swipe file, the slides.
 *
 * The list is written whole on every change — it is one JSON column, and it is never
 * edited by two people at once the way a course outline is.
 */
function Attachments({
  lesson,
  blob,
  canUpload,
  onChange,
}: {
  lesson: LessonNode;
  blob: boolean;
  canUpload: boolean;
  onChange: (attachments: Attachment[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const added: Attachment[] = [];
      for (const file of Array.from(files)) {
        const stored = await uploadFile(file, { blob });
        added.push({
          id: crypto.randomUUID(),
          name: stored.name,
          url: stored.url,
          size: stored.size,
          type: stored.type,
        });
      }
      onChange([...lesson.attachments, ...added]);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5">
      {lesson.attachments.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {lesson.attachments.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 rounded-lg border border-subtle bg-surface px-2.5 py-1.5"
            >
              <span aria-hidden className="text-[13px]">
                {markFor(file.type, file.name)}
              </span>
              <a
                href={`/api/attachment/${lesson.id}/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink hover:text-accent"
              >
                {file.name}
              </a>
              <span className="tabular shrink-0 text-[12px] text-ink-muted">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={() =>
                  onChange(lesson.attachments.filter((row) => row.id !== file.id))
                }
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded-md px-1.5 text-[12px] text-ink-muted hover:text-critical"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {!canUpload ? (
        <p className="text-[12px] text-ink-muted">
          Attaching files needs a <span className="font-mono">BLOB_READ_WRITE_TOKEN</span> —
          take it from your Blob store&apos;s <span className="font-mono">.env.local</span>{" "}
          tab, add it to the project and redeploy.
        </p>
      ) : (
      <label
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-subtle px-3 py-2 text-[13px] font-semibold text-ink-secondary transition-colors hover:border-strong hover:text-ink ${
          busy ? "opacity-60" : ""
        }`}
      >
        <span aria-hidden>⬆</span>
        {busy ? "Uploading…" : "Upload attachment"}
        <input
          type="file"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            void take(event.target.files);
            // Cleared so choosing the same file twice in a row still fires.
            event.target.value = "";
          }}
        />
      </label>
      )}

      {error && (
        <p role="alert" className="mt-1 text-[12px] text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

/** A mark for the file, from its type and then its extension. */
function markFor(type: string, name: string) {
  if (type.startsWith("image/")) return "🖼";
  if (type.startsWith("video/")) return "🎬";
  if (type.startsWith("audio/")) return "🎧";
  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "📄";
  if (/\.(zip|rar|7z)$/i.test(name)) return "🗜";
  if (/\.(xlsx?|csv|numbers)$/i.test(name)) return "▦";
  return "📎";
}
