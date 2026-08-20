import Link from "next/link";

import { StudentOutline } from "@/components/StudentOutline";
import { BTN_PRIMARY, Empty, ProgressBar } from "@/components/ui";
import { requireHub } from "@/lib/access";
import { loadCourseForStudent } from "@/lib/catalog";
import { FormattedBody } from "@/components/RichText";
import { courseSummary } from "@/lib/course";

export const dynamic = "force-dynamic";

/**
 * A course, before you are inside it: the art, the contents, and one button.
 *
 * The button says Start or Continue depending on what is already done, and points at
 * the first lesson that is neither finished nor locked — which is almost always the
 * one they actually want.
 */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string; courseSlug: string }>;
}) {
  const { slug, courseSlug } = await params;
  const { actor, hub } = await requireHub(slug);
  const { tree, progress, percent, lessons, completed } = await loadCourseForStudent(
    courseSlug,
    hub.id,
    actor,
  );

  // The first lesson that is neither finished nor still locked — almost always the
  // one they actually want.
  const flat = tree.chapters.flatMap((chapter) => chapter.lessons);
  const next =
    flat.find(
      (lesson) => !progress.done.has(lesson.id) && !progress.locked.has(lesson.id),
    ) ?? flat[0];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Link
        href={`/h/${slug}`}
        className="text-[13px] font-semibold text-ink-secondary hover:text-ink"
      >
        ← All courses
      </Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {tree.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tree.thumbnailUrl}
              alt=""
              className="aspect-video w-full rounded-2xl border border-subtle object-cover"
            />
          )}

          <h1 className="mt-4 text-[28px]">{tree.title}</h1>
          <p className="mt-1 text-[12px] text-ink-muted">{courseSummary(tree)}</p>

          {tree.description && (
            <FormattedBody
              text={tree.description}
              className="mt-3 max-w-2xl text-ink-secondary"
            />
          )}

          <div className="mt-4 max-w-md">
            <ProgressBar
              value={percent}
              accent={tree.accent}
              label={`${completed} of ${lessons} lessons`}
            />
          </div>

          {next && (
            <Link
              href={`/h/${slug}/c/${tree.slug}/${next.id}`}
              className={`${BTN_PRIMARY} mt-4`}
            >
              {completed === 0 ? "Start the course" : "Continue where you left off"}
            </Link>
          )}
        </div>

        <aside className="rounded-2xl border border-subtle bg-surface p-4">
          <h2 className="text-[14px]">Contents</h2>
          <div className="mt-3">
            {lessons === 0 ? (
              <Empty title="Nothing here yet">
                This course is still being put together.
              </Empty>
            ) : (
              <StudentOutline
                chapters={tree.chapters}
                basePath={`/h/${slug}/c/${tree.slug}`}
                done={progress.done}
                locked={progress.locked}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
