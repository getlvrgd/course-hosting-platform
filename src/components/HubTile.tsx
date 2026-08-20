import Link from "next/link";

import { statusLabel, tintVars } from "@/lib/options";

export type HubCard = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  thumbnailUrl: string | null;
  accent: string;
  status: string;
  courses: number;
  lessons: number;
  students: number;
};

/**
 * One offer on the directory.
 *
 * The same shape as a course tile, on purpose: the directory is the grid one level up,
 * and the gesture of scanning a wall of boxes and going into one should feel identical
 * whether the boxes are offers or the courses inside them.
 */
export function HubTile({
  hub,
  children,
}: {
  hub: HubCard;
  /** The drag handle and `⋯`. */
  children?: React.ReactNode;
}) {
  const tint = tintVars(hub.accent);
  const live = hub.status === "LIVE";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-subtle bg-surface transition-colors hover:border-strong">
      {children}

      <Link href={`/h/${hub.slug}`} className="block">
        <div className="relative aspect-video w-full overflow-hidden border-b border-subtle">
          {hub.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hub.thumbnailUrl} alt="" className="h-full w-full object-cover" />
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
                {hub.name.trim().charAt(0).toUpperCase() || "•"}
              </span>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[16px] leading-tight">{hub.name}</h2>
            <span className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-[12px] font-semibold text-ink-secondary">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{
                  background: live
                    ? "var(--status-good)"
                    : hub.status === "ARCHIVED"
                      ? "var(--text-muted)"
                      : "var(--series-4)",
                }}
              />
              {statusLabel(hub.status)}
            </span>
          </div>

          {hub.description && (
            <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-secondary">
              {hub.description}
            </p>
          )}

          <p className="mt-2 text-[12px] text-ink-muted">
            {hub.courses} {hub.courses === 1 ? "course" : "courses"} · {hub.lessons}{" "}
            {hub.lessons === 1 ? "lesson" : "lessons"} · {hub.students}{" "}
            {hub.students === 1 ? "student" : "students"}
          </p>
        </div>
      </Link>
    </article>
  );
}
