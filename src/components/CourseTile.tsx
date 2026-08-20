import Link from "next/link";

import { formatDuration, type CourseCard } from "@/lib/catalog-types";
import { tintVars } from "@/lib/options";

import { ProgressBar, VisibilityPill } from "./ui";

/**
 * One box on the grid.
 *
 * Art on top, name, the line under it, and the bar. The bar is always there even at
 * zero — an empty one says "you have not started this", which is a different and more
 * useful statement than no bar at all.
 *
 * With no art uploaded the tile falls back to a tinted panel carrying the course's
 * initial, so a grid half-built still reads as a grid rather than a column of holes.
 */
export function CourseTile({
  course,
  href,
  children,
}: {
  course: CourseCard;
  href: string;
  /** The admin grid's `⋯` menu and drag handle. */
  children?: React.ReactNode;
}) {
  const tint = tintVars(course.accent);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-subtle bg-surface transition-colors hover:border-strong">
      {children}

      <Link href={href} className="block">
        <div className="relative aspect-video w-full overflow-hidden border-b border-subtle">
          {course.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="grid h-full w-full place-items-center"
              style={{ background: tint?.fill ?? "var(--surface-page)" }}
            >
              <span
                aria-hidden
                className="text-[32px] font-extrabold tracking-[-0.08em]"
                style={{ color: tint?.outline ?? "var(--text-muted)" }}
              >
                {course.title.trim().charAt(0).toUpperCase() || "•"}
              </span>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[16px] leading-tight">{course.title}</h2>
            {course.visibility !== "PUBLISHED" && (
              <span className="shrink-0 pt-0.5">
                <VisibilityPill visibility={course.visibility} />
              </span>
            )}
          </div>

          {course.description && (
            <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-secondary">
              {course.description}
            </p>
          )}

          <p className="mt-1.5 text-[12px] text-ink-muted">
            {course.chapters} {course.chapters === 1 ? "chapter" : "chapters"} ·{" "}
            {course.lessons} {course.lessons === 1 ? "lesson" : "lessons"}
            {course.seconds ? ` · ${formatDuration(course.seconds)}` : ""}
          </p>

          <div className="mt-3">
            <ProgressBar value={course.progress} accent={course.accent} />
          </div>
        </div>
      </Link>
    </article>
  );
}
