import { posterOf, type LessonNode } from "@/lib/course";

/**
 * The little frame beside a lesson in an outline.
 *
 * Shared by the editor's outline and the student's contents so the two never drift —
 * a lesson has one look, whoever is reading the list.
 *
 * The frame is drawn whether or not there is a picture in it. A row of thumbnails
 * where three lessons have art and two do not would otherwise have its titles start at
 * two different places, which reads as broken rather than as incomplete. The fallback
 * says what the lesson *is* instead: a video, a document, or nothing added yet.
 */
export function LessonThumb({
  lesson,
  size = "sm",
}: {
  lesson: Pick<
    LessonNode,
    "thumbnailUrl" | "posterUrl" | "kind" | "videoKind" | "title"
  >;
  /** `sm` in the editor's dense outline, `md` where it is a preview of what's next. */
  size?: "sm" | "md";
}) {
  const box = size === "md" ? "h-9 w-16" : "h-8 w-14";

  // A frame from the video for anything with one, a hand-picked thumbnail where
  // somebody chose one — see posterOf.
  const art = posterOf(lesson);

  if (art) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={art}
        alt=""
        className={`${box} shrink-0 rounded border border-subtle object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${box} grid shrink-0 place-items-center rounded border border-subtle bg-page text-[11px] text-ink-muted`}
    >
      {lesson.kind === "PDF" ? "PDF" : lesson.videoKind === "NONE" ? "—" : "▶"}
    </span>
  );
}
