import Link from "next/link";

import { formatLessonLength, type ChapterNode, type LessonNode } from "@/lib/course";

import { LessonThumb } from "./LessonThumb";

/**
 * The contents of a course, as a student reads it.
 *
 * Three things a row can be: done, open, or not open yet. A drip-fed lesson that has
 * not come round shows the date it will rather than a bare padlock — "locked" with no
 * answer to "until when" is the part of drip feeding people hate.
 *
 * What is locked is decided in src/lib/catalog.ts against one clock read for the whole
 * request, so this and the player never disagree about whether a lesson is open. An
 * admin's map is empty: whoever runs the place has to be able to check a lesson the
 * day they write it, not a fortnight later.
 */
export function StudentOutline({
  chapters,
  basePath,
  done,
  locked,
  currentId,
}: {
  chapters: ChapterNode[];
  /** e.g. /h/main/c/start-here */
  basePath: string;
  done: Set<string>;
  /** Lesson id → the day it opens. */
  locked: Map<string, Date>;
  currentId?: string;
}) {
  return (
    <div className="space-y-4">
      {chapters.map((chapter, index) => (
        <section key={chapter.id}>
          <h3 className="flex items-baseline gap-2 text-[13px]">
            <span className="tabular text-ink-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">{chapter.title}</span>
          </h3>

          <ul className="mt-1.5 space-y-1">
            {chapter.lessons.map((lesson) => (
              <Row
                key={lesson.id}
                lesson={lesson}
                basePath={basePath}
                done={done.has(lesson.id)}
                current={lesson.id === currentId}
                opensAt={locked.get(lesson.id) ?? null}
              />
            ))}
            {chapter.lessons.length === 0 && (
              <li className="px-2 py-1.5 text-[12px] text-ink-muted">
                Nothing in this chapter yet.
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({
  lesson,
  basePath,
  done,
  current,
  opensAt,
}: {
  lesson: LessonNode;
  basePath: string;
  done: boolean;
  current: boolean;
  /** Set only while the lesson is still locked. */
  opensAt: Date | null;
}) {
  const length = formatLessonLength(lesson.durationSeconds);

  const inner = (
    <>
      {/* The tick stays where it was — it is the thing being scanned down the column,
          and it should not move because the lesson beside it gained a picture. */}
      <span
        aria-hidden
        className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${
          done ? "border-transparent text-page" : "border-subtle text-ink-muted"
        }`}
        style={done ? { background: "var(--status-good)" } : undefined}
      >
        {opensAt ? "🔒" : done ? "✓" : ""}
      </span>

      {/* A look at what they are about to watch. Shown for a locked lesson too — the
          whole row is dimmed, and seeing what is coming is the point of it. */}
      <LessonThumb lesson={lesson} size="md" />

      <span className="min-w-0 flex-1">
        {/* Two lines rather than truncated: the thumbnail takes width, and a title cut
            to "Sales Process Break…" is not a preview of anything. */}
        <span className="line-clamp-2 text-[13px] leading-snug font-semibold">
          {lesson.title}
        </span>
        {/* Only when there is something to say — an empty line here would push every
            row taller for nothing. */}
        {(opensAt || length) && (
          <span className="tabular mt-0.5 block text-[11px] text-ink-muted">
            {opensAt ? `Opens ${opensAt.toLocaleDateString()}` : length}
          </span>
        )}
      </span>
    </>
  );

  if (opensAt) {
    return (
      <li className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-1.5 text-ink-muted opacity-70">
        {inner}
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`${basePath}/${lesson.id}`}
        aria-current={current ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
          current
            ? "bg-accent-soft text-ink"
            : "text-ink-secondary hover:bg-page hover:text-ink"
        }`}
      >
        {inner}
      </Link>
    </li>
  );
}
